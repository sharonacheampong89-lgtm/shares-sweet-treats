const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

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
  return String(value || '').replace(/[<>]/g, '');
}

function statusLabel(status){
  const labels = {
    paid: 'Order Received',
    new: 'Order Received',
    preparing: 'Preparing',
    ready: 'Ready',
    ready_for_pickup: 'Ready for Pickup',
    out_for_delivery: 'Out for Delivery',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed'
  };
  return labels[String(status || '').toLowerCase()] || String(status || 'Updated').replaceAll('_',' ');
}

function customerMessage(order, status){
  const name = clean(order.customer_name || 'there');
  const type = String(order.order_type || '').toLowerCase();
  const label = statusLabel(status);

  let message = `Hi ${name},\n\nYour Share's Sweet Treats order status has been updated to: ${label}.`;

  if(status === 'preparing') {
    message += `\n\nWe are preparing your treats now. Thank you for your patience!`;
  } else if(status === 'ready' || status === 'ready_for_pickup') {
    if(type.includes('pickup')) {
      message += `\n\nYour order is ready for pickup. Please check any pickup instructions previously provided.`;
    } else if(type.includes('delivery')) {
      message += `\n\nYour order is ready and will be sent out for local delivery soon.`;
    } else if(type.includes('shipping')) {
      message += `\n\nYour order is ready to ship. We will update you when it has shipped.`;
    } else {
      message += `\n\nYour order is ready.`;
    }
  } else if(status === 'out_for_delivery') {
    message += `\n\nYour order is out for local delivery.`;
  } else if(status === 'shipped') {
    message += `\n\nYour order has shipped. We will update you when it has been delivered.`;
  } else if(status === 'delivered') {
    message += `\n\nYour order has been delivered. Thank you for supporting our small business!`;
  } else if(status === 'completed') {
    message += `\n\nYour order is complete. Thank you for ordering from Share's Sweet Treats!`;
  }

  message += `\n\nWith love,\nShare's Sweet Treats`;
  return message;
}

function customerHtml(order, status){
  return customerMessage(order, status).split('\n').map(line => line ? `<p>${clean(line)}</p>` : '').join('');
}

async function sendStatusEmail(order, status){
  const customerEmail = order.email;
  if(!customerEmail || !process.env.RESEND_API_KEY) return { skipped:true };

  const subject = `Share's Sweet Treats order update — ${statusLabel(status)}`;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: customerEmail,
    reply_to: OWNER_EMAIL,
    subject,
    html: customerHtml(order, status),
    text: customerMessage(order, status)
  });
  return { sent:true };
}

module.exports = async function handler(req, res){
  try{
    if(!checkAdmin(req)) return res.status(401).json({error:'Unauthorized. Check your admin password.'});
    const supabase = getSupabaseAdmin();

    if(req.method === 'GET'){
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending:false })
        .limit(200);
      if(error) throw error;
      return res.status(200).json({orders:data || []});
    }

    if(req.method === 'PATCH'){
      const { id, status, notifyCustomer = true, address, delivery_address } = req.body || {};
      if(!id) return res.status(400).json({error:'Missing order id.'});

      const updates = {};
      if(status) updates.order_status = status;

      const newAddress = String(delivery_address || address || '').trim();
      if(newAddress){
        updates.address = newAddress;
        updates.delivery_address = newAddress;
      }

      if(!Object.keys(updates).length){
        return res.status(400).json({error:'Nothing to update.'});
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if(error) throw error;

      let email = { skipped:true };
      if(status && notifyCustomer){
        try{
          email = await sendStatusEmail(data, status);
        }catch(emailError){
          console.error('Status email failed:', emailError);
          email = { error: emailError.message || 'Status email failed' };
        }
      }

      return res.status(200).json({order:data, email});
    }

    res.setHeader('Allow','GET, PATCH');
    return res.status(405).json({error:'Method not allowed.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Admin orders failed.'});
  }
};
