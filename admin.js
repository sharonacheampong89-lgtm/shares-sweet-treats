let adminPassword = localStorage.getItem('sst_admin_password') || '';
let orders = [];

const money = n => '$' + Number(n || 0).toFixed(2);
const clean = v => String(v ?? '');

async function loginAdmin(){
  const input = document.getElementById('adminPassword');
  const error = document.getElementById('loginError');
  const password = input.value.trim();
  if(!password){ error.textContent = 'Enter your admin password.'; return; }
  adminPassword = password;
  localStorage.setItem('sst_admin_password', password);
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  await loadOrders();
}

function logoutAdmin(){
  localStorage.removeItem('sst_admin_password');
  adminPassword='';
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('loginCard').classList.remove('hidden');
}

async function loadOrders(){
  const list = document.getElementById('ordersList');
  list.innerHTML = '<p>Loading orders...</p>';
  try{
    const res = await fetch('/api/admin-orders', { headers: { 'x-admin-password': adminPassword }});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not load orders.');
    orders = data.orders || [];
    renderOrders();
  }catch(err){
    list.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderStats(filtered){
  document.getElementById('statOrders').textContent = filtered.length;
  document.getElementById('statSales').textContent = money(filtered.reduce((s,o)=>s+Number(o.total||0),0));
  document.getElementById('statNew').textContent = filtered.filter(o => ['paid','new','order received'].includes(clean(o.order_status).toLowerCase())).length;
  document.getElementById('statCompleted').textContent = filtered.filter(o => clean(o.order_status).toLowerCase()==='completed').length;
}

function renderOrders(){
  const q = document.getElementById('searchBox').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  let filtered = orders.filter(o => (clean(o.customer_name)+clean(o.email)+clean(o.phone)+clean(o.order_type)+clean(o.order_status)).toLowerCase().includes(q));
  if(status !== 'all') filtered = filtered.filter(o => clean(o.order_status).toLowerCase() === status);
  renderStats(filtered);
  const list = document.getElementById('ordersList');
  if(!filtered.length){ list.innerHTML = '<p>No orders found.</p>'; return; }
  list.innerHTML = filtered.map(orderCard).join('');
}

function itemList(items){
  let arr = Array.isArray(items) ? items : [];
  return arr.map(i => `<li>${clean(i.qty || i.quantity || 1)} × ${clean(i.name)} ${i.price ? '— '+money(i.price) : ''}</li>`).join('') || '<li>No items listed</li>';
}

function orderCard(o){
  const status = clean(o.order_status || 'paid').toLowerCase();
  return `<article class="order-card">
    <div class="order-top">
      <div>
        <span class="badge paid">${clean(o.payment_status || 'paid')}</span>
        <span class="badge">${clean(o.order_status || 'paid')}</span>
        <h3>${clean(o.customer_name || 'Customer')} — ${money(o.total)}</h3>
        <div class="meta">
          ${clean(o.email)} • ${clean(o.phone)}<br>
          ${clean(o.order_type)} ${o.delivery_distance ? '• '+o.delivery_distance+' miles' : ''}<br>
          ${clean(o.delivery_address || o.address || '')}<br>
          ${new Date(o.created_at).toLocaleString()}
        </div>
      </div>
    </div>
    <ul class="items">${itemList(o.items)}</ul>
    ${o.notes ? `<p><strong>Notes:</strong> ${clean(o.notes)}</p>` : ''}
    <div class="actions">
      ${['preparing','ready','out_for_delivery','completed'].map(s => `<button class="small" onclick="updateStatus('${o.id}','${s}')">${s.replaceAll('_',' ')}</button>`).join('')}
    </div>
  </article>`;
}

async function updateStatus(id, status){
  try{
    const res = await fetch('/api/admin-orders', {
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({id,status})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not update status.');
    await loadOrders();
  }catch(err){ alert(err.message); }
}

if(adminPassword){
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadOrders();
  });
}
