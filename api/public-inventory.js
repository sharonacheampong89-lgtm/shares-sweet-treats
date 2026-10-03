const { createClient } = require('@supabase/supabase-js');

function getSupabase(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!url || !key){
    throw new Error(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel.'
    );
  }

  return createClient(url, key);
}

module.exports = async function handler(req, res){
  try{
    if(req.method !== 'GET'){
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: 'Method not allowed.'
      });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('inventory')
      .select(`
        id,
        name,
        category,
        price,
        stock,
        sold_out,
        active
      `)
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if(error){
      console.error('PUBLIC INVENTORY SUPABASE ERROR:', error);
      throw new Error(error.message);
    }

    return res.status(200).json({
      items: data || []
    });

  }catch(error){
    console.error('PUBLIC INVENTORY ERROR:', error);

    return res.status(500).json({
      error: error.message || 'Could not load inventory.'
    });
  }
};
