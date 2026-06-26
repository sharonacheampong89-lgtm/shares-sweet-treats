let adminPassword = localStorage.getItem('sst_admin_password') || '';
let orders = [];

const money = n => '$' + Number(n || 0).toFixed(2);
const clean = v => String(v ?? '');
const escapeHtml = v => clean(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const statusOptions = [
  ['preparing', 'Preparing'],
  ['ready', 'Ready'],
  ['out_for_delivery', 'Out for Delivery'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['completed', 'Completed']
];

function orderNumber(o){
  if(o.order_id) return clean(o.order_id);
  const id = clean(o.id).replace(/-/g, '').toUpperCase();
  return 'SST-' + (id ? id.slice(-6) : Date.now().toString().slice(-6));
}

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
    list.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function renderStats(filtered){
  document.getElementById('statOrders').textContent = filtered.length;
  document.getElementById('statSales').textContent = money(filtered.reduce((s,o)=>s+Number(o.total||0),0));
  document.getElementById('statNew').textContent = filtered.filter(o => ['paid','new','order received'].includes(clean(o.order_status).toLowerCase())).length;
  document.getElementById('statCompleted').textContent = filtered.filter(o => ['completed','delivered'].includes(clean(o.order_status).toLowerCase())).length;
}

function renderOrders(){
  const q = (document.getElementById('searchBox')?.value || '').toLowerCase().trim();
  const status = document.getElementById('statusFilter')?.value || 'all';
  let filtered = orders.filter(o => (
    orderNumber(o)+clean(o.customer_name)+clean(o.email)+clean(o.phone)+clean(o.order_type)+clean(o.order_status)
  ).toLowerCase().includes(q));
  if(status !== 'all') filtered = filtered.filter(o => clean(o.order_status || 'paid').toLowerCase() === status);
  renderStats(filtered);
  const list = document.getElementById('ordersList');
  if(!filtered.length){ list.innerHTML = '<p>No orders found.</p>'; return; }
  list.innerHTML = filtered.map(orderCard).join('');
}

function itemList(items){
  let arr = Array.isArray(items) ? items : [];
  return arr.map(i => `<li>${escapeHtml(i.qty || i.quantity || 1)} × ${escapeHtml(i.name || 'Item')} ${i.price ? '— '+money(i.price) : ''}</li>`).join('') || '<li>No items listed</li>';
}

function plainItemList(items){
  let arr = Array.isArray(items) ? items : [];
  return arr.map(i => `<tr><td>${escapeHtml(i.qty || i.quantity || 1)}</td><td>${escapeHtml(i.name || 'Item')}</td><td>${i.price ? money(i.price) : ''}</td></tr>`).join('') || '<tr><td colspan="3">No items listed</td></tr>';
}

function formatStatus(status){
  return clean(status || 'paid').replaceAll('_',' ');
}

function orderCard(o){
  const oid = escapeHtml(clean(o.id));
  return `<article class="order-card">
    <div class="order-top">
      <div>
        <span class="badge paid">${escapeHtml(o.payment_status || 'paid')}</span>
        <span class="badge">${escapeHtml(formatStatus(o.order_status || 'paid'))}</span>
        <h3>${escapeHtml(orderNumber(o))} • ${escapeHtml(o.customer_name || 'Customer')} — ${money(o.total)}</h3>
        <div class="meta">
          ${escapeHtml(o.email)} • ${escapeHtml(o.phone)}<br>
          ${escapeHtml(o.order_type)} ${o.delivery_distance ? '• '+escapeHtml(o.delivery_distance)+' miles' : ''}<br>
          ${escapeHtml(o.delivery_address || o.address || 'No shipping/delivery address collected.')}<br>
          ${o.created_at ? new Date(o.created_at).toLocaleString() : ''}
        </div>
      </div>
    </div>
    <ul class="items">${itemList(o.items)}</ul>
    ${o.notes ? `<p><strong>Notes:</strong> ${escapeHtml(o.notes)}</p>` : ''}
    <div class="actions">
      <button class="small" onclick="printSlip('${oid}')">Print Slip</button>
      ${statusOptions.map(([value,label]) => `<button class="small" onclick="updateStatus('${oid}','${value}')">${label}</button>`).join('')}
    </div>
    <small class="meta">Status buttons update Supabase and email the customer automatically.</small>
  </article>`;
}

function printSlip(id){
  const o = orders.find(x => clean(x.id) === clean(id));
  if(!o){ alert('Order not found.'); return; }
  const html = `<!doctype html><html><head><title>${escapeHtml(orderNumber(o))} Packing Slip</title>
    <style>
      body{font-family:Arial,sans-serif;margin:28px;color:#222} h1{color:#a62663;margin-bottom:0} .muted{color:#666}
      .box{border:1px solid #ddd;border-radius:12px;padding:16px;margin:16px 0} table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border-bottom:1px solid #eee;text-align:left;padding:10px} .total{font-size:20px;font-weight:700}.brand{text-align:center;margin-bottom:20px}
      @media print{button{display:none} body{margin:18px}}
    </style></head><body>
    <div class="brand"><h1>Share's Sweet Treats</h1><div class="muted">Packing Slip</div></div>
    <div class="box"><h2>${escapeHtml(orderNumber(o))}</h2>
      <p><strong>Status:</strong> ${escapeHtml(formatStatus(o.order_status || 'paid'))}<br>
      <strong>Order type:</strong> ${escapeHtml(o.order_type || '')}<br>
      <strong>Date:</strong> ${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</p>
    </div>
    <div class="box"><h3>Customer</h3>
      <p><strong>Name:</strong> ${escapeHtml(o.customer_name || '')}<br>
      <strong>Email:</strong> ${escapeHtml(o.email || '')}<br>
      <strong>Phone:</strong> ${escapeHtml(o.phone || '')}<br>
      <strong>Address:</strong><br>${escapeHtml(o.delivery_address || o.address || 'No shipping/delivery address collected.')}</p>
    </div>
    <div class="box"><h3>Items</h3><table><thead><tr><th>Qty</th><th>Item</th><th>Price</th></tr></thead><tbody>${plainItemList(o.items)}</tbody></table></div>
    ${o.notes ? `<div class="box"><h3>Notes</h3><p>${escapeHtml(o.notes)}</p></div>` : ''}
    <p class="total">Total: ${money(o.total)}</p>
    <button onclick="window.print()">Print</button>
    </body></html>`;
  const win = window.open('', '_blank');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

async function updateStatus(id, status){
  try{
    const order = orders.find(o => clean(o.id) === clean(id));
    const label = status.replaceAll('_',' ');
    const ok = confirm(`Update ${order ? orderNumber(order) : 'this order'} to "${label}" and email ${order?.email || 'the customer'}?`);
    if(!ok) return;

    const res = await fetch('/api/admin-orders', {
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({id,status,notifyCustomer:true})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not update status.');
    if(data.email?.error){
      alert('Status updated, but the customer email failed: ' + data.email.error);
    }else{
      alert('Status updated and customer email sent.');
    }
    document.getElementById('searchBox').value = '';
    document.getElementById('statusFilter').value = 'all';
    await loadOrders();
  }catch(err){ alert(err.message); }
}

window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.loadOrders = loadOrders;
window.renderOrders = renderOrders;
window.updateStatus = updateStatus;
window.printSlip = printSlip;

if(adminPassword){
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadOrders();
  });
}
