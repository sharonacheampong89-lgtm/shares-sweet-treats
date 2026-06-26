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
        .from('orders')
        .select('*')
        .order('created_at', { ascending:false })
        .limit(200);
      if(error) throw error;
      return res.status(200).json({orders:data || []});
    }

    if(req.method === 'PATCH'){
      const { id, status } = req.body || {};
      if(!id || !status) return res.status(400).json({error:'Missing order id or status.'});
      const { data, error } = await supabase
        .from('orders')
        .update({ order_status: status })
        .eq('id', id)
        .select('*')
        .single();
      if(error) throw error;
      return res.status(200).json({order:data});
    }

    res.setHeader('Allow','GET, PATCH');
    return res.status(405).json({error:'Method not allowed.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Admin orders failed.'});
  }
};
