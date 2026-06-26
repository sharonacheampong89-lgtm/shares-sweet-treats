let adminPassword = localStorage.getItem('sst_admin_password') || '';
let orders = [];

const money = n => '$' + Number(n || 0).toFixed(2);
const clean = v => String(v ?? '');

const statusOptions = [
  ['preparing', 'Preparing'],
  ['ready', 'Ready'],
  ['out_for_delivery', 'Out for Delivery'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['completed', 'Completed']
];

function normalizeStatus(status){
  const s = clean(status || 'paid').toLowerCase().trim();
  if(s === 'order received') return 'paid';
  if(s === 'new') return 'paid';
  return s;
}

function clearDashboardFilters(){
  const search = document.getElementById('searchBox');
  const filter = document.getElementById('statusFilter');
  if(search) search.value = '';
  if(filter) filter.value = 'all';
}

function orderNumber(order){
  if(order.order_id) return clean(order.order_id);
  const raw = clean(order.id || '').replace(/-/g,'').toUpperCase();
  return raw ? 'SST-' + raw.slice(0,6) : 'SST-ORDER';
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
  clearDashboardFilters();
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
  document.getElementById('statNew').textContent = filtered.filter(o => ['paid','new','order received'].includes(normalizeStatus(o.order_status))).length;
  document.getElementById('statCompleted').textContent = filtered.filter(o => ['completed','delivered'].includes(normalizeStatus(o.order_status))).length;
}

function renderOrders(){
  const searchBox = document.getElementById('searchBox');
  const statusFilter = document.getElementById('statusFilter');
  const q = (searchBox?.value || '').toLowerCase().trim();
  const status = statusFilter?.value || 'all';

  let filtered = orders.filter(o => {
    const searchable = [
      orderNumber(o),
      o.customer_name,
      o.email,
      o.phone,
      o.order_type,
      o.order_status,
      o.payment_status,
      o.delivery_address,
      o.address
    ].map(clean).join(' ').toLowerCase();
    return searchable.includes(q);
  });

  if(status !== 'all') {
    filtered = filtered.filter(o => normalizeStatus(o.order_status) === status);
  }

  renderStats(filtered);
  const list = document.getElementById('ordersList');
  if(!filtered.length){
    list.innerHTML = q
      ? '<p>No orders found. Clear the search box and click Refresh.</p>'
      : '<p>No orders found.</p>';
    return;
  }
  list.innerHTML = filtered.map(orderCard).join('');
}

function itemList(items){
  let arr = Array.isArray(items) ? items : [];
  return arr.map(i => `<li>${clean(i.qty || i.quantity || 1)} × ${clean(i.name)} ${i.price ? '— '+money(i.price) : ''}</li>`).join('') || '<li>No items listed</li>';
}

function plainItemList(items){
  let arr = Array.isArray(items) ? items : [];
  return arr.map(i => `${clean(i.qty || i.quantity || 1)} × ${clean(i.name)} ${i.price ? '— '+money(i.price) : ''}`).join('\n') || 'No items listed';
}

function formatStatus(status){
  return clean(status || 'paid').replaceAll('_',' ');
}

function orderCard(o){
  const num = orderNumber(o);
  return `<article class="order-card">
    <div class="order-top">
      <div>
        <span class="badge paid">${clean(o.payment_status || 'paid')}</span>
        <span class="badge">${formatStatus(o.order_status || 'paid')}</span>
        <h3>${num} • ${clean(o.customer_name || 'Customer')} — ${money(o.total)}</h3>
        <div class="meta">
          ${clean(o.email)} • ${clean(o.phone)}<br>
          ${clean(o.order_type)} ${o.delivery_distance ? '• '+o.delivery_distance+' miles' : ''}<br>
          ${clean(o.delivery_address || o.address || 'No shipping/delivery address collected.')}<br>
          ${new Date(o.created_at).toLocaleString()}
        </div>
      </div>
    </div>
    <ul class="items">${itemList(o.items)}</ul>
    ${o.notes ? `<p><strong>Notes:</strong> ${clean(o.notes)}</p>` : ''}
    <div class="actions">
      <button class="small" onclick="printSlip('${o.id}')">🖨 Print Slip</button>
      ${statusOptions.map(([value,label]) => `<button class="small" onclick="updateStatus('${o.id}','${value}')">${label}</button>`).join('')}
    </div>
    <small class="meta">Status buttons update Supabase and email the customer automatically.</small>
  </article>`;
}

function printSlip(id){
  const o = orders.find(order => order.id === id);
  if(!o){ alert('Order not found.'); return; }
  const win = window.open('', '_blank', 'width=720,height=900');
  const html = `<!doctype html>
  <html>
  <head>
    <title>Packing Slip ${orderNumber(o)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;color:#2b1a16;}
      h1{margin:0 0 4px;font-size:28px;}
      h2{font-size:18px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:6px;}
      .muted{color:#666;font-size:13px;}
      .box{border:1px solid #ddd;border-radius:12px;padding:16px;margin:14px 0;}
      pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;}
      .total{font-size:20px;font-weight:bold;}
      @media print{button{display:none} body{padding:0}}
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>Share's Sweet Treats</h1>
    <div class="muted">Packing Slip</div>
    <div class="box">
      <strong>Order:</strong> ${orderNumber(o)}<br>
      <strong>Status:</strong> ${formatStatus(o.order_status || 'paid')}<br>
      <strong>Date:</strong> ${new Date(o.created_at).toLocaleString()}<br>
      <strong>Type:</strong> ${clean(o.order_type)}
    </div>
    <h2>Customer</h2>
    <div class="box">
      <strong>${clean(o.customer_name || 'Customer')}</strong><br>
      ${clean(o.email)}<br>
      ${clean(o.phone)}<br>
      ${clean(o.delivery_address || o.address || '')}
    </div>
    <h2>Items</h2>
    <div class="box"><pre>${plainItemList(o.items)}</pre></div>
    <h2>Notes</h2>
    <div class="box">${clean(o.notes || 'No notes')}</div>
    <h2>Total</h2>
    <div class="total">${money(o.total)}</div>
  </body>
  </html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

async function updateStatus(id, status){
  try{
    const order = orders.find(o => o.id === id);
    const label = status.replaceAll('_',' ');
    const ok = confirm(`Update this order to "${label}" and email ${order?.email || 'the customer'}?`);
    if(!ok) return;

    const res = await fetch('/api/admin-orders', {
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({id,status,notifyCustomer:true})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not update status.');

    orders = orders.map(o => o.id === id ? (data.order || {...o, order_status: status}) : o);
    clearDashboardFilters();
    renderOrders();

    if(data.email?.error){
      alert('Status updated, but the customer email failed: ' + data.email.error);
    }else{
      alert('Status updated and customer email sent.');
    }

    await loadOrders();
  }catch(err){
    alert(err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('searchBox');
  const filter = document.getElementById('statusFilter');
  if(search) search.addEventListener('input', renderOrders);
  if(filter) filter.addEventListener('change', renderOrders);

  if(adminPassword){
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    clearDashboardFilters();
    loadOrders();
  }
});
