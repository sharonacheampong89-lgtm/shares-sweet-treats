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

function orderNumber(o){
  const id = clean(o.id || '');
  if(o.order_number) return clean(o.order_number);
  return 'SST-' + id.replace(/-/g,'').slice(0,6).toUpperCase();
}

function safeDate(value){
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalDate(a,b){
  return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function isWithinDays(date, days){
  if(!date) return false;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return date >= start && date <= now;
}

function getItemsArray(items){
  return Array.isArray(items) ? items : [];
}

function buildAnalytics(filteredOrders){
  const today = new Date();

  const todaysOrders = filteredOrders.filter(o => isSameLocalDate(safeDate(o.created_at), today));
  const weekOrders = filteredOrders.filter(o => isWithinDays(safeDate(o.created_at), 7));
  const monthOrders = filteredOrders.filter(o => isWithinDays(safeDate(o.created_at), 30));

  const revenue = arr => arr.reduce((s,o)=>s+Number(o.total||0),0);
  const average = arr => arr.length ? revenue(arr)/arr.length : 0;

  const typeCounts = { Pickup:0, 'Local Delivery':0, 'Mail Shipping':0, Other:0 };
  filteredOrders.forEach(o => {
    const t = clean(o.order_type || 'Other');
    if(typeCounts[t] !== undefined) typeCounts[t]++;
    else typeCounts.Other++;
  });

  const itemCounts = {};
  filteredOrders.forEach(o => {
    getItemsArray(o.items).forEach(item => {
      const name = clean(item.name || 'Unknown item');
      const qty = Number(item.qty || item.quantity || 1);
      itemCounts[name] = (itemCounts[name] || 0) + qty;
    });
  });

  const bestSellers = Object.entries(itemCounts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);

  return {
    todayRevenue: revenue(todaysOrders),
    todayOrders: todaysOrders.length,
    weekRevenue: revenue(weekOrders),
    weekOrders: weekOrders.length,
    monthRevenue: revenue(monthOrders),
    monthOrders: monthOrders.length,
    averageOrder: average(filteredOrders),
    typeCounts,
    bestSellers
  };
}

function ensureAnalyticsPanel(){
  if(document.getElementById('analyticsPanel')) return;

  const searchBox = document.getElementById('searchBox');
  const parent = searchBox?.parentElement || document.getElementById('dashboard');
  if(!parent) return;

  const panel = document.createElement('section');
  panel.id = 'analyticsPanel';
  panel.className = 'analytics-panel';
  panel.innerHTML = `
    <div class="analytics-header">
      <h2>Sales Analytics</h2>
      <small>Quick business snapshot based on the orders currently shown.</small>
    </div>
    <div class="analytics-grid">
      <div class="analytics-card"><span>Today's Sales</span><b id="todaySales">$0.00</b><small id="todayOrders">0 orders</small></div>
      <div class="analytics-card"><span>7-Day Sales</span><b id="weekSales">$0.00</b><small id="weekOrders">0 orders</small></div>
      <div class="analytics-card"><span>30-Day Sales</span><b id="monthSales">$0.00</b><small id="monthOrders">0 orders</small></div>
      <div class="analytics-card"><span>Average Order</span><b id="averageOrder">$0.00</b><small>per order</small></div>
    </div>
    <div class="analytics-split">
      <div class="analytics-box">
        <h3>Order Types</h3>
        <div id="orderTypeBreakdown"></div>
      </div>
      <div class="analytics-box">
        <h3>Best Sellers</h3>
        <ol id="bestSellers"></ol>
      </div>
    </div>
  `;

  parent.insertAdjacentElement('afterend', panel);

  const style = document.createElement('style');
  style.id = 'analyticsStyles';
  style.textContent = `
    .analytics-panel{background:#fff;border:1px solid #f3c8d8;border-radius:18px;padding:18px;margin:18px 0;box-shadow:0 8px 25px rgba(173,45,103,.08)}
    .analytics-header{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:14px}
    .analytics-header h2{margin:0;color:#a72d65}
    .analytics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .analytics-card,.analytics-box{background:#fff7fb;border:1px solid #f4cddd;border-radius:14px;padding:14px}
    .analytics-card span{display:block;font-size:.8rem;color:#7a3152}
    .analytics-card b{display:block;font-size:1.35rem;color:#a72d65;margin-top:4px}
    .analytics-card small,.analytics-header small{color:#7f6b74}
    .analytics-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .analytics-box h3{margin:0 0 10px;color:#7a3152}
    .type-row{display:flex;justify-content:space-between;border-bottom:1px dashed #e8b8ca;padding:7px 0}
    #bestSellers{margin:0;padding-left:20px}
    #bestSellers li{padding:5px 0}
    @media(max-width:800px){.analytics-grid,.analytics-split{grid-template-columns:1fr}.analytics-header{display:block}}
  `;
  if(!document.getElementById('analyticsStyles')) document.head.appendChild(style);
}

function renderAnalytics(filtered){
  ensureAnalyticsPanel();
  const a = buildAnalytics(filtered);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  };

  setText('todaySales', money(a.todayRevenue));
  setText('todayOrders', `${a.todayOrders} order${a.todayOrders === 1 ? '' : 's'}`);
  setText('weekSales', money(a.weekRevenue));
  setText('weekOrders', `${a.weekOrders} order${a.weekOrders === 1 ? '' : 's'}`);
  setText('monthSales', money(a.monthRevenue));
  setText('monthOrders', `${a.monthOrders} order${a.monthOrders === 1 ? '' : 's'}`);
  setText('averageOrder', money(a.averageOrder));

  const typeBox = document.getElementById('orderTypeBreakdown');
  if(typeBox){
    typeBox.innerHTML = Object.entries(a.typeCounts)
      .filter(([_,count]) => count > 0)
      .map(([type,count]) => `<div class="type-row"><span>${type}</span><b>${count}</b></div>`)
      .join('') || '<p>No order types yet.</p>';
  }

  const best = document.getElementById('bestSellers');
  if(best){
    best.innerHTML = a.bestSellers.length
      ? a.bestSellers.map(([name,qty]) => `<li><strong>${clean(name)}</strong> — ${qty} sold</li>`).join('')
      : '<li>No item data yet.</li>';
  }
}

function printSlip(id){
  const o = orders.find(order => String(order.id) === String(id));
  if(!o){ alert('Order not found. Please refresh the dashboard.'); return; }

  const slipItems = getItemsArray(o.items).map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">☐</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${clean(item.qty || item.quantity || 1)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${clean(item.name || 'Item')}</td>
    </tr>
  `).join('');

  const html = `
    <!doctype html>
    <html>
    <head>
      <title>${orderNumber(o)} Packing Slip</title>
      <style>
        body{font-family:Arial,sans-serif;margin:32px;color:#222}
        .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #a72d65;padding-bottom:14px;margin-bottom:18px}
        h1{color:#a72d65;margin:0}
        .box{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{text-align:left;background:#fff0f6;padding:8px}
        .notes{min-height:80px}
        .footer{margin-top:28px;font-size:12px;color:#666}
        @media print{button{display:none}body{margin:18px}}
      </style>
    </head>
    <body>
      <button onclick="window.print()" style="padding:10px 16px;margin-bottom:18px;">Print</button>
      <div class="header">
        <div>
          <h1>Share's Sweet Treats</h1>
          <p>Kitchen Packing Slip</p>
        </div>
        <div>
          <h2>${orderNumber(o)}</h2>
          <p>${new Date(o.created_at).toLocaleString()}</p>
        </div>
      </div>

      <div class="box">
        <h3>Customer</h3>
        <p><strong>${clean(o.customer_name || 'Customer')}</strong><br>
        ${clean(o.email)}<br>
        ${clean(o.phone)}</p>
      </div>

      <div class="box">
        <h3>Order Details</h3>
        <p><strong>Type:</strong> ${clean(o.order_type || 'Not provided')}<br>
        <strong>Status:</strong> ${formatStatus(o.order_status || 'paid')}<br>
        <strong>Total:</strong> ${money(o.total)}</p>
        <p><strong>Address:</strong><br>${clean(o.delivery_address || o.address || 'No shipping/delivery address collected.')}</p>
      </div>

      <div class="box">
        <h3>Items to Prepare</h3>
        <table>
          <thead><tr><th>Done</th><th>Qty</th><th>Item</th></tr></thead>
          <tbody>${slipItems || '<tr><td colspan="3">No items listed</td></tr>'}</tbody>
        </table>
      </div>

      <div class="box notes">
        <h3>Special Instructions / Baker Notes</h3>
        <p>${clean(o.notes || 'No notes provided.')}</p>
        <br><br>
      </div>

      <div class="footer">
        Printed from Share's Sweet Treats Owner Dashboard.
      </div>
      <script>setTimeout(()=>window.print(), 400);</script>
    </body>
    </html>
  `;

  const w = window.open('', '_blank');
  if(!w){ alert('Popup blocked. Please allow popups for this site and try again.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
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
  renderAnalytics(filtered);
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
    <div class="actions">
      ${statusOptions.map(([value,label]) => `<button class="small" onclick="updateStatus('${o.id}','${value}')">${label}</button>`).join('')}
      <button class="small" onclick="printSlip('${o.id}')">🖨 Print Slip</button>
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
