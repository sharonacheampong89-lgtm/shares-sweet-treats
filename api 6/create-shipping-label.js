const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const SHIPPO_API_URL = 'https://api.goshippo.com';
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || "Share's Sweet Treats <orders@sharessweettreats.com>";
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'orders@sharessweettreats.com';

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Supabase admin environment variables are missing.');
  return createClient(url, key);
}

function checkAdmin(req){
  const provided = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  return expected && provided && provided === expected;
}

function clean(value){
  return String(value || '').replace(/[<>]/g, '').trim();
}

function parseAddress(addressText){
  const raw = clean(addressText)
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);

  let street = '';
  let street2 = '';
  let city = '';
  let state = '';
  let zip = '';

  // Best format: Street, Apt/Suite/Lot, City, ST ZIP
  if(parts.length >= 4){
    street = parts[0];
    street2 = parts[1];
    city = parts[2];

    const last = parts.slice(3).join(' ');
    const match = last.match(/\b([A-Za-z]{2})\b\s*,?\s*(\d{5}(?:-\d{4})?)\b/);
    if(match){
      state = match[1].toUpperCase();
      zip = match[2];
    }
  }

  // Good format: Street, City, ST ZIP
  if((!street || !city || !state || !zip) && parts.length === 3){
    street = parts[0];
    city = parts[1];

    const match = parts[2].match(/\b([A-Za-z]{2})\b\s*,?\s*(\d{5}(?:-\d{4})?)\b/);
    if(match){
      state = match[1].toUpperCase();
      zip = match[2];
    }
  }

  // Format: Street, Apt, City ST ZIP
  if((!street || !city || !state || !zip) && parts.length === 3){
    street = parts[0];
    street2 = parts[1];

    const match = parts[2].match(/(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if(match){
      city = match[1].trim();
      state = match[2].toUpperCase();
      zip = match[3];
    }
  }

  // Format: Street, Apt City, ST, ZIP
  if((!street || !city || !state || !zip) && parts.length >= 4){
    street = parts[0];

    const stateMatch = parts.join(' ').match(/\b([A-Za-z]{2})\b\s*,?\s*(\d{5}(?:-\d{4})?)\b/);
    if(stateMatch){
      state = stateMatch[1].toUpperCase();
      zip = stateMatch[2];

      const beforeState = raw.split(stateMatch[0])[0].replace(/,\s*$/,'');
      const beforeParts = beforeState.split(',').map(p => p.trim()).filter(Boolean);
      street = beforeParts[0] || street;
      if(beforeParts.length >= 3){
        street2 = beforeParts[1];
        city = beforeParts.slice(2).join(' ');
      }else if(beforeParts.length === 2){
        const words = beforeParts[1].split(/\s+/);
        // If second part starts with lot/apt/unit, keep it as street2 and ask user to use full format if city is missing.
        if(/^(apt|apartment|unit|suite|ste|lot|#)/i.test(words[0] || '')){
          street2 = beforeParts[1];
        }else{
          city = beforeParts[1];
        }
      }
    }
  }

  // Last fallback: any full line ending in City ST ZIP
  if((!street || !city || !state || !zip)){
    const match = raw.match(/^(.+?),\s*(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if(match){
      street = match[1].trim();
      city = match[2].trim();
      state = match[3].toUpperCase();
      zip = match[4];
    }
  }

  return { street, street2, city, state, zip, raw };
}

function buildFromAddress(){
  return {
    name: process.env.SHIPPING_FROM_NAME || "Share's Sweet Treats",
    company: "Share's Sweet Treats",
    street1: process.env.SHIPPING_FROM_STREET || '',
    city: process.env.SHIPPING_FROM_CITY || 'North Charleston',
    state: process.env.SHIPPING_FROM_STATE || 'SC',
    zip: process.env.SHIPPING_FROM_ZIP || '29420',
    country: 'US',
    phone: process.env.SHIPPING_FROM_PHONE || '',
    email: process.env.SHIPPING_FROM_EMAIL || OWNER_EMAIL
  };
}

function buildToAddress(order){
  const parsed = parseAddress(order.delivery_address || order.address || '');
  return {
    name: clean(order.customer_name || 'Customer'),
    street1: parsed.street,
    street2: parsed.street2,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    country: 'US',
    phone: clean(order.phone || ''),
    email: clean(order.email || '')
  };
}

function itemUnits(item){
  const qty = Math.max(1, Number(item.qty || item.quantity || 1));
  const count = Math.max(1, Number(item.bundleCount || 1));
  return qty * count;
}

function estimatePackage(items){
  let units = 0;
  let oz = 8;

  for(const item of items || []){
    const name = String(item.name || '').toLowerCase();
    const count = itemUnits(item);
    units += count;

    if(name.includes('cookie')) oz += count * 3;
    else if(name.includes('cupcake')) oz += count * 4;
    else if(name.includes('brownie')) oz += count * 4;
    else if(name.includes('cinnamon')) oz += count * 6;
    else if(name.includes('bread')) oz += count * 16;
    else if(name.includes('cake')) oz += count * 12;
    else oz += count * 4;
  }

  const weightLb = Math.max(1, Math.ceil(oz / 16));

  let length = 10, width = 8, height = 4;
  if(units > 6 && units <= 12){ length = 12; width = 10; height = 6; }
  if(units > 12){ length = 14; width = 12; height = 6; }

  return {
    length: String(length),
    width: String(width),
    height: String(height),
    distance_unit: 'in',
    weight: String(weightLb),
    mass_unit: 'lb'
  };
}

async function shippoRequest(path, body){
  if(!process.env.SHIPPO_API_KEY) throw new Error('SHIPPO_API_KEY is missing in Vercel.');

  const response = await fetch(`${SHIPPO_API_URL}${path}`, {
    method:'POST',
    headers:{
      Authorization:`ShippoToken ${process.env.SHIPPO_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body)
  });

  const data = await response.json();

  if(!response.ok){
    const message = data?.detail || data?.message || JSON.stringify(data);
    throw new Error(message || 'Shippo request failed.');
  }

  return data;
}

async function createShipment(order){
  const addressFrom = buildFromAddress();
  const addressTo = buildToAddress(order);

  if(!addressFrom.street1) {
    throw new Error('Missing SHIPPING_FROM_STREET in Vercel. A real return address is required to buy USPS labels.');
  }

  if(!addressTo.street1 || !addressTo.city || !addressTo.state || !addressTo.zip) {
    throw new Error(
      'Customer shipping address is incomplete. Click Edit Address and use this format: Street, Apt/Lot, City, ST ZIP. Example: 1365 Brashiers Chapel Rd, Lot 19, Arab, AL 35016.'
    );
  }

  return shippoRequest('/shipments/', {
    address_from: addressFrom,
    address_to: addressTo,
    parcels: [estimatePackage(order.items || [])],
    async: false
  });
}

function chooseRate(rates, order){
  const valid = (rates || [])
    .filter(r => String(r.currency || '').toUpperCase() === 'USD' && r.object_id)
    .sort((a,b) => Number(a.amount || 0) - Number(b.amount || 0));

  const selectedText = JSON.stringify(order.items || []).toLowerCase();

  // Try to match what the customer paid for first.
  let preferred = valid.find(r => {
    const provider = String(r.provider || '').toLowerCase();
    const service = String(r.servicelevel?.name || r.service || '').toLowerCase();
    return selectedText.includes(provider) && selectedText.includes(service.split(' ')[0]);
  });

  if(preferred) return preferred;

  // Otherwise pick the cheapest USPS option.
  const usps = valid.filter(r => String(r.provider || '').toUpperCase().includes('USPS'));
  return usps[0] || valid[0] || null;
}

async function createTransaction(rate){
  return shippoRequest('/transactions/', {
    rate: rate.object_id,
    label_file_type: 'PDF',
    async: false
  });
}

async function sendTrackingEmail(order, transaction, carrier, service){
  if(!process.env.RESEND_API_KEY || !order.email) return { skipped:true };

  const trackingNumber = transaction.tracking_number || '';
  const trackingUrl = transaction.tracking_url_provider || '';
  const label = carrier && service ? `${carrier} ${service}` : 'USPS';

  const subject = `Share's Sweet Treats shipping update - Tracking ${trackingNumber}`;
  const text = `Hi ${order.customer_name || 'there'},\n\nYour Share's Sweet Treats order has shipped.\n\nCarrier: ${label}\nTracking number: ${trackingNumber}\nTracking link: ${trackingUrl}\n\nThank you for supporting our small business!\n\nWith love,\nShare's Sweet Treats`;

  const html = `
    <h2>Your order has shipped! 📦</h2>
    <p>Hi ${clean(order.customer_name || 'there')},</p>
    <p>Your Share's Sweet Treats order has shipped.</p>
    <p><strong>Carrier:</strong> ${clean(label)}<br>
    <strong>Tracking number:</strong> ${clean(trackingNumber)}</p>
    ${trackingUrl ? `<p><a href="${trackingUrl}">Track your package</a></p>` : ''}
    <p>Thank you for supporting our small business!</p>
    <p>With love,<br><strong>Share's Sweet Treats</strong></p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: order.email,
    reply_to: OWNER_EMAIL,
    subject,
    html,
    text
  });

  return { sent:true };
}

module.exports = async function handler(req, res){
  try{
    if(!checkAdmin(req)) return res.status(401).json({error:'Unauthorized. Check your admin password.'});

    if(req.method !== 'POST'){
      res.setHeader('Allow','POST');
      return res.status(405).json({error:'Method not allowed.'});
    }

    const { id } = req.body || {};
    if(!id) return res.status(400).json({error:'Missing order id.'});

    const supabase = getSupabaseAdmin();

    const { data:order, error:orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if(orderError) throw orderError;
    if(!order) return res.status(404).json({error:'Order not found.'});

    if(order.label_url && order.tracking_number) {
      return res.status(200).json({order, already_created:true});
    }

    if(!String(order.order_type || '').toLowerCase().includes('shipping')) {
      return res.status(400).json({error:'Shipping labels can only be created for Mail Shipping orders.'});
    }

    const shipment = await createShipment(order);
    const rate = chooseRate(shipment.rates, order);

    if(!rate) throw new Error('No Shippo shipping rates available for this order.');

    const transaction = await createTransaction(rate);

    if(transaction.status !== 'SUCCESS'){
      const messages = (transaction.messages || []).map(m => m.text || m.message).filter(Boolean).join(' ');
      throw new Error(messages || `Shippo transaction failed with status: ${transaction.status}`);
    }

    const updates = {
      tracking_number: transaction.tracking_number || '',
      tracking_url: transaction.tracking_url_provider || '',
      label_url: transaction.label_url || '',
      carrier: rate.provider || 'USPS',
      shipping_service: rate.servicelevel?.name || rate.service || '',
      shippo_transaction_id: transaction.object_id || '',
      shipping_label_created_at: new Date().toISOString(),
      order_status: 'shipped'
    };

    const { data:updated, error:updateError } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if(updateError) throw updateError;

    let email = { skipped:true };
    try{
      email = await sendTrackingEmail(updated, transaction, updates.carrier, updates.shipping_service);
    }catch(emailError){
      console.error('Tracking email failed:', emailError);
      email = { error: emailError.message || 'Tracking email failed.' };
    }

    return res.status(200).json({order:updated, transaction, rate, email});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Create shipping label failed.'});
  }
};
