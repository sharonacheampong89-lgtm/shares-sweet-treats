const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { calculateDelivery } = require('./delivery-distance');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Supabase environment variables are missing.');
  return createClient(url, key);
}

function tipCents(value) {
  const dollars = Number(value || 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function hasNoShippingItem(items) {
  return items.some((item) => String(item.name || '').toLowerCase().includes('cheesecake'));
}

function baseBundleType(bundleType) {
  return String(bundleType || '').replace(/^custom_/, '');
}

function bundlePriceCents(category, bundleType) {
  const c = String(category || '').toLowerCase();
  const type = baseBundleType(bundleType);
  const customExtra = String(bundleType || '').startsWith('custom_') ? 100 : 0;

  if (c.includes('cookie')) {
    if (type === 'half_dozen') return 1500 + customExtra;
    if (type === 'dozen') return 2600 + customExtra;
  }
  if (c.includes('cupcake')) {
    if (type === 'half_dozen') return 1800 + customExtra;
    if (type === 'dozen') return 3400 + customExtra;
  }
  if (c.includes('brownie')) {
    if (type === 'half_dozen') return 1000 + customExtra;
    if (type === 'dozen') return 1800 + customExtra;
  }
  if (c.includes('cinnamon')) {
    if (type === 'half_dozen') return 1600 + customExtra;
    if (type === 'dozen') return 3000 + customExtra;
  }
  return null;
}

function bundleCount(bundleType) {
  const type = baseBundleType(bundleType);
  if (type === 'half_dozen') return 6;
  if (type === 'dozen') return 12;
  return 1;
}

function displayBundleType(bundleType) {
  const type = baseBundleType(bundleType);
  const custom = String(bundleType || '').startsWith('custom_') ? 'Custom ' : '';
  if (type === 'half_dozen') return `${custom}Half Dozen`;
  if (type === 'dozen') return `${custom}Dozen`;
  return '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe secret key is missing in Vercel.' });
    }

    const order = req.body || {};
    const customer = order.customer || {};
    const items = Array.isArray(order.items) ? order.items : [];

    if (!items.length) return res.status(400).json({ error: 'Cart is empty.' });
    if (!customer.email) return res.status(400).json({ error: 'Customer email is required.' });
    if (customer.orderType === 'Mail Shipping' && hasNoShippingItem(items)) {
      return res.status(400).json({ error: 'Cheesecake items are not available for shipping. Please choose Pickup or Local Delivery.' });
    }

    const supabase = getSupabaseAdmin();
    const names = [...new Set(items.map(item => String(item.baseName || item.name || '').replace(/\s*\((Half Dozen|Dozen)\)\s*$/i,'').trim()).filter(Boolean))];
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select('name,price,stock,sold_out,active')
      .in('name', names);

    if(inventoryError) throw inventoryError;

    const inventory = new Map((inventoryRows || []).map(row => [row.name, row]));

    const line_items = items.map((item) => {
      const baseName = String(item.baseName || item.name || '').replace(/\s*\((Half Dozen|Dozen)\)\s*$/i,'').trim();
      const inv = inventory.get(baseName);
      if (!inv) throw new Error(`Unknown menu item: ${baseName}`);
      if (inv.active === false) throw new Error(`${baseName} is not currently available.`);
      if (inv.sold_out) throw new Error(`${baseName} is currently sold out.`);

      const quantity = Math.max(1, Math.min(99, Number(item.qty || 1)));
      let unitAmount = Math.round(Number(inv.price || 0) * 100);
      let productName = baseName;
      let stockNeeded = quantity;

      if (item.bundle && item.bundleType) {
        const bundleCents = bundlePriceCents(inv.category || item.cat || item.category, item.bundleType);
        if (!bundleCents) throw new Error(`Invalid bundle option for ${baseName}.`);
        unitAmount = bundleCents;
        productName = `${baseName} (${displayBundleType(item.bundleType)})${item.customNotes ? ' - ' + String(item.customNotes).slice(0,120) : ''}`;
        stockNeeded = quantity * bundleCount(item.bundleType);
      }

      if (Number(inv.stock || 0) < stockNeeded) throw new Error(`Only ${inv.stock} available for ${baseName}.`);

      return {
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: { name: productName }
        }
      };
    });

    let serviceFee = 0;
    let serviceName = 'Service Fee';
    let deliveryMiles = '';

    if (customer.orderType === 'Local Delivery') {
      const delivery = await calculateDelivery(customer.address || '');
      if (!delivery.available) {
        return res.status(400).json({ error: 'This address is outside the 20-mile local delivery area. Please choose Pickup or Mail Shipping if eligible.' });
      }
      serviceFee = delivery.feeCents;
      deliveryMiles = delivery.miles.toFixed(1);
      serviceName = `Local Delivery Fee (${deliveryMiles} miles)`;
    } else if (customer.orderType === 'Mail Shipping') {
      serviceFee = 0;
      serviceName = 'Shipping quoted separately';
    }

    if (serviceFee > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: serviceFee,
          product_data: { name: serviceName }
        }
      });
    }

    const tip = tipCents(order.tip);
    if (tip > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: tip,
          product_data: { name: 'Optional Tip' }
        }
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: customer.email,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'auto',
      shipping_address_collection: customer.orderType === 'Pickup' ? undefined : { allowed_countries: ['US'] },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#checkout`,
      metadata: {
        order_id: String(order.id || ''),
        customer_name: String(customer.name || '').slice(0, 500),
        phone: String(customer.phone || '').slice(0, 500),
        order_type: String(customer.orderType || '').slice(0, 500),
        address: String(customer.address || '').slice(0, 500),
        preferred_date: customer.orderType === 'Mail Shipping' ? '' : String(customer.date || '').slice(0, 500),
        preferred_time: customer.orderType === 'Mail Shipping' ? '' : String(customer.time || '').slice(0, 500),
        notes: String(customer.notes || '').slice(0, 500),
        service_fee: String(serviceFee),
        delivery_miles: String(deliveryMiles),
        tip: String(tip),
        shipping_note: customer.orderType === 'Mail Shipping' ? 'Shipping will be quoted separately after order review and packing.' : ''
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Stripe checkout failed.' });
  }
};