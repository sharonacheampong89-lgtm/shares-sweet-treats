const Stripe = require('stripe');
const { Resend } = require('resend');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'sharonacheampong89@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || "Share's Sweet Treats <onboarding@resend.dev>";

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
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
