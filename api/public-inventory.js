const { createClient } = require('@supabase/supabase-js');

function getSupabase(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Supabase public environment variables are missing.');
  return createClient(url, key);
}

module.exports = async function handler(req, res){
  try{
    if(req.method !== 'GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json({error:'Method not allowed.'});
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('inventory')
      .select('id,name,category,price,stock,sold_out,active')
      .eq('active', true)
      .order('category', { ascending:true })
      .order('name', { ascending:true });

    if(error) throw error;

    return res.status(200).json({items:data || []});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:error.message || 'Could not load inventory.'});
  }
};
