const Stripe = require('stripe');
const { Resend } = require('resend');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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

function getLineItemAmount(items, keywords) {
  return items.data.reduce((total, item) => {
    const name = String(item.description || item.price?.product?.name || '').toLowerCase();
    return keywords.some((keyword) => name.includes(keyword)) ? total + Number(item.amount_total || 0) : total;
  }, 0);
}

async function saveOrderToSupabase(session, items) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase is not configured. Skipping database save.');
    return;
  }

  const customerEmail = session.customer_details?.email || session.customer_email || '';
  const customerName = session.metadata?.customer_name || session.customer_details?.name || 'Customer';
  const customerPhone = session.customer_details?.phone || session.metadata?.phone || '';
  const orderType = session.metadata?.order_type || 'Not provided';
  const notes = session.metadata?.notes || '';
  const shippingAddress = buildShippingText(session);

  const deliveryFeeCents = getLineItemAmount(items, ['delivery fee', 'local delivery']);
  const shippingFeeCents = getLineItemAmount(items, ['shipping fee', 'mail shipping']);
  const tipCents = getLineItemAmount(items, ['tip']);

  const orderItems = items.data.map((item) => ({
    name: item.description || item.price?.product?.name || 'Menu item',
    quantity: item.quantity || 1,
    amount: dollars(item.amount_total),
    amount_cents: Number(item.amount_total || 0)
  }));

  const row = {
    customer_name: customerName,
    email: customerEmail,
    phone: customerPhone,
    address: shippingAddress,
    order_type: orderType,
    delivery_fee: dollars(deliveryFeeCents),
    shipping_fee: dollars(shippingFeeCents),
    tip: dollars(tipCents),
    subtotal: dollars(session.amount_subtotal || session.amount_total),
    total: dollars(session.amount_total),
    payment_status: session.payment_status || 'paid',
    order_status: 'New',
    items: orderItems,
    delivery_distance: session.metadata?.delivery_distance ? Number(session.metadata.delivery_distance) : null,
    delivery_address: shippingAddress,
    notes,
    stripe_session_id: session.id
  };

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase order save failed: ${message}`);
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY.' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Missing RESEND_API_KEY.' });
    }

    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment is not marked paid yet.' });
    }

    if (session.metadata?.emails_sent === 'yes') {
      return res.status(200).json({ ok: true, message: 'Emails already sent.' });
    }

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

    await resend.emails.send({
      from: FROM_EMAIL,
      to: OWNER_EMAIL,
      reply_to: customerEmail,
      subject: ownerSubject,
      html: ownerHtml,
      text: ownerText
    });

    if (customerEmail) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: customerEmail,
        reply_to: OWNER_EMAIL,
        subject: customerSubject,
        html: customerHtml,
        text: customerText
      });
    }

    await stripe.checkout.sessions.update(sessionId, {
      metadata: { ...session.metadata, emails_sent: 'yes' }
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Unable to send order emails.' });
  }
};
