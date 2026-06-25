const menu=[
{cat:'Cookies',name:'Classic Chocolate Chip',price:3.25,desc:'Soft, thick and full of chocolate chips.',badge:'Best Seller'},{cat:'Cookies',name:'Biscoff Cookie Butter',price:3.25,desc:'Cookie butter flavor with sweet bakery crunch.',badge:'Popular'},{cat:'Cookies',name:'Nutella Lava',price:3.50,desc:'Chocolate cookie with Nutella-style filling.',badge:'Filled'},{cat:'Cookies',name:'S’mores',price:3.50,desc:'Graham, marshmallow and chocolate inspired.',badge:'Campfire'},{cat:'Cookies',name:'Strawberry Crunch',price:3.25,desc:'Sweet strawberry crunch cookie.',badge:'Pink Favorite'},{cat:'Cookies',name:'Red Velvet White Chocolate',price:3.25,desc:'Red velvet cookie with white chocolate.',badge:'Classic'},{cat:'Cookies',name:'Brown Butter Pecan',price:3.50,desc:'Rich brown butter pecan cookie.',badge:'Nutty'},{cat:'Cookies',name:'Cookie Monster',price:3.25,desc:'Fun blue cookie loaded with sweets.',badge:'Fun'},{cat:'Cookies',name:'Lemon Sugar',price:3.25,desc:'Bright lemon sugar cookie.',badge:'Fresh'},
{cat:'Cupcakes',name:'Vanilla Bean',price:3.25,desc:'Classic vanilla cupcake.',badge:'Classic'},{cat:'Cupcakes',name:'Chocolate Fudge',price:3.25,desc:'Rich chocolate cupcake.',badge:'Chocolate'},{cat:'Cupcakes',name:'Strawberry Crunch',price:3.50,desc:'Pink strawberry crunch cupcake.',badge:'Popular'},{cat:'Cupcakes',name:'Biscoff Dream',price:3.50,desc:'Biscoff flavored cupcake.',badge:'Dreamy'},{cat:'Cupcakes',name:'Nutella Hazelnut',price:3.75,desc:'Chocolate hazelnut cupcake.',badge:'Premium'},{cat:'Cupcakes',name:'Banana Pudding',price:3.75,desc:'Banana pudding inspired cupcake.',badge:'Southern'},{cat:'Cupcakes',name:'Red Velvet',price:3.75,desc:'Red velvet cupcake.',badge:'Classic'},
{cat:'Brownies & Bars',name:'Classic Fudge',price:3.25,desc:'Rich, fudgy brownie.',badge:'Fudgy'},{cat:'Brownies & Bars',name:'Nutella Swirl',price:3.25,desc:'Brownie with chocolate hazelnut swirl.',badge:'Swirl'},{cat:'Brownies & Bars',name:'Biscoff Brownies',price:3.25,desc:'Brownies with Biscoff flavor.',badge:'Popular'},{cat:'Brownies & Bars',name:'Brookie',price:3.25,desc:'Brownie and cookie combined into one sweet treat.',badge:'New'},{cat:'Brownies & Bars',name:'Oreo Cheesecake Brownies',price:3.25,desc:'Oreo cheesecake brownie bar.',badge:'Creamy'},{cat:'Brownies & Bars',name:'Turtle Brownies',price:3.25,desc:'Chocolate, caramel and pecan style brownie.',badge:'Caramel'},
{cat:'Cinnamon Rolls',name:'Classic Glazed',price:3.25,desc:'Soft glazed cinnamon roll.',badge:'Classic'},{cat:'Cinnamon Rolls',name:'Biscoff Drizzle',price:3.75,desc:'Cinnamon roll with Biscoff drizzle.',badge:'Drizzle'},{cat:'Cinnamon Rolls',name:'Nutella Hazelnut',price:3.75,desc:'Sweet hazelnut chocolate roll.',badge:'Premium'},{cat:'Cinnamon Rolls',name:'Strawberry Cheesecake',price:4.00,desc:'Strawberry cheesecake cinnamon roll.',badge:'Sweet'},{cat:'Cinnamon Rolls',name:'Cookies & Cream',price:4.50,desc:'Cookies and cream topped roll.',badge:'Loaded'},{cat:'Cinnamon Rolls',name:'Sugar Cheesecake',price:4.50,desc:'Sweet cheesecake inspired roll.',badge:'Loaded'},
{cat:'Mini Cakes',name:'Chocolate Luxe',price:8.99,desc:'Personal mini cake.',badge:'Personal'},{cat:'Mini Cakes',name:'Strawberry Shortcake',price:10.99,desc:'Personal strawberry mini cake.',badge:'Premium'},{cat:'Mini Cakes',name:'Biscoff Crunch',price:10.99,desc:'Personal Biscoff mini cake.',badge:'Premium'},{cat:'Mini Cakes',name:'Lemon Cake',price:8.99,desc:'Personal lemon mini cake.',badge:'Fresh'},{cat:'Mini Cakes',name:'Nutella Dream',price:8.99,desc:'Personal Nutella mini cake.',badge:'Dreamy'},{cat:'Mini Cakes',name:'Confetti Cake',price:8.99,desc:'Personal confetti mini cake.',badge:'Birthday'},
{cat:'Breads',name:'White Bread',price:7.99,desc:'Fresh baked loaf.',badge:'Loaf'},{cat:'Breads',name:'Honey Butter Bread',price:9.99,desc:'Soft honey butter loaf.',badge:'Sweet'},{cat:'Breads',name:'Garlic Herb Bread',price:9.99,desc:'Savory garlic herb loaf.',badge:'Savory'},{cat:'Breads',name:'Chocolate Chip Banana Bread',price:11.99,desc:'Banana bread with chocolate chips.',badge:'Popular'},{cat:'Breads',name:'Cinnamon Swirl Bread',price:11.99,desc:'Sweet cinnamon swirl loaf.',badge:'Swirl'},{cat:'Pull-Apart Breads',name:'Cinnamon Sugar Pull-Apart',price:17.99,desc:'Sweet pull-apart bread.',badge:'Shareable'},{cat:'Pull-Apart Breads',name:'Garlic Parmesan Pull-Apart',price:19.99,desc:'Savory pull-apart bread.',badge:'Savory'},{cat:'Pull-Apart Breads',name:'Pizza Bread',price:19.99,desc:'Savory pizza-style pull-apart.',badge:'Party'},
{cat:'Extras',name:'Chocolate Drizzle',price:.69,desc:'Add-on drizzle.',badge:'Add-on'},{cat:'Extras',name:'Nutella Drizzle',price:.69,desc:'Add-on drizzle.',badge:'Add-on'},{cat:'Extras',name:'Oreo Crumble',price:.69,desc:'Add-on topping.',badge:'Add-on'},{cat:'Extras',name:'M&M Topping',price:.69,desc:'Colorful M&M topping add-on.',badge:'Add-on'},{cat:'Extras',name:'Extra Filling',price:.69,desc:'Additional filling per item.',badge:'Add-on'}
];
let cart=JSON.parse(localStorage.getItem('sst_cart_final')||'[]');
let orders=JSON.parse(localStorage.getItem('sst_orders_final')||'[]');
let activeCat='All';
let calculatedDelivery={fee:0,miles:null,available:false,address:''};
const money=n=>'$'+Number(n||0).toFixed(2);
const cats=['All',...new Set(menu.map(x=>x.cat))];
function init(){setupTipOptions();document.getElementById('categoryTabs').innerHTML=cats.map(c=>`<button class="${c===activeCat?'active':''}" onclick="setCat('${c}')">${c}</button>`).join('');renderMenu();renderCart();renderAdmin();setMinDate();}
function setMinDate(){const d=document.querySelector('input[type="date"]'); if(d&&!d.min)d.min=new Date().toISOString().slice(0,10)}
function toggleMenu(){document.getElementById('navLinks').classList.toggle('show')}
function setCat(c){activeCat=c;renderCategoryButtons();renderMenu()}
function renderCategoryButtons(){document.getElementById('categoryTabs').innerHTML=cats.map(c=>`<button class="${c===activeCat?'active':''}" onclick="setCat('${c}')">${c}</button>`).join('')}
function renderMenu(){let q=(document.getElementById('searchBox')?.value||'').toLowerCase();let sort=document.getElementById('sortBox')?.value||'featured';let items=activeCat==='All'?menu:[...menu].filter(x=>x.cat===activeCat);items=items.filter(x=>(x.name+x.desc+x.cat).toLowerCase().includes(q));if(sort==='low')items.sort((a,b)=>a.price-b.price);if(sort==='high')items.sort((a,b)=>b.price-a.price);document.getElementById('menuGrid').innerHTML=items.length?items.map(p=>`<div class="product"><div class="add-row"><span>${p.badge}</span><span>${p.cat}</span></div><h3>${p.name}</h3><small>${p.desc}</small><div class="price">${money(p.price)}</div><button class="btn primary full" onclick="addToCart('${escapeName(p.name)}')">Add to Cart</button></div>`).join(''):'<p>No items found. Try another search.</p>'}
function escapeName(s){return s.replace(/'/g,"\\'")}
function addToCart(name){let p=menu.find(x=>x.name===name), item=cart.find(x=>x.name===name); if(item)item.qty++; else cart.push({...p,qty:1}); saveCart(); toggleCart(true)}
function changeQty(name,d){let item=cart.find(x=>x.name===name); if(!item)return; item.qty+=d; if(item.qty<=0)cart=cart.filter(x=>x.name!==name); saveCart()}
function saveCart(){localStorage.setItem('sst_cart_final',JSON.stringify(cart));renderCart()}
function subtotal(){return cart.reduce((s,x)=>s+x.price*x.qty,0)}
function deliveryFee(){
  let type=document.getElementById('orderType')?.value;
  if(type==='Local Delivery') return Number(calculatedDelivery.fee||0)/100;
  if(type==='Mail Shipping') return 12;
  return 0;
}
function hasNoShippingItem(){
  return cart.some(item => item.name.toLowerCase().includes('cheesecake'));
}
function tipAmount(){
  const choice=document.getElementById('tipChoice')?.value || '0';
  if(choice==='custom') return Math.max(0, Number(document.getElementById('customTip')?.value || 0));
  return Math.round((subtotal()*Number(choice))*100)/100;
}
function serviceLabel(){
  let type=document.getElementById('orderType')?.value;
  if(type==='Local Delivery') return 'Local Delivery Fee';
  if(type==='Mail Shipping') return 'Shipping Fee';
  return 'Service Fee';
}
function total(){return subtotal()+deliveryFee()+tipAmount()}
function renderCart(){const count=cart.reduce((s,x)=>s+x.qty,0);document.getElementById('cartCount').textContent=count;document.getElementById('cartItems').innerHTML=cart.length?cart.map(x=>`<div class="cart-item"><b>${x.name}</b><br><small>${money(x.price)} each</small><div class="qty"><button onclick="changeQty('${escapeName(x.name)}',-1)">-</button><span>${x.qty}</span><button onclick="changeQty('${escapeName(x.name)}',1)">+</button><strong>${money(x.price*x.qty)}</strong></div></div>`).join(''):'<p>Your cart is empty. Add treats from the menu.</p>';document.getElementById('cartSubtotal').textContent=money(subtotal());document.getElementById('cartDelivery').textContent=money(deliveryFee());
  const label=document.querySelector('.cart-total span');
  const rows=document.querySelectorAll('.cart-total span');
  if(rows[1]) rows[1].textContent=serviceLabel();
  document.getElementById('cartTotal').textContent=money(total());
  const co=document.getElementById('checkoutTotal');if(co)co.textContent=money(total());
  const tipText=document.getElementById('tipPreview'); if(tipText) tipText.textContent=money(tipAmount());
}
function toggleCart(force){let open=force===undefined?!document.getElementById('cartPanel').classList.contains('open'):force;document.getElementById('cartPanel').classList.toggle('open',open);document.getElementById('overlay').classList.toggle('show',open)}
function updateDeliveryFields(){
  let type=document.getElementById('orderType').value;
  let show=type!=='Pickup';
  const fields=document.getElementById('deliveryFields');
  fields.classList.toggle('hidden',!show);
  let estimator=document.getElementById('deliveryEstimator');
  if(!estimator){
    estimator=document.createElement('div');
    estimator.id='deliveryEstimator';
    estimator.className='note';
    fields.appendChild(estimator);
  }
  calculatedDelivery={fee:0,miles:null,available:false,address:''};
  if(type==='Local Delivery'){
    estimator.innerHTML='Enter the full delivery address, then click <button type="button" class="btn secondary" onclick="calculateDeliveryFee(true)">Calculate Delivery Fee</button><br><small>Delivery is estimated from 3323 Mountainbrook Ave, North Charleston, SC 29420. Delivery is available within 20 miles.</small>';
  }else if(type==='Mail Shipping'){
    estimator.innerHTML='Mail shipping is a flat <b>$12.00</b>. Cheesecake items cannot be shipped.';
  }else{
    estimator.innerHTML='';
  }
  renderCart();
}

async function calculateDeliveryFee(showAlert=true){
  const address=document.querySelector('[name="address"]')?.value?.trim();
  const estimator=document.getElementById('deliveryEstimator');
  if(!address){ if(showAlert) alert('Please enter the full delivery address first.'); return false; }
  if(estimator) estimator.innerHTML='Calculating delivery distance...';
  try{
    const res=await fetch('/api/delivery-distance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})});
    const data=await res.json();
    if(!res.ok || !data.available){
      calculatedDelivery={fee:0,miles:data.miles||null,available:false,address};
      if(estimator) estimator.innerHTML=`<b>Local delivery unavailable.</b><br>${data.error||'This address appears to be outside the 20-mile delivery area.'}<br><small>Please choose Pickup or Mail Shipping if your items can be shipped.</small>`;
      renderCart();
      return false;
    }
    calculatedDelivery={fee:data.feeCents,miles:data.miles,available:true,address};
    if(estimator) estimator.innerHTML=`Estimated distance: <b>${data.miles.toFixed(1)} miles</b><br>Delivery fee: <b>${money(data.feeCents/100)}</b><br><small>This fee will be added at secure checkout.</small>`;
    renderCart();
    return true;
  }catch(err){
    calculatedDelivery={fee:0,miles:null,available:false,address};
    if(estimator) estimator.innerHTML='Could not calculate delivery right now. Please check the address or choose Pickup.';
    if(showAlert) alert('Could not calculate delivery fee: '+err.message);
    renderCart();
    return false;
  }
}
async function submitOrder(e){
  e.preventDefault();
  if(!cart.length){alert('Please add at least one item to the cart.');return}
  const selectedType=document.getElementById('orderType')?.value;
  if(selectedType==='Mail Shipping' && hasNoShippingItem()){alert('Cheesecake items are not available for shipping. Please choose Pickup or Local Delivery, or remove cheesecake items from your cart.');return}
  if(selectedType==='Local Delivery'){
    const ok=await calculateDeliveryFee(false);
    if(!ok){alert('Local delivery is only available within 20 miles. Please enter a valid local delivery address or choose Pickup.');return}
  }
  const form=e.target;
  const button=form.querySelector('button[type="submit"]');
  const originalText=button ? button.textContent : '';
  if(button){button.disabled=true;button.textContent='Opening secure checkout...'}
  try{
    let data=Object.fromEntries(new FormData(form).entries());
    const order={
      id:'SST-'+Date.now().toString().slice(-6),
      created:new Date().toLocaleString(),
      customer:data,
      items:[...cart],
      subtotal:subtotal(),
      delivery:deliveryFee(),
      tip:tipAmount(),
      serviceLabel:serviceLabel(),
      total:total(),
      status:'Awaiting Stripe Payment'
    };
    localStorage.setItem('sst_pending_order',JSON.stringify(order));
    const response=await fetch('/api/checkout',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(order)
    });
    const result=await response.json();
    if(!response.ok || !result.url){
      throw new Error(result.error || 'Checkout could not be started.');
    }
    window.location.href=result.url;
  }catch(err){
    alert('Stripe checkout error: '+err.message);
    if(button){button.disabled=false;button.textContent=originalText}
  }
}
function renderAdmin(){
  const adminOrders=document.getElementById('adminOrders');
  const adminRevenue=document.getElementById('adminRevenue');
  const adminCustomers=document.getElementById('adminCustomers');
  const adminAverage=document.getElementById('adminAverage');
  const ordersList=document.getElementById('ordersList');
  if(!adminOrders || !adminRevenue || !adminCustomers || !adminAverage || !ordersList) return;
  const revenue=orders.reduce((s,o)=>s+Number(o.total),0);
  adminOrders.textContent=orders.length;
  adminRevenue.textContent=money(revenue);
  adminCustomers.textContent=new Set(orders.map(o=>o.customer.email)).size;
  adminAverage.textContent=money(orders.length?revenue/orders.length:0);
  ordersList.innerHTML=orders.length?orders.map(o=>`<div class="order-card"><b>${o.id} • ${o.customer.name} • ${money(o.total)}</b><p>${o.items.map(i=>i.qty+' x '+i.name).join(', ')}</p><small>${o.customer.orderType} • ${o.customer.phone} • ${o.status} • ${o.created}</small><br><small>${o.customer.address||''}</small></div>`).join(''):'<p>No test orders yet. Place a sample order to test the flow.</p>'
}

function setupTipOptions(){
  const paymentBox=document.querySelector('.payment-options');
  if(!paymentBox || document.getElementById('tipChoice')) return;
  const tipBox=document.createElement('div');
  tipBox.className='tip-options';
  tipBox.innerHTML=`<h3>Optional Tip</h3>
    <label><input type="radio" name="tip" value="0" checked onchange="setTip('0')"> No tip</label>
    <label><input type="radio" name="tip" value="0.10" onchange="setTip('0.10')"> 10%</label>
    <label><input type="radio" name="tip" value="0.15" onchange="setTip('0.15')"> 15%</label>
    <label><input type="radio" name="tip" value="0.20" onchange="setTip('0.20')"> 20%</label>
    <label><input type="radio" name="tip" value="custom" onchange="setTip('custom')"> Custom</label>
    <input id="customTip" class="hidden" type="number" min="0" step="0.01" placeholder="Custom tip amount" oninput="renderCart()">
    <input id="tipChoice" type="hidden" value="0">
    <p class="note">Tip amount: <strong id="tipPreview">$0.00</strong></p>`;
  paymentBox.appendChild(tipBox);
}
function setTip(value){
  document.getElementById('tipChoice').value=value;
  const custom=document.getElementById('customTip');
  if(custom) custom.classList.toggle('hidden', value!=='custom');
  renderCart();
}

function exportOrders(){if(!orders.length){alert('No orders to export yet.');return}const rows=[['Order ID','Date','Customer','Email','Phone','Order Type','Items','Subtotal','Delivery','Total','Status']];orders.forEach(o=>rows.push([o.id,o.created,o.customer.name,o.customer.email,o.customer.phone,o.customer.orderType,o.items.map(i=>`${i.qty} x ${i.name}`).join('; '),o.subtotal,o.delivery,o.total,o.status]));const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='shares-sweet-treats-orders.csv';a.click()}
function clearOrders(){if(confirm('Clear test orders from this browser?')){orders=[];localStorage.setItem('sst_orders_final','[]');renderAdmin()}}
init();
