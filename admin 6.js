let adminPassword = localStorage.getItem('sst_admin_password') || '';
let orders = [];
let inventory = [];

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

function ensureInventorySection(){
  if(document.getElementById('inventorySection')) return;
  const dashboard = document.getElementById('dashboard');
  if(!dashboard) return;

  const section = document.createElement('section');
  section.id = 'inventorySection';
  section.className = 'inventory-section';
  section.innerHTML = `
    <h2>Inventory Manager</h2>
    <p class="meta">Update stock, sold-out status, prices, and item visibility.</p>
    <div class="inventory-tools">
      <input id="inventorySearch" placeholder="Search inventory..." oninput="renderInventory()">
      <select id="inventoryCategory" onchange="renderInventory()">
        <option value="all">All categories</option>
      </select>
      <button class="small" onclick="loadInventory()">Refresh Inventory</button>
    </div>
    <div id="inventoryList"><p>Loading inventory...</p></div>
  `;
  dashboard.appendChild(section);
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
  ensureInventorySection();
  await loadOrders();
  await loadInventory();
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

async function loadInventory(){
  ensureInventorySection();
  const list = document.getElementById('inventoryList');
  if(list) list.innerHTML = '<p>Loading inventory...</p>';
  try{
    const res = await fetch('/api/inventory', { headers: { 'x-admin-password': adminPassword }});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not load inventory.');
    inventory = data.items || [];
    renderInventoryCategories();
    renderInventory();
  }catch(err){
    if(list) list.innerHTML = `<p class="error">${err.message}</p>`;
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

function formatStatus(status){
  return clean(status || 'paid').replaceAll('_',' ');
}

function orderNumber(o){
  const id = clean(o.order_id || o.stripe_session_id || o.id || '');
  return 'SST-' + id.replace(/[^a-zA-Z0-9]/g,'').slice(-6).toUpperCase();
}

function printSlip(id){
  const o = orders.find(x => x.id === id);
  if(!o){ alert('Order not found.'); return; }
  const win = window.open('', '_blank');
  const html = `<!doctype html>
<html><head><title>${orderNumber(o)} Packing Slip</title>
<style>
body{font-family:Arial,sans-serif;padding:28px;color:#222}
h1{color:#a12b64;margin-bottom:4px}
.box{border:1px solid #ddd;border-radius:12px;padding:16px;margin:14px 0}
li{margin:8px 0;font-size:16px}
.check{display:inline-block;width:16px;height:16px;border:1px solid #333;margin-right:8px;vertical-align:middle}
.meta{line-height:1.55}
@media print{button{display:none}}
</style></head>
<body>
<button onclick="window.print()">Print</button>
<h1>Share's Sweet Treats</h1>
<h2>Packing Slip ${orderNumber(o)}</h2>
<div class="box meta">
<strong>Customer:</strong> ${clean(o.customer_name || 'Customer')}<br>
<strong>Email:</strong> ${clean(o.email)}<br>
<strong>Phone:</strong> ${clean(o.phone)}<br>
<strong>Order Type:</strong> ${clean(o.order_type)}<br>
<strong>Status:</strong> ${formatStatus(o.order_status || 'paid')}<br>
<strong>Date:</strong> ${new Date(o.created_at).toLocaleString()}<br>
<strong>Address:</strong> ${clean(o.delivery_address || o.address || 'No address collected.')}
</div>
<div class="box">
<h3>Items</h3>
<ul>${(Array.isArray(o.items)?o.items:[]).map(i=>`<li><span class="check"></span>${clean(i.qty || i.quantity || 1)} × ${clean(i.name)}</li>`).join('') || '<li>No items listed</li>'}</ul>
</div>
<div class="box">
<h3>Notes</h3>
<p>${clean(o.notes || 'No notes.')}</p>
</div>
<div class="box">
<h3>Baker Notes</h3>
<p style="height:80px"></p>
</div>
</body></html>`;
  win.document.write(html);
  win.document.close();
}


function addressPromptValue(o){
  const current = clean(o.delivery_address || o.address || '');
  return current.includes('No shipping') ? '' : current;
}

async function editOrderAddress(id){
  const order = orders.find(o => o.id === id);
  if(!order){ alert('Order not found.'); return; }

  const current = addressPromptValue(order);
  const example = '123 Main Street, Apt 2, North Charleston SC 29420';
  const address = prompt(`Enter the full delivery/shipping address:\n\nExample:\n${example}`, current);

  if(address === null) return;
  const cleaned = address.trim();

  if(!cleaned){
    alert('Please enter a valid address.');
    return;
  }

  try{
    const res = await fetch('/api/admin-orders', {
      method:'PATCH',
      headers:{'Content-Type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({
        id,
        address: cleaned,
        delivery_address: cleaned,
        notifyCustomer:false
      })
    });

    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not save address.');

    orders = orders.map(o => o.id === id ? (data.order || {...o, address:cleaned, delivery_address:cleaned}) : o);
    renderOrders();
    alert('Address saved. You can now create the USPS label.');
    await loadOrders();
  }catch(err){
    alert(err.message);
  }
}


function isShippingOrder(o){
  return clean(o.order_type).toLowerCase().includes('shipping');
}

function shippingBlock(o){
  if(!isShippingOrder(o)) return '';

  const address = clean(o.delivery_address || o.address || 'No shipping address saved.');
  const tracking = clean(o.tracking_number || '');
  const trackingUrl = clean(o.tracking_url || '');
  const labelUrl = clean(o.label_url || '');
  const carrier = clean(o.carrier || '');
  const service = clean(o.shipping_service || '');

  if(tracking || labelUrl){
    return `
      <div class="shipping-box">
        <h4>📦 Shipping Label</h4>
        <p><strong>Address:</strong><br>${address}</p>
        <p><strong>Carrier:</strong> ${carrier || 'USPS'} ${service ? '• '+service : ''}<br>
        <strong>Tracking:</strong> ${tracking || 'Created'}</p>
        <div class="actions">
          <button class="small" onclick="editOrderAddress('${o.id}')">Edit Address</button>
          ${labelUrl ? `<a class="small link-btn" href="${labelUrl}" target="_blank">Print Label</a>` : ''}
          ${trackingUrl ? `<a class="small link-btn" href="${trackingUrl}" target="_blank">Track Package</a>` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="shipping-box">
      <h4>📦 Shipping</h4>
      <p><strong>Address:</strong><br>${address}</p>
      <div class="actions">
        <button class="small" onclick="editOrderAddress('${o.id}')">Edit Address</button>
        <button class="small" onclick="createShippingLabel('${o.id}')">Create USPS Label</button>
      </div>
      <small class="meta">This will purchase real postage from Shippo.</small>
    </div>
  `;
}

async function createShippingLabel(id){
  const order = orders.find(o => o.id === id);
  if(!order){ alert('Order not found.'); return; }

  const address = clean(order.delivery_address || order.address || '');
  if(!address || address.includes('No shipping')){
    alert('Please click Edit Address and save the customer shipping address first.');
    return;
  }

  const ok = confirm(`Create and purchase a USPS shipping label for ${order.customer_name || 'this customer'}?\n\nThis will charge your Shippo account for postage.`);
  if(!ok) return;

  try{
    const res = await fetch('/api/create-shipping-label', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({id})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not create shipping label.');

    orders = orders.map(o => o.id === id ? (data.order || o) : o);
    renderOrders();

    if(data.order?.label_url){
      window.open(data.order.label_url, '_blank');
    }

    if(data.email?.error){
      alert('Label created, but tracking email failed: ' + data.email.error);
    }else{
      alert('Shipping label created. Tracking email sent to customer.');
    }

    await loadOrders();
  }catch(err){
    alert(err.message);
  }
}


function orderCard(o){
  return `<article class="order-card">
    <div class="order-top">
      <div>
        <span class="badge paid">${clean(o.payment_status || 'paid')}</span>
        <span class="badge">${formatStatus(o.order_status || 'paid')}</span>
        <h3>${orderNumber(o)} • ${clean(o.customer_name || 'Customer')} — ${money(o.total)}</h3>
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
    ${shippingBlock(o)}
    <div class="actions">
      <button class="small" onclick="printSlip('${o.id}')">🖨 Print Slip</button>
      <button class="small" onclick="editOrderAddress('${o.id}')">Edit Address</button>
      ${statusOptions.map(([value,label]) => `<button class="small" onclick="updateStatus('${o.id}','${value}')">${label}</button>`).join('')}
    </div>
    <small class="meta">Status buttons update Supabase and email the customer automatically.</small>
  </article>`;
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

function renderInventoryCategories(){
  const select = document.getElementById('inventoryCategory');
  if(!select) return;
  const current = select.value || 'all';
  const cats = [...new Set(inventory.map(i => clean(i.category)).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  select.value = cats.includes(current) ? current : 'all';
}

function renderInventory(){
  const list = document.getElementById('inventoryList');
  if(!list) return;

  const q = (document.getElementById('inventorySearch')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('inventoryCategory')?.value || 'all';

  let rows = inventory.filter(item => {
    const matchSearch = (clean(item.name)+clean(item.category)).toLowerCase().includes(q);
    const matchCat = cat === 'all' || clean(item.category) === cat;
    return matchSearch && matchCat;
  });

  if(!rows.length){
    list.innerHTML = '<p>No inventory items found.</p>';
    return;
  }

  list.innerHTML = rows.map(item => `
    <div class="order-card inventory-card">
      <div class="order-top">
        <div>
          <span class="badge ${item.sold_out ? '' : 'paid'}">${item.sold_out ? 'Sold Out' : 'Available'}</span>
          <span class="badge">${item.active ? 'Visible' : 'Hidden'}</span>
          <h3>${clean(item.name)} — ${money(item.price)}</h3>
          <div class="meta">${clean(item.category)} • Stock: ${clean(item.stock)}</div>
        </div>
      </div>
      <div class="actions">
        <button class="small" onclick="editInventory('${item.id}')">Edit</button>
        <button class="small" onclick="toggleSoldOut('${item.id}')">${item.sold_out ? 'Mark Available' : 'Mark Sold Out'}</button>
        <button class="small" onclick="toggleActive('${item.id}')">${item.active ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  `).join('');
}

async function saveInventoryUpdate(id, changes){
  const res = await fetch('/api/inventory', {
    method: 'PATCH',
    headers: {'Content-Type':'application/json','x-admin-password':adminPassword},
    body: JSON.stringify({id, ...changes})
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'Inventory update failed.');
  inventory = inventory.map(i => i.id === id ? data.item : i);
  renderInventoryCategories();
  renderInventory();
}

async function editInventory(id){
  const item = inventory.find(i => i.id === id);
  if(!item) return alert('Item not found.');

  const price = prompt(`Price for ${item.name}:`, item.price);
  if(price === null) return;
  const stock = prompt(`Stock for ${item.name}:`, item.stock);
  if(stock === null) return;

  try{
    await saveInventoryUpdate(id, {
      price: Number(price),
      stock: Number(stock)
    });
    alert('Inventory updated.');
  }catch(err){
    alert(err.message);
  }
}

async function toggleSoldOut(id){
  const item = inventory.find(i => i.id === id);
  if(!item) return;
  try{
    await saveInventoryUpdate(id, { sold_out: !item.sold_out });
  }catch(err){
    alert(err.message);
  }
}

async function toggleActive(id){
  const item = inventory.find(i => i.id === id);
  if(!item) return;
  try{
    await saveInventoryUpdate(id, { active: !item.active });
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
    ensureInventorySection();
    loadOrders();
    loadInventory();
  }
});