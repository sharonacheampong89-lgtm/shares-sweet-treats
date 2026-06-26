let menu=[];
let cart=JSON.parse(localStorage.getItem('sst_cart_final')||'[]');
let orders=JSON.parse(localStorage.getItem('sst_orders_final')||'[]');
let activeCat='All';
let calculatedDelivery={fee:0,miles:null,available:false,address:''};
  selectedShippingRate=null;
let selectedShippingRate=null;

const money=n=>'$'+Number(n||0).toFixed(2);

function normalizeProductFromInventory(item){
  return {
    id:item.id,
    cat:item.category || 'Treats',
    name:item.name,
    price:Number(item.price || 0),
    desc:item.description || defaultDescription(item.category, item.name),
    badge:item.sold_out ? 'Sold Out' : (Number(item.stock || 0) <= 5 ? 'Limited' : 'Fresh'),
    stock:Number(item.stock ?? 999),
    sold_out:!!item.sold_out,
    active:item.active !== false
  };
}

function defaultDescription(category, name){
  const c=String(category||'').toLowerCase();
  if(c.includes('cookie')) return 'Fresh baked cookie made with love.';
  if(c.includes('cupcake')) return 'Soft cupcake with sweet bakery flavor.';
  if(c.includes('brownie')) return 'Rich, sweet brownie-style treat.';
  if(c.includes('cake')) return 'Personal sweet treat made fresh.';
  if(c.includes('bread')) return 'Fresh baked bread made to order.';
  if(c.includes('add')) return 'Optional add-on for your treats.';
  return 'Fresh homemade bakery item.';
}

function bundleOptions(product){
  const c=String(product.cat||'').toLowerCase();
  if(c.includes('cookie')) return [
    {type:'half_dozen', label:'Half Dozen', count:6, price:15},
    {type:'dozen', label:'Dozen', count:12, price:26}
  ];
  if(c.includes('cupcake')) return [
    {type:'half_dozen', label:'Half Dozen', count:6, price:18},
    {type:'dozen', label:'Dozen', count:12, price:34}
  ];
  if(c.includes('brownie')) return [
    {type:'half_dozen', label:'Half Dozen', count:6, price:10},
    {type:'dozen', label:'Dozen', count:12, price:18}
  ];
  if(c.includes('cinnamon')) return [
    {type:'half_dozen', label:'Half Dozen', count:6, price:16},
    {type:'dozen', label:'Dozen', count:12, price:30}
  ];
  return [];
}

function requiredPrepHours(){
  let maxHours = 0;
  cart.forEach(item=>{
    const c=String(item.cat || item.category || '').toLowerCase();
    const n=String(item.name || '').toLowerCase();
    let hours = 8;
    if(c.includes('bread') || n.includes('bread') || c.includes('cinnamon') || n.includes('cinnamon roll')) hours = 24;
    if(c.includes('add')) hours = 0;
    maxHours = Math.max(maxHours, hours);
  });
  return maxHours || 8;
}

function prepMessage(){
  const hours = requiredPrepHours();
  if(hours >= 24) return 'Because your cart includes bread or cinnamon rolls, please choose a pickup/delivery time at least 24 hours from now.';
  return 'Because each order is baked fresh, please choose a pickup/delivery time at least 8 hours from now.';
}

function validatePrepTime(){
  const type=document.getElementById('orderType')?.value;
  if(type === 'Mail Shipping') return true;
  const date=document.querySelector('[name="date"]')?.value;
  const time=document.querySelector('[name="time"]')?.value;
  if(!date || !time){ alert('Please choose a preferred date and time.'); return false; }
  const selected = new Date(`${date}T${time}`);
  const min = new Date(Date.now() + requiredPrepHours() * 60 * 60 * 1000);
  if(selected < min){ alert(prepMessage()); return false; }
  return true;
}

async function loadPublicInventory(){
  try{
    const res=await fetch('/api/public-inventory');
    const data=await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not load menu.');
    menu=(data.items||[]).map(normalizeProductFromInventory).filter(x=>x.active);
  }catch(err){
    console.warn('Inventory load failed:', err);
    menu=[];
    const menuGrid=document.getElementById('menuGrid');
    if(menuGrid) menuGrid.innerHTML='<p>Menu is temporarily unavailable. Please refresh or contact us.</p>';
  }
}

function cats(){
  return ['All',...new Set(menu.map(x=>x.cat))];
}

async function init(){
  await loadPublicInventory();
  
  document.querySelector('[name="date"]')?.closest('label')?.setAttribute('data-schedule-field','true');
  document.querySelector('[name="time"]')?.closest('label')?.setAttribute('data-schedule-field','true');
  document.getElementById('miles')?.closest('label')?.setAttribute('data-distance-field','true');
  setupTipOptions();
  renderCategoryButtons();
  renderMenu();
  renderCart();
  renderAdmin();
  setMinDate();
  updateDeliveryFields();
  ['street','apt','city','state','zip'].forEach(name=>{
    const input=document.querySelector(`[name="${name}"]`);
    if(input) input.addEventListener('input',()=>{ syncFullAddress(); if(document.getElementById('orderType')?.value==='Local Delivery'){ calculatedDelivery={fee:0,miles:null,available:false,address:''}; renderCart(); } if(document.getElementById('orderType')?.value==='Mail Shipping'){ selectedShippingRate=null; renderCart(); } });
  });
}

function setMinDate(){
  const d=document.querySelector('input[type="date"]');
  if(d&&!d.min)d.min=new Date().toISOString().slice(0,10)
}

function toggleMenu(){document.getElementById('navLinks').classList.toggle('show')}

function setCat(c){activeCat=c;renderCategoryButtons();renderMenu()}

function renderCategoryButtons(){
  const el=document.getElementById('categoryTabs');
  if(!el) return;
  el.innerHTML=cats().map(c=>`<button class="${c===activeCat?'active':''}" onclick="setCat('${c.replace(/'/g,"\\'")}')">${c}</button>`).join('')
}

function renderMenu(){
  const grid=document.getElementById('menuGrid');
  if(!grid) return;
  let q=(document.getElementById('searchBox')?.value||'').toLowerCase();
  let sort=document.getElementById('sortBox')?.value||'featured';
  let items=activeCat==='All'?menu:[...menu].filter(x=>x.cat===activeCat);
  items=items.filter(x=>(x.name+x.desc+x.cat).toLowerCase().includes(q));
  if(sort==='low')items.sort((a,b)=>a.price-b.price);
  if(sort==='high')items.sort((a,b)=>b.price-a.price);
  grid.innerHTML=items.length?items.map(p=>`
    <div class="product ${p.sold_out ? 'sold-out' : ''}">
      <div class="add-row"><span>${p.badge}</span><span>${p.cat}</span></div>
      <h3>${p.name}</h3>
      <small>${p.desc}</small>
      <div class="price">${money(p.price)}</div>
      ${productButtons(p)}
    </div>`).join(''):'<p>No items found. Try another search.</p>'
}


function productButtons(p){
  if(p.sold_out || Number(p.stock||0)<=0){
    return `<button class="btn secondary full" disabled>Sold Out</button>`;
  }
  const bundles = bundleOptions(p);
  if(!bundles.length){
    return `<button class="btn primary full" onclick="addToCart('${escapeName(p.name)}')">Add to Cart</button>`;
  }
  return `
    <div class="bundle-buttons">
      <button class="btn primary full" onclick="addToCart('${escapeName(p.name)}')">Single ${money(p.price)}</button>
      ${bundles.map(b=>`<button class="btn secondary full" onclick="addBundle('${escapeName(p.name)}','${b.type}')">${b.label} — ${money(b.price)}</button>`).join('')}
    </div>
  `;
}

function escapeName(s){return String(s).replace(/'/g,"\\'")}

function addToCart(name){
  let p=menu.find(x=>x.name===name);
  if(!p)return;
  if(p.sold_out || Number(p.stock||0)<=0){alert(`${p.name} is currently sold out.`);return;}
  let item=cart.find(x=>x.name===name);
  if(item){
    if(item.qty+1 > Number(p.stock||999)){alert(`Only ${p.stock} available for ${p.name}.`);return;}
    item.qty++;
  } else {
    cart.push({...p,qty:1});
  }
  saveCart();
  toggleCart(true)
}

function addBundle(name, bundleType){
  let p=menu.find(x=>x.name===name);
  if(!p)return;
  const option=bundleOptions(p).find(b=>b.type===bundleType);
  if(!option)return;
  if(p.sold_out || Number(p.stock||0)<option.count){
    alert(`Not enough ${p.name} available for ${option.label}.`);
    return;
  }
  const cartName=`${p.name} (${option.label})`;
  let item=cart.find(x=>x.name===cartName && x.bundleType===bundleType);
  if(item){ item.qty++; }
  else{
    cart.push({...p,name:cartName,baseName:p.name,bundle:true,bundleType,bundleLabel:option.label,bundleCount:option.count,price:option.price,qty:1});
  }
  saveCart();
  toggleCart(true);
}

function changeQty(name,d){
  let item=cart.find(x=>x.name===name);
  if(!item)return;
  const inv=menu.find(x=>x.name===(item.baseName || name));
  if(d>0 && inv && item.bundleCount && (item.qty+1)*item.bundleCount > Number(inv.stock||999)){alert(`Only ${inv.stock} available for ${item.baseName || name}.`);return;}
  if(d>0 && inv && !item.bundleCount && item.qty+1 > Number(inv.stock||999)){alert(`Only ${inv.stock} available for ${name}.`);return;}
  item.qty+=d;
  if(item.qty<=0)cart=cart.filter(x=>x.name!==name);
  saveCart()
}

function saveCart(){localStorage.setItem('sst_cart_final',JSON.stringify(cart));renderCart()}

function subtotal(){return cart.reduce((s,x)=>s+x.price*x.qty,0)}

function deliveryFee(){
  let type=document.getElementById('orderType')?.value;
  if(type==='Local Delivery') return Number(calculatedDelivery.fee||0)/100;
  if(type==='Mail Shipping' && selectedShippingRate) return Number(selectedShippingRate.amountCents||0)/100;
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
  if(type==='Mail Shipping') return selectedShippingRate ? 'Shipping' : 'Shipping Quote';
  return 'Service Fee';
}

function total(){return subtotal()+deliveryFee()+tipAmount()}

function renderCart(){
  const count=cart.reduce((s,x)=>s+x.qty,0);
  const cartCount=document.getElementById('cartCount');
  if(cartCount) cartCount.textContent=count;
  const cartItems=document.getElementById('cartItems');
  if(cartItems) cartItems.innerHTML=cart.length?cart.map(x=>`<div class="cart-item"><b>${x.name}</b><br><small>${money(x.price)} each</small><div class="qty"><button onclick="changeQty('${escapeName(x.name)}',-1)">-</button><span>${x.qty}</span><button onclick="changeQty('${escapeName(x.name)}',1)">+</button><strong>${money(x.price*x.qty)}</strong></div></div>`).join(''):'<p>Your cart is empty. Add treats from the menu.</p>';
  const sub=document.getElementById('cartSubtotal'); if(sub) sub.textContent=money(subtotal());
  const del=document.getElementById('cartDelivery'); if(del) del.textContent=(document.getElementById('orderType')?.value==='Mail Shipping' && !selectedShippingRate) ? 'Calculate shipping' : money(deliveryFee());
  const rows=document.querySelectorAll('.cart-total span');
  if(rows[1]) rows[1].textContent=serviceLabel();
  const totalEl=document.getElementById('cartTotal'); if(totalEl) totalEl.textContent=money(total());
  const co=document.getElementById('checkoutTotal');if(co)co.textContent=money(total());
  const tipText=document.getElementById('tipPreview'); if(tipText) tipText.textContent=money(tipAmount());
}

function toggleCart(force){
  let open=force===undefined?!document.getElementById('cartPanel').classList.contains('open'):force;
  document.getElementById('cartPanel').classList.toggle('open',open);
  document.getElementById('overlay').classList.toggle('show',open)
}


function getAddressParts(){
  return {
    street: document.querySelector('[name="street"]')?.value?.trim() || '',
    apt: document.querySelector('[name="apt"]')?.value?.trim() || '',
    city: document.querySelector('[name="city"]')?.value?.trim() || '',
    state: document.querySelector('[name="state"]')?.value?.trim() || '',
    zip: document.querySelector('[name="zip"]')?.value?.trim() || ''
  };
}

function buildFullAddress(){
  const a=getAddressParts();
  return [a.street, a.apt, `${a.city}, ${a.state} ${a.zip}`.trim()].filter(Boolean).join(', ');
}

function syncFullAddress(){
  const hidden=document.querySelector('[name="address"]');
  if(hidden) hidden.value=buildFullAddress();
}

function setAddressRequired(required){
  ['street','city','state','zip'].forEach(name=>{
    const input=document.querySelector(`[name="${name}"]`);
    if(input) input.required=required;
  });
}


function getCustomerContactForShipping(){
  return {
    name: document.querySelector('[name="name"]')?.value?.trim() || 'Customer',
    email: document.querySelector('[name="email"]')?.value?.trim() || '',
    phone: document.querySelector('[name="phone"]')?.value?.trim() || ''
  };
}

function chooseShippingRate(index){
  const select=document.getElementById('shippingRateSelect');
  if(!select) return;
  const encoded=select.value;
  if(!encoded){
    selectedShippingRate=null;
  }else{
    try{ selectedShippingRate=JSON.parse(decodeURIComponent(encoded)); }
    catch(e){ selectedShippingRate=null; }
  }
  renderCart();
}

async function calculateShippingRates(showAlert=true){
  const address=buildFullAddress();
  syncFullAddress();
  const parts=getAddressParts();
  const estimator=document.getElementById('deliveryEstimator');

  if(!parts.street || !parts.city || !parts.state || !parts.zip){
    if(showAlert) alert('Please enter street address, city, state, and ZIP code for shipping.');
    return false;
  }
  if(!cart.length){
    if(showAlert) alert('Please add items to the cart before calculating shipping.');
    return false;
  }

  selectedShippingRate=null;
  if(estimator) estimator.innerHTML='Calculating live shipping rates...';

  try{
    const res=await fetch('/api/shipping-rates',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        address:{...parts, full:address},
        customer:getCustomerContactForShipping(),
        items:cart
      })
    });
    const data=await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not calculate shipping.');

    const rates=data.rates || [];
    if(!rates.length){
      if(estimator) estimator.innerHTML='<b>No shipping rates found.</b><br>Please check the shipping address or contact us.';
      renderCart();
      return false;
    }

    selectedShippingRate=rates[0];

    if(estimator){
      estimator.innerHTML=`
        <b>Choose Shipping Option</b><br>
        <select id="shippingRateSelect" onchange="chooseShippingRate()">
          ${rates.map((r,i)=>`<option value="${encodeURIComponent(JSON.stringify(r))}" ${i===0?'selected':''}>${r.provider} ${r.service} — ${money(r.amountCents/100)}${r.estimatedDays ? ` (${r.estimatedDays} business days)` : ''}</option>`).join('')}
        </select>
        <small>Shipping is estimated using live carrier rates. Final shipping depends on package size and weight.</small>
      `;
    }
    renderCart();
    return true;
  }catch(err){
    selectedShippingRate=null;
    if(estimator) estimator.innerHTML='Could not calculate shipping rates right now. Please check the address or choose Pickup/Local Delivery.';
    if(showAlert) alert('Shipping rate error: '+err.message);
    renderCart();
    return false;
  }
}

function updateDeliveryFields(){
  let type=document.getElementById('orderType').value;
  const fields=document.getElementById('deliveryFields');
  const addressHidden=document.querySelector('[name="address"]');
  fields.classList.toggle('hidden', type==='Pickup');
  setAddressRequired(type !== 'Pickup');

  document.querySelectorAll('[data-schedule-field]').forEach(el=>{
    el.classList.toggle('hidden', type==='Mail Shipping');
    const input=el.querySelector('input');
    if(input) input.required = type !== 'Mail Shipping';
  });

  let estimator=document.getElementById('deliveryEstimator');
  if(!estimator){
    estimator=document.createElement('div');
    estimator.id='deliveryEstimator';
    estimator.className='note';
    fields.appendChild(estimator);
  }

  calculatedDelivery={fee:0,miles:null,available:false,address:''};

  if(type==='Local Delivery'){
    estimator.innerHTML='Enter the delivery address, then click <button type="button" class="btn secondary" onclick="calculateDeliveryFee(true)">Calculate Delivery Fee</button><br><small>The website will calculate distance automatically. Customers do not need to choose miles.</small>';
  }else if(type==='Mail Shipping'){
    estimator.innerHTML='<b>Mail Shipping:</b> Enter the full mailing address, then click <button type="button" class="btn secondary" onclick="calculateShippingRates(true)">Calculate Shipping</button><br><small>Reminder: Cheesecake items cannot be shipped.</small>';
  }else{
    if(estimator) estimator.innerHTML='';
    if(addressHidden) addressHidden.value='';
  }
  renderCart();
}

async function calculateDeliveryFee(showAlert=true){
  const address=buildFullAddress();
  syncFullAddress();
  const parts=getAddressParts();
  const estimator=document.getElementById('deliveryEstimator');
  if(!parts.street || !parts.city || !parts.state || !parts.zip){ if(showAlert) alert('Please enter street address, city, state, and ZIP code.'); return false; }
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
  if(!validatePrepTime()) return;
  if(selectedType==='Mail Shipping'){
    const ok=selectedShippingRate ? true : await calculateShippingRates(false);
    if(!ok || !selectedShippingRate){alert('Please calculate and choose a shipping option before checkout.');return}
  }
  if(selectedType==='Local Delivery'){
    const ok=await calculateDeliveryFee(false);
    if(!ok){alert('Local delivery is only available within 20 miles. Please enter a valid local delivery address or choose Pickup.');return}
  }
  const form=e.target;
  syncFullAddress();
  if(selectedType !== 'Pickup'){
    const parts=getAddressParts();
    if(!parts.street || !parts.city || !parts.state || !parts.zip){
      alert('Please enter street address, city, state, and ZIP code.');
      return;
    }
  }
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
      selectedShippingRate:selectedShippingRate,
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

function renderAdmin(){}

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

function exportOrders(){}
function clearOrders(){}

init();