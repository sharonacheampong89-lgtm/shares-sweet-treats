const SHIPPO_API_URL = 'https://api.goshippo.com/shipments/';

function clean(value){
  return String(value || '').replace(/[<>]/g, '').trim();
}

function itemUnits(item){
  const qty = Math.max(1, Number(item.qty || 1));
  const count = Math.max(1, Number(item.bundleCount || 1));
  return qty * count;
}

function estimatePackage(items){
  let units = 0;
  let oz = 8; // packaging buffer

  for(const item of items || []){
    const name = String(item.baseName || item.name || '').toLowerCase();
    const cat = String(item.cat || item.category || '').toLowerCase();
    const count = itemUnits(item);
    units += count;

    if(cat.includes('cookie') || name.includes('cookie')) oz += count * 3;
    else if(cat.includes('cupcake') || name.includes('cupcake')) oz += count * 4;
    else if(cat.includes('brownie') || name.includes('brownie')) oz += count * 4;
    else if(cat.includes('cinnamon') || name.includes('cinnamon')) oz += count * 6;
    else if(cat.includes('bread') || name.includes('bread')) oz += count * 16;
    else if(cat.includes('cake') || name.includes('cake')) oz += count * 12;
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

function buildFromAddress(){
  return {
    name: process.env.SHIPPING_FROM_NAME || "Share's Sweet Treats",
    company: "Share's Sweet Treats",
    street1: process.env.SHIPPING_FROM_STREET || 'North Charleston',
    city: process.env.SHIPPING_FROM_CITY || 'North Charleston',
    state: process.env.SHIPPING_FROM_STATE || 'SC',
    zip: process.env.SHIPPING_FROM_ZIP || '29420',
    country: 'US',
    phone: process.env.SHIPPING_FROM_PHONE || '',
    email: process.env.SHIPPING_FROM_EMAIL || process.env.OWNER_EMAIL || ''
  };
}

function buildToAddress(address, customer){
  return {
    name: clean(customer?.name) || 'Customer',
    street1: clean(address?.street),
    street2: clean(address?.apt),
    city: clean(address?.city),
    state: clean(address?.state),
    zip: clean(address?.zip),
    country: 'US',
    phone: clean(customer?.phone),
    email: clean(customer?.email)
  };
}

async function getShippoRates({address, customer, items}){
  if(!process.env.SHIPPO_API_KEY) throw new Error('Shippo API key is missing in Vercel.');

  const body = {
    address_from: buildFromAddress(),
    address_to: buildToAddress(address, customer),
    parcels: [estimatePackage(items)],
    async: false
  };

  const response = await fetch(SHIPPO_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${process.env.SHIPPO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if(!response.ok){
    const message = data?.detail || data?.message || JSON.stringify(data);
    throw new Error(message || 'Shippo rate request failed.');
  }

  const rates = (data.rates || [])
    .filter(rate => String(rate.currency || '').toUpperCase() === 'USD')
    .map(rate => ({
      objectId: rate.object_id,
      provider: rate.provider || '',
      service: rate.servicelevel?.name || rate.servicelevel?.token || rate.service || 'Shipping',
      serviceToken: rate.servicelevel?.token || '',
      amount: Number(rate.amount || 0),
      amountCents: Math.round(Number(rate.amount || 0) * 100),
      estimatedDays: rate.estimated_days || null,
      durationTerms: rate.duration_terms || ''
    }))
    .filter(rate => rate.amountCents > 0)
    .sort((a,b) => a.amountCents - b.amountCents)
    .slice(0, 6);

  return { rates, parcel: body.parcels[0] };
}

module.exports = async function handler(req, res){
  try{
    if(req.method !== 'POST'){
      res.setHeader('Allow','POST');
      return res.status(405).json({error:'Method not allowed.'});
    }

    const { address, customer, items } = req.body || {};
    if(!address?.street || !address?.city || !address?.state || !address?.zip){
      return res.status(400).json({error:'Complete shipping address is required.'});
    }
    if(!Array.isArray(items) || !items.length){
      return res.status(400).json({error:'Cart is empty.'});
    }

    const result = await getShippoRates({address, customer, items});
    return res.status(200).json(result);
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Could not calculate shipping rates.'});
  }
};

module.exports.getShippoRates = getShippoRates;
