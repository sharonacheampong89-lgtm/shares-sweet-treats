const Stripe = require('stripe');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'orders@sharessweettreats.com';
const FROM_EMAIL = process.env.FROM_EMAIL || "Share's Sweet Treats <orders@sharessweettreats.com>";

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function dollars(cents) {
  return Number(((Number(cents || 0)) / 100).toFixed(2));
}

function clean(value) {
  return String(value || '').replace(/[<>]/g, '');
}

function buildItemsText(items) {
  return items.data.map((item) => {
    const name = item.description || item.price?.product?.name || 'Menu item';
    return `${item.quantity} x ${name} — ${money(item.amount_total)}`;
  }).join('\n');
}

function buildItemsHtml(items) {
  return items.data.map((item) => {
    const name = clean(item.description || item.price?.product?.name || 'Menu item');
    return `<li>${item.quantity} x ${name} — <strong>${money(item.amount_total)}</strong></li>`;
  }).join('');
}

function buildItemsJson(items) {
  return items.data.map((item) => ({
    name: item.description || item.price?.product?.name || 'Menu item',
    quantity: item.quantity || 1,
    amount_total: dollars(item.amount_total),
    currency: item.currency || 'usd'
  }));
}

function buildShippingText(session) {
  const address = session.shipping_details?.address;
  if (!address) return 'No shipping/delivery address collected.';
  return [
    session.shipping_details?.name,
    address.line1,
    address.line2,
    `${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}`.trim(),
    address.country
  ].filter(Boolean).join('\n');
}

function buildShippingHtml(session) {
  return buildShippingText(session).replace(/\n/g, '<br>');
}

function shortItemsText(items, maxLength = 500) {
  const text = buildItemsText(items);
  return text.length <= maxLength ? text : text.slice(0, maxLength - 20) + '\n...more items';
}

async function sendOwnerSms({ customerName, customerPhone, orderType, preferredDate, preferredTime, total, items, sessionId }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.OWNER_PHONE;

  if (!sid || !token || !from || !to) {
    console.warn('Twilio environment variables missing. Skipping SMS.');
    return { skipped: true };
  }

  const body = [
    `🍪 NEW Share's Sweet Treats order`,
    `Total: ${total}`,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    `Type: ${orderType}`,
    `When: ${preferredDate} ${preferredTime}`,
    `Items:`,
    shortItemsText(items),
    `Stripe: ${sessionId}`
  ].join('\n');

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', from);
  params.append('Body', body.slice(0, 1500));

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Twilio SMS failed:', data);
    return { error: data.message || 'SMS failed' };
  }

  return { ok: true, sid: data.sid };
}

async function saveOrderToSupabase(session, items) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('Supabase environment variables are missing. Skipping order save.');
    return;
  }

  const customerEmail = session.customer_details?.email || session.customer_email || '';
  const customerName = session.metadata?.customer_name || session.customer_details?.name || 'Customer';
  const customerPhone = session.customer_details?.phone || session.metadata?.phone || '';
  const orderType = session.metadata?.order_type || '';
  const notes = session.metadata?.notes || '';
  const deliveryAddress = buildShippingText(session);

  const deliveryFee = Number(session.metadata?.delivery_fee || 0);
  const shippingFee = Number(session.metadata?.shipping_fee || 0);
  const tip = Number(session.metadata?.tip || 0);
  const subtotal = Number(session.metadata?.subtotal || 0);
  const deliveryDistance = Number(session.metadata?.delivery_distance || 0);
  const total = dollars(session.amount_total);

  const payload = {
    customer_name: customerName,
    email: customerEmail,
    phone: customerPhone,
    address: deliveryAddress,
    delivery_address: deliveryAddress,
    order_type: orderType,
    delivery_fee: deliveryFee,
    shipping_fee: shippingFee,
    tip,
    subtotal: subtotal || null,
    total,
    payment_status: session.payment_status || 'paid',
    order_status: 'New',
    items: buildItemsJson(items),
    delivery_distance: deliveryDistance || null,
    notes,
    stripe_session_id: session.id
  };

  const { error } = await supabase.from('orders').insert([payload]);
  if (error) {
    console.error('Supabase order insert failed:', error);
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY.' });
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Missing RESEND_API_KEY.' });

    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment is not marked paid yet.' });
    if (session.metadata?.emails_sent === 'yes') return res.status(200).json({ ok: true, message: 'Emails already sent.' });

    const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const itemText = buildItemsText(items);
    const itemHtml = buildItemsHtml(items);

    await saveOrderToSupabase(session, items);

    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.metadata?.customer_name || session.customer_details?.name || 'Customer';
    const customerPhone = session.customer_details?.phone || session.metadata?.phone || 'Not provided';
    const orderType = session.metadata?.order_type || 'Not provided';
    const preferredDate = session.metadata?.preferred_date || 'Not provided';
    const preferredTime = session.metadata?.preferred_time || 'Not provided';
    const notes = session.metadata?.notes || 'None';
    const total = money(session.amount_total);
    const orderId = session.id;

    const ownerSubject = `New paid order from ${customerName} — ${total}`;
    const customerSubject = `Share's Sweet Treats order confirmed — ${total}`;

    const ownerHtml = `
      <h2>🎉 New paid order received</h2>
      <p><strong>Total:</strong> ${total}</p>
      <p><strong>Customer:</strong> ${clean(customerName)}<br>
      <strong>Email:</strong> ${clean(customerEmail)}<br>
      <strong>Phone:</strong> ${clean(customerPhone)}</p>
      <p><strong>Order type:</strong> ${clean(orderType)}<br>
      <strong>Preferred date:</strong> ${clean(preferredDate)}<br>
      <strong>Preferred time:</strong> ${clean(preferredTime)}</p>
      <h3>Items</h3>
      <ul>${itemHtml}</ul>
      <h3>Address</h3>
      <p>${buildShippingHtml(session)}</p>
      <h3>Notes</h3>
      <p>${clean(notes)}</p>
      <p><small>Stripe session: ${orderId}</small></p>
    `;

    const customerHtml = `
      <h2>Thank you for ordering from Share's Sweet Treats! 💗</h2>
      <p>Hi ${clean(customerName)},</p>
      <p>We received your paid order. Thank you for supporting our small business!</p>
      <p><strong>Total paid:</strong> ${total}</p>
      <h3>Your order</h3>
      <ul>${itemHtml}</ul>
      <p><strong>Order type:</strong> ${clean(orderType)}<br>
      <strong>Preferred date:</strong> ${clean(preferredDate)}<br>
      <strong>Preferred time:</strong> ${clean(preferredTime)}</p>
      <p>If we need to confirm anything about your order, we will contact you using the email or phone number provided at checkout.</p>
      <p>With love,<br><strong>Share's Sweet Treats</strong></p>
    `;

    const ownerText = `New paid order received\n\nTotal: ${total}\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone}\nOrder type: ${orderType}\nPreferred date: ${preferredDate}\nPreferred time: ${preferredTime}\n\nItems:\n${itemText}\n\nAddress:\n${buildShippingText(session)}\n\nNotes:\n${notes}\n\nStripe session: ${orderId}`;

    const customerText = `Thank you for ordering from Share's Sweet Treats!\n\nTotal paid: ${total}\n\nYour order:\n${itemText}\n\nOrder type: ${orderType}\nPreferred date: ${preferredDate}\nPreferred time: ${preferredTime}\n\nWe will contact you if we need to confirm anything about your order.`;

    await resend.emails.send({ from: FROM_EMAIL, to: OWNER_EMAIL, reply_to: customerEmail, subject: ownerSubject, html: ownerHtml, text: ownerText });

    if (customerEmail) {
      await resend.emails.send({ from: FROM_EMAIL, to: customerEmail, reply_to: OWNER_EMAIL, subject: customerSubject, html: customerHtml, text: customerText });
    }

    const smsResult = await sendOwnerSms({ customerName, customerPhone, orderType, preferredDate, preferredTime, total, items, sessionId: orderId });

    await stripe.checkout.sessions.update(sessionId, {
      metadata: { ...session.metadata, emails_sent: 'yes', sms_sent: smsResult?.ok ? 'yes' : 'no' }
    });

    return res.status(200).json({ ok: true, sms: smsResult });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Unable to send order emails.' });
  }
};
