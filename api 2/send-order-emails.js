const Stripe = require('stripe');
const { Resend } = require('resend');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'sharonacheampong89@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || "Share's Sweet Treats <onboarding@resend.dev>";

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

function serviceFeeCents(session) {
  return Number(session.metadata?.service_fee || 0);
}

function tipCents(session) {
  return Number(session.metadata?.tip || 0);
}

function productLineItems(items) {
  return items.data
    .filter((item) => {
      const name = String(item.description || item.price?.product?.name || '').toLowerCase();
      return !name.includes('delivery fee') && !name.includes('shipping fee') && !name.includes('optional tip');
    })
    .map((item) => ({
      name: item.description || item.price?.product?.name || 'Menu item',
      quantity: item.quantity,
      amount_total: dollars(item.amount_total),
      unit_amount: item.quantity ? dollars(item.amount_total / item.quantity) : dollars(item.amount_total)
    }));
}

async function saveOrderToSupabase(session, items) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('Supabase is not configured. Skipping order save.');
    return { saved: false, reason: 'Supabase not configured' };
  }

  const base = url.replace(/\/$/, '');
  const existing = await fetch(`${base}/rest/v1/orders?stripe_session_id=eq.${encodeURIComponent(session.id)}&select=id`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (existing.ok) {
    const rows = await existing.json();
    if (Array.isArray(rows) && rows.length) {
      return { saved: true, duplicate: true };
    }
  }

  const customerEmail = session.customer_details?.email || session.customer_email || '';
  const customerName = session.metadata?.customer_name || session.customer_details?.name || '';
  const customerPhone = session.customer_details?.phone || session.metadata?.phone || '';
  const orderType = session.metadata?.order_type || '';
  const address = buildShippingText(session);
  const serviceFee = serviceFeeCents(session);
  const tip = tipCents(session);
  const productSubtotalCents = productLineItems(items).reduce((sum, item) => sum + Math.round(Number(item.amount_total || 0) * 100), 0);

  const payload = {
    customer_name: customerName,
    email: customerEmail,
    phone: customerPhone,
    address,
    order_type: orderType,
    delivery_fee: orderType === 'Local Delivery' ? dollars(serviceFee) : 0,
    shipping_fee: orderType === 'Mail Shipping' ? dollars(serviceFee) : 0,
    tip: dollars(tip),
    subtotal: dollars(productSubtotalCents),
    total: dollars(session.amount_total),
    payment_status: session.payment_status || 'paid',
    order_status: 'New',
    items: productLineItems(items),
    delivery_distance: session.metadata?.delivery_miles ? Number(session.metadata.delivery_miles) : null,
    delivery_address: orderType === 'Local Delivery' ? address : null,
    notes: session.metadata?.notes || '',
    stripe_session_id: session.id
  };

  const response = await fetch(`${base}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Could not save order to Supabase: ${errorText}`);
  }

  return { saved: true };
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

    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment is not marked paid yet.' });
    }

    const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });

    // Save the paid order to Supabase first, even if emails were already sent.
    await saveOrderToSupabase(session, items);

    if (session.metadata?.emails_sent === 'yes') {
      return res.status(200).json({ ok: true, message: 'Order saved. Emails already sent.' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(200).json({ ok: true, message: 'Order saved. RESEND_API_KEY missing, so emails were skipped.' });
    }

    const itemText = buildItemsText(items);
    const itemHtml = buildItemsHtml(items);

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
      metadata: { ...session.metadata, emails_sent: 'yes', order_saved: 'yes' }
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Unable to save order or send order emails.' });
  }
};
