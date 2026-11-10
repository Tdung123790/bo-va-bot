const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=process.cwd();
const profile=path.resolve(root,'.verify-migration-profile-'+process.pid);
const output=path.resolve(root,'reference/migration-verification');
fs.mkdirSync(profile,{recursive:true});
fs.mkdirSync(output,{recursive:true});
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--force-device-scale-factor=1','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  let port;
  for(let i=0;i<100;i++){
    const active=path.join(profile,'DevToolsActivePort');
    if(fs.existsSync(active)){port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);break;}
    await sleep(100);
  }
  if(!port)throw Error('Chrome DevTools unavailable');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(item=>item.type==='page');
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;
  const pending=new Map();
  const errors=[];
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(!message.id)return;
    const item=pending.get(message.id);
    if(!item)return;
    pending.delete(message.id);
    message.error?item.reject(Error(message.error.message)):item.resolve(message.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const next=++id;
    pending.set(next,{resolve,reject});
    socket.send(JSON.stringify({id:next,method,params}));
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const viewport=async(width,height)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const navigate=async file=>{await send('Page.navigate',{url:'http://127.0.0.1:4173/'+file});await sleep(850);};
  const check=async label=>{const value=await evaluate('({title:document.title,route:location.pathname,over:document.documentElement.scrollWidth>document.documentElement.clientWidth,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,offenders:[...document.querySelectorAll("body *")].filter(x=>x.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(x=>({tag:x.tagName,class:x.className?.baseVal??x.className,right:Math.round(x.getBoundingClientRect().right)}))})');console.log(JSON.stringify({label,...value}));};
  const screenshot=async(label,width,height)=>{
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
    fs.writeFileSync(path.join(output,label+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await viewport(1440,900);
  await navigate('index.html');
  const member=await evaluate(`(async()=>{const a=await import('./js/services/authService.js');const r=await a.register({email:'migration-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomUUID(),displayName:'Khách Kiểm Thử'});return {id:r.member.contactId}})()`);
  console.log(JSON.stringify({label:'test-member-created',hasId:!!member.id}));
  await evaluate(`(async()=>{const w=await import('./js/services/wishlistService.js');await w.toggle('9241fed9-db27-4ee3-be8a-5db690d110bd')})()`);

  await navigate('wishlist.html');
  console.log(JSON.stringify({label:'wishlist-initial',value:await evaluate('({cards:document.querySelectorAll(".wishlist-card").length,name:document.querySelector(".wishlist-card h2")?.textContent,empty:!!document.querySelector(".wishlist-empty")})')}));
  await screenshot('wishlist-auth',1440,900);
  await evaluate('document.querySelector(".wishlist-card__add").click()');
  await sleep(500);
  console.log(JSON.stringify({label:'wishlist-add-cart',value:await evaluate('JSON.parse(localStorage.getItem("bobot:v1:guestCart")||"[]").length')}));
  await evaluate('document.querySelector(".wishlist-card__remove").click()');
  await sleep(400);
  console.log(JSON.stringify({label:'wishlist-remove',value:await evaluate('({cards:document.querySelectorAll(".wishlist-card").length,empty:!!document.querySelector(".wishlist-empty")})')}));
  await viewport(390,844);await check('wishlist-mobile');await screenshot('wishlist-empty',390,844);

  await viewport(1440,900);await navigate('product.html?id=9241fed9-db27-4ee3-be8a-5db690d110bd');
  await evaluate('document.querySelector(".detail-heart--media").click()');await sleep(300);
  console.log(JSON.stringify({label:'product-wishlist-sync',value:await evaluate('[...document.querySelectorAll(".detail-heart")].map(x=>x.getAttribute("aria-pressed"))')}));
  await evaluate('document.querySelector(".detail-heart--action").click()');await sleep(300);

  await navigate('customize.html');
  console.log(JSON.stringify({label:'customize-initial',value:await evaluate('({size:document.querySelectorAll("#cake-sizes input").length,flavor:document.querySelectorAll("#cake-flavors input").length,cream:document.querySelectorAll("#cake-creams input").length,total:document.querySelector("#cake-total").textContent,color:document.querySelector("#cake-colors input:checked")?.value,image:document.querySelector("#cake-image").naturalWidth})')}));
  await screenshot('customize',1440,900);
  await evaluate(`(()=>{document.querySelector('#cake-sizes input[value="20"]').click();document.querySelector('#cake-flavors input[value="chocolate"]').click();document.querySelector('#cake-creams input[value="butter"]').click();const input=document.querySelector('#cake-text');input.value='Chúc mừng';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  console.log(JSON.stringify({label:'customize-change',value:await evaluate('({total:document.querySelector("#cake-total").textContent,preview:document.querySelector("#cake-preview-text").textContent})')}));
  await evaluate('document.querySelector("#cake-add").click()');await sleep(500);
  console.log(JSON.stringify({label:'customize-add',value:await evaluate('({feedback:document.querySelector("#cake-feedback").textContent,cakes:JSON.parse(localStorage.getItem("bobot:v1:customCakes")||"[]").length,cart:JSON.parse(localStorage.getItem("bobot:v1:guestCart")||"[]").length})')}));
  console.log(JSON.stringify({label:'customize-cart-price',value:await evaluate(`(async()=>{const cart=await import('./js/services/cartService.js');const order=await import('./js/services/orderService.js');const row=cart.getCart().find(x=>x.customCakeId);const quote=await order.calculateOrder({items:[row],fulfillmentType:'pickup'});return {cartUnitPrice:row.unitPrice,quoteUnitPrice:quote.items[0].unit_price,quoteSubtotal:quote.subtotal}})()`)}));
  await evaluate('document.querySelector("#cart-checkout")?.click()');await sleep(600);
  console.log(JSON.stringify({label:'checkout-open',value:await evaluate('({open:document.querySelector("#checkout-dialog")?.open,total:document.querySelector("#checkout-total")?.textContent})')}));
  await evaluate(`(()=>{const form=document.querySelector('#checkout-form');form.querySelector('[name="customerName"]').value='Khách Kiểm Thử';form.querySelector('[name="customerPhone"]').value='0912345678';form.querySelector('[name="fulfillmentType"][value="pickup"]').click();const tomorrow=new Date(Date.now()+86400000);form.querySelector('[name="deliveryDate"]').value=tomorrow.getFullYear()+'-'+String(tomorrow.getMonth()+1).padStart(2,'0')+'-'+String(tomorrow.getDate()).padStart(2,'0');form.requestSubmit();})()`);await sleep(600);
  console.log(JSON.stringify({label:'checkout-submit',value:await evaluate('({success:!document.querySelector("#checkout-success")?.hidden,orderCode:document.querySelector("#checkout-order-code")?.textContent,error:document.querySelector("#checkout-error")?.textContent})')}));
  console.log(JSON.stringify({label:'handoff-custom-cake-preservation',value:await evaluate(`(async()=>{const options=(await(await fetch('./data/cake-options.json')).json());const price=(size,flavor,cream)=>options.sizes.find(x=>x.id===size).price+options.flavors.find(x=>x.id===flavor).priceModifier+options.creams.find(x=>x.id===cream).priceModifier;const orders=JSON.parse(localStorage.getItem('bobot:v1:orders')||'[]');const order=orders.at(-1);const line=order?.items.find(x=>x.customization_data?.customCakeId);const cakes=JSON.parse(localStorage.getItem('bobot:v1:customCakes')||'[]');const cake=cakes.find(x=>x.id===line?.customization_data?.customCakeId);return {base:price('15','vanilla','whipping'),selected:price('20','chocolate','butter'),orderUnitPrice:line?.unit_price,designLinked:!!cake,design:{sizeId:cake?.sizeId,flavorId:cake?.flavorId,creamId:cake?.creamId,text:cake?.text,fontId:cake?.fontId,colorId:cake?.colorId},cartCleared:JSON.parse(localStorage.getItem('bobot:v1:guestCart')||'[]').length===0}})()`)}));
  if(process.argv.includes('--cake-only')){socket.close();return;}
  await viewport(390,844);await check('customize-mobile');

  await evaluate(`(()=>{const order={_id:crypto.randomUUID(),order_code:'TEST-MIGRATION',title:'TEST-MIGRATION',customer_id:${JSON.stringify(member.id)},customerName:'Khách Kiểm Thử',customerPhone:'0912345678',fulfillmentType:'pickup',deliveryAddress:'Nhận tại cửa hàng',total_amount:55000,order_status:'pending',status:'pending',created_at:new Date().toISOString(),itemsList:JSON.stringify([{name:'Red Velvet Cream Cheese Brownie',quantity:1}])};localStorage.setItem('bobot:v1:orders',JSON.stringify([order]));})()`);
  await viewport(1440,900);await navigate('profile.html');
  console.log(JSON.stringify({label:'profile',value:await evaluate('({name:document.querySelector("#profile-name")?.textContent,orders:document.querySelectorAll(".profile-order").length,code:document.querySelector(".profile-order__head strong")?.textContent})')}));
  await screenshot('profile-auth',1440,900);
  await viewport(390,844);await check('profile-mobile');await screenshot('profile-auth',390,844);

  await evaluate(`(()=>{const users=JSON.parse(localStorage.getItem('bobot:v1:users')||'[]');const user=users.find(x=>x.contactId===${JSON.stringify(member.id)});user.role='admin';localStorage.setItem('bobot:v1:users',JSON.stringify(users));})()`);
  await viewport(1440,900);await navigate('admin-orders.html');
  console.log(JSON.stringify({label:'admin',value:await evaluate('({visible:!document.querySelector("#admin-ui").hidden,rows:document.querySelectorAll(".admin-table tbody tr").length,code:document.querySelector(".admin-code")?.textContent})')}));
  await screenshot('admin-auth',1440,900);
  await evaluate(`(()=>{const input=document.querySelector('#admin-search');input.value='not-found';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  console.log(JSON.stringify({label:'admin-search',value:await evaluate('document.querySelector(".admin-empty")?.textContent')}));
  await evaluate(`(()=>{const input=document.querySelector('#admin-search');input.value='TEST-MIGRATION';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".admin-action")?.click()');await sleep(300);
  console.log(JSON.stringify({label:'admin-status-update',value:await evaluate('document.querySelector(".admin-status")?.textContent')}));
  await viewport(390,844);await check('admin-mobile');await screenshot('admin-auth',390,844);
  console.log(JSON.stringify({label:'admin-table-scroll',value:await evaluate('({accessible:document.querySelector(".admin-table-scroll")?.tabIndex===0,scrollable:document.querySelector(".admin-table-scroll")?.scrollWidth>document.querySelector(".admin-table-scroll")?.clientWidth})')}));
  for(const [file,label] of [['wishlist.html','wishlist'],['customize.html','customize'],['profile.html','profile'],['admin-orders.html','admin']]){
    for(const [width,height] of [[768,1024],[360,800]]){
      await viewport(width,height);await navigate(file);await check(label+'-'+width);
    }
  }
  await viewport(1440,900);await navigate('menu.html');
  console.log(JSON.stringify({label:'menu-initial',value:await evaluate('({cards:document.querySelectorAll(".product-card--menu").length,titles:[...document.querySelectorAll(".product-card--menu .product-card__title")].filter(x=>!x.textContent.trim()).length,broken:[...document.querySelectorAll(".product-card--menu img")].filter(x=>x.complete&&!x.naturalWidth&&!x.hidden).length})')}));
  await evaluate(`(()=>{const input=document.querySelector('#product-search');input.value='red velvet';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  console.log(JSON.stringify({label:'menu-search',value:await evaluate('({cards:document.querySelectorAll(".product-card--menu").length,hidden:[...document.querySelectorAll(".product-card--menu")].filter(x=>getComputedStyle(x).opacity==="0").length})')}));
  await evaluate(`(()=>{const input=document.querySelector('#product-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('#product-sort');select.value='price-desc';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  console.log(JSON.stringify({label:'menu-sort',value:await evaluate('({cards:document.querySelectorAll(".product-card--menu").length,sort:document.querySelector("#product-sort").value})')}));
  await evaluate('document.querySelector("#category-filters button:nth-child(2)")?.click()');
  console.log(JSON.stringify({label:'menu-filter',value:await evaluate('({cards:document.querySelectorAll(".product-card--menu").length,active:document.querySelector("#category-filters [aria-pressed=true]")?.textContent})')}));
  await evaluate('document.querySelector("#clear-filters")?.click()');
  await viewport(390,844);await check('menu-mobile');
  console.log(JSON.stringify({label:'menu-after-reset',value:await evaluate('document.querySelectorAll(".product-card--menu").length')}));
  const routes=['index.html','about.html','promotions.html','promotion-detail.html?id=0868b951-23be-4925-92e0-6d35dae6a6a8','reviews.html','contact.html','product.html?id=9241fed9-db27-4ee3-be8a-5db690d110bd','menu.html','wishlist.html','customize.html','profile.html','admin-orders.html','login.html','404.html'];
  for(const [width,height] of [[1440,900],[390,844]]){
    await viewport(width,height);
    for(const route of routes){await navigate(route);const state=await evaluate('({main:!!document.querySelector("main"),heading:!!document.querySelector("h1"),over:document.documentElement.scrollWidth>document.documentElement.clientWidth})');console.log(JSON.stringify({label:'route-regression',route,width,...state}));}
  }
  console.log(JSON.stringify({label:'runtime-errors',errors}));
  socket.close();
}

main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>chrome.kill());
