const ORIGIN_ADDRESS = '3323 Mountainbrook Ave, North Charleston, SC 29420, USA';

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'shares-sweet-treats-delivery-calculator/1.0'
    }
  });
  if (!response.ok) throw new Error('Address lookup failed.');
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) throw new Error('Address could not be found. Please enter a full street address, city, state, and ZIP.');
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

function milesBetween(a, b) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function deliveryFeeCents(miles) {
  if (miles <= 5) return 500;
  if (miles <= 10) return 800;
  if (miles <= 15) return 1200;
  if (miles <= 20) return 1500;
  return null;
}

async function calculateDelivery(address) {
  if (!address) throw new Error('Delivery address is required.');
  const origin = await geocode(ORIGIN_ADDRESS);
  const destination = await geocode(address + ', USA');
  const miles = milesBetween(origin, destination);
  const feeCents = deliveryFeeCents(miles);
  return { miles, feeCents, available: feeCents !== null };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await calculateDelivery(req.body && req.body.address);
    if (!result.available) {
      return res.status(400).json({ available: false, miles: result.miles, error: 'This address is outside the 20-mile local delivery area.' });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ available: false, error: error.message || 'Could not calculate delivery distance.' });
  }
};

module.exports.calculateDelivery = calculateDelivery;
