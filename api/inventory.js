const { createClient } = require('@supabase/supabase-js');

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

module.exports = async function handler(req, res){
  try{
    if(!checkAdmin(req)) return res.status(401).json({error:'Unauthorized. Check your admin password.'});
    const supabase = getSupabaseAdmin();

    if(req.method === 'GET'){
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('category', { ascending:true })
        .order('name', { ascending:true });
      if(error) throw error;
      return res.status(200).json({items:data || []});
    }

    if(req.method === 'PATCH'){
      const { id, name, category, price, stock, sold_out, active } = req.body || {};
      if(!id) return res.status(400).json({error:'Missing inventory item id.'});

      const updates = {};
      if(name !== undefined) updates.name = String(name).slice(0, 200);
      if(category !== undefined) updates.category = String(category).slice(0, 200);
      if(price !== undefined) {
        const p = Number(price);
        if(!Number.isFinite(p) || p < 0) return res.status(400).json({error:'Price must be a valid number.'});
        updates.price = p;
      }
      if(stock !== undefined) {
        const s = Number(stock);
        if(!Number.isInteger(s) || s < 0) return res.status(400).json({error:'Stock must be a whole number.'});
        updates.stock = s;
      }
      if(sold_out !== undefined) updates.sold_out = Boolean(sold_out);
      if(active !== undefined) updates.active = Boolean(active);

      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if(error) throw error;

      return res.status(200).json({item:data});
    }

    res.setHeader('Allow','GET, PATCH');
    return res.status(405).json({error:'Method not allowed.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Inventory API failed.'});
  }
};