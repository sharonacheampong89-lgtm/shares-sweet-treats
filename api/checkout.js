const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const MENU = new Map([
  ['Classic Chocolate Chip', 325], ['Biscoff Cookie Butter', 325], ['Nutella Lava', 350], ['Sâ€™mores', 350],
  ['Strawberry Crunch', 325], ['Red Velvet White Chocolate', 325], ['Brown Butter Pecan', 350], ['Cookie Monster', 325], ['Lemon Sugar', 325],
  ['Vanilla Bean', 325], ['Chocolate Fudge', 325], ['Strawberry Crunch', 350], ['Biscoff Dream', 350], ['Nutella Hazelnut', 375], ['Banana Pudding', 375], ['Red Velvet', 375],
  ['Classic Fudge', 325], ['Nutella Swirl', 325], ['Biscoff Brownies', 325], ['Oreo Cheesecake Brownies', 325], ['Turtle Brownies', 325],
  ['Classic Glazed', 325], ['Biscoff Drizzle', 375], ['Strawberry Cheesecake', 400], ['Cookies & Cream', 450], ['Sugar Cheesecake', 450],
  ['Chocolate Luxe', 899], ['Strawberry Shortcake', 1099], ['Biscoff Crunch', 1099], ['Lemon Cake', 899], ['Nutella Dream', 899], ['Confetti Cake', 899],
  ['White Bread', 799], ['Honey Butter Bread', 999], ['Garlic Herb Bread', 999], ['Chocolate Chip Banana Bread', 1199], ['Cinnamon Swirl Bread', 1199],
  ['Cinnamon Sugar Pull-Apart', 1799], ['Garlic Parmesan Pull-Apart', 1999], ['Pizza Bread', 1999],
  ['Chocolate Drizzle', 69], ['Nutella Drizzle', 69], ['Oreo Crumble', 69], ['Extra Filling', 69]
]);

function deliveryFeeCents(orderType, milesValue) {
  const miles = Number(milesValue || 0);
  if (orderType !== 'Local Delivery') return 0;
  if (miles <= 5) return 500;
  if (miles <= 10) return 800;
  if (miles <= 15) return 1000;
  if (miles <= 20) return 1500;
  return 0;
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

    const line_items = items.map((item) => {
      const unit_amount = MENU.get(item.name);
      if (!unit_amount) throw new Error(`Unknown menu item: ${item.name}`);
      const quantity = Math.max(1, Math.min(99, Number(item.qty || 1)));
      return {
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount,
          product_data: { name: item.name }
        }
      };
    });

    const delivery = deliveryFeeCents(customer.orderType, customer.miles);
    if (delivery > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: delivery,
          product_data: { name: 'Local Delivery Fee' }
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
      shipping_address_collection: customer.orderType === 'Pickup' ? undefined : {
        allowed_countries: ['US']
      },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#checkout`,
      metadata: {
        order_id: String(order.id || ''),
        customer_name: String(customer.name || '').slice(0, 500),
        phone: String(customer.phone || '').slice(0, 500),
        order_type: String(customer.orderType || '').slice(0, 500),
        preferred_date: String(customer.date || '').slice(0, 500),
        preferred_time: String(customer.time || '').slice(0, 500),
        notes: String(customer.notes || '').slice(0, 500)
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Stripe checkout failed.' });
  }
};
