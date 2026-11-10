const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const profile=fs.mkdtempSync(path.join(root,'.business-sprint1-profile-'));
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--force-device-scale-factor=1','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  let port;
  for(let attempt=0;attempt<100;attempt++){
    const active=path.join(profile,'DevToolsActivePort');
    if(fs.existsSync(active)){port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);break;}
    await sleep(100);
  }
  assert(port,'Chrome DevTools unavailable');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target=targets.find(item=>item.type==='page');
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map(),errors=[],networkErrors=[];
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Network.responseReceived'&&message.params.response.status>=400&&message.params.response.url.startsWith('http://127.0.0.1:4173/')&&!message.params.response.url.endsWith('/favicon.ico'))networkErrors.push(message.params.response.url);
    if(!message.id)return;
    const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
    message.error?request.reject(Error(message.error.message)):request.resolve(message.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const navigate=async file=>{await send('Page.navigate',{url:'http://127.0.0.1:4173/'+file});await sleep(550);};
  const viewport=(width,height)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const waitFor=async expression=>{for(let attempt=0;attempt<50;attempt++){if(await evaluate(expression))return;await sleep(200);}throw Error('Timed out waiting for '+expression);};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await viewport(1440,900);await navigate('menu.html');

  const promotion=await evaluate(`(async()=>{const m=await import('./js/services/promotionService.js');const lines=[{productId:'cake-a',categoryId:'cakes',unitPrice:100000,quantity:1}];const common={status:'active',startDate:'2026-01-01',endDate:'2026-12-31',targetType:'ALL',minOrderValue:0};const at=new Date('2026-11-04T05:00:00Z');const best=m.selectAutomaticPromotion(lines,[{...common,id:'b',discountPercent:10},{...common,id:'a',discountType:'fixed',discountValue:12000}],{today:at});const tie=m.selectAutomaticPromotion(lines,[{...common,id:'z',discountType:'fixed',discountValue:10000},{...common,id:'a',discountPercent:10}],{today:at});const none=m.selectAutomaticPromotion(lines,[{...common,id:'x',startDate:'2026-12-01',discountPercent:90}],{today:at});const missingTarget=m.selectAutomaticPromotion(lines,[{...common,id:'x',targetType:'PRODUCT',discountPercent:90}],{today:at});const capped=m.selectAutomaticPromotion(lines,[{...common,id:'x',discountType:'fixed',discountValue:999999}],{today:at});return {best:best.promotionId,discount:best.discount,tie:tie.promotionId,none:none.discount,missingTarget:missingTarget.discount,capped:capped.discount}})()`);
  assert.deepEqual(promotion,{best:'a',discount:12000,tie:'a',none:0,missingTarget:0,capped:100000});
  const unknownTarget=await evaluate(`(async()=>{const {selectAutomaticPromotion}=await import('./js/services/promotionService.js');return selectAutomaticPromotion([{productId:'a',unitPrice:100000,quantity:1}],[{id:'unknown',status:'active',discountPercent:20}],{today:new Date('2026-11-04T05:00:00Z')}).discount})()`);
  assert.equal(unknownTarget,0);
  console.log('PASS automatic promotion, tie-break, no-match, target relation, cap');

  const time=await evaluate(`(async()=>{const {validateRequestedAt}=await import('./js/services/orderService.js');const now=new Date('2026-11-04T05:00:00Z');const check=(date,hour)=>{try{validateRequestedAt(date,hour,{hasCustomCake:true,now});return true}catch{return false}};return {exact:check('2026-11-05','12:00'),short:check('2026-11-05','11:59'),past:check('2026-11-04','11:00')}})()`);
  assert.deepEqual(time,{exact:true,short:false,past:false});
  const guest=await evaluate(`(async()=>{const {createOrder}=await import('./js/services/orderService.js');try{await createOrder({});return false}catch(error){return error.message.includes('đăng nhập')}})()`);
  assert(guest);
  console.log('PASS guest service guard and custom-cake 24-hour boundary');

  const testEmail='business-'+crypto.randomUUID()+'@example.invalid',testPassword=crypto.randomUUID();
  await evaluate(`(async()=>{const auth=await import('./js/services/authService.js');await auth.register({email:${JSON.stringify(testEmail)},password:${JSON.stringify(testPassword)},displayName:'Khách Sprint Một'});auth.logout();const cart=await import('./js/services/cartService.js');await cart.addToCart({itemId:'9241fed9-db27-4ee3-be8a-5db690d110bd'});cart.openCart()})()`);
  await waitFor('document.querySelector("#cart-drawer")?.open');
  await evaluate('document.querySelector("#cart-checkout").click()');
  await waitFor('location.pathname.endsWith("/login.html")');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("bobot:v1:guestCart")||"[]").length'),1);
  await waitFor('!!document.querySelector("#account-form")');await evaluate("import('./js/pages/login.js').then(()=>true)");
  await evaluate(`(()=>{document.querySelector('#member-email').value=${JSON.stringify(testEmail)};document.querySelector('#member-password').value=${JSON.stringify(testPassword)};document.querySelector('#account-form').requestSubmit()})()`);
  await waitFor('location.pathname.endsWith("/menu.html")');
  await waitFor('document.querySelector("#checkout-dialog")?.open');
  const resumed=await evaluate('({cart:JSON.parse(localStorage.getItem("bobot:v1:guestCart")||"[]").length,coupon:!!document.querySelector("#checkout-coupon"),time:!!document.querySelector("#checkout-time"),methods:[...document.querySelectorAll("[name=paymentMethod]")].map(x=>x.value)})');
  assert.deepEqual(resumed,{cart:1,coupon:false,time:true,methods:['bank_transfer_demo']});
  console.log('PASS guest redirect, login resume, cart preserved, voucher removed');

  await evaluate(`(()=>{const form=document.querySelector('#checkout-form');form.querySelector('[name=customerName]').value='Khách Sprint Một';form.querySelector('[name=customerPhone]').value='0912345678';form.querySelector('[name=fulfillmentType][value=pickup]').click();const d=new Date(Date.now()+48*3600000);const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));form.querySelector('[name=deliveryDate]').value=p.year+'-'+p.month+'-'+p.day;form.querySelector('[name=deliveryTime]').value=p.hour+':'+p.minute;form.requestSubmit();form.requestSubmit()})()`);
  await waitFor('!document.querySelector("#checkout-success")?.hidden');
  const cod=await evaluate('(()=>{const orders=JSON.parse(localStorage.getItem("bobot:v1:orders")||"[]");const session=JSON.parse(localStorage.getItem("bobot:v1:session")||"null");return {count:orders.length,method:orders[0]?.payment_method,status:orders[0]?.payment_status,customer:orders[0]?.customer_id===session.contactId,discount:orders[0]?.discount_amount}})()');
  assert.deepEqual(cod,{count:1,method:'cod',status:'unpaid',customer:true,discount:0});
  console.log('PASS COD order, customer ID, no fake promotion, duplicate submit');

  const custom=await evaluate(`(async()=>{const cakes=await import('./js/services/customCakeService.js');const cart=await import('./js/services/cartService.js');const orders=await import('./js/services/orderService.js');const config=await cakes.createCake({sizeId:'20',flavorId:'chocolate',creamId:'butter',fontId:'font-caveat',colorId:'#4A3728',text:'Chúc mừng'});await cart.addToCart({itemId:'416febf3-47f1-47a8-b476-107abd5395f0',customCakeId:config.id});const now=new Date();const format=instant=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {deliveryDate:p.year+'-'+p.month+'-'+p.day,deliveryTime:p.hour+':'+p.minute}};let shortRejected=false;try{await orders.createOrder({...format(new Date(+now+23*3600000)),customerName:'Khách Sprint Một',customerPhone:'0912345678',fulfillmentType:'pickup',paymentMethod:'bank_transfer_demo'})}catch(error){shortRejected=error.message.includes('24 giờ')}const input={...format(new Date(+now+26*3600000)),customerName:'Khách Sprint Một',customerPhone:'0912345678',fulfillmentType:'pickup',paymentMethod:'bank_transfer_demo',requestId:crypto.randomUUID()};const [a,b]=await Promise.all([orders.createOrder(input),orders.createOrder(input)]);const all=orders.getOrders();const line=a.order.items.find(x=>x.customization_data?.customCakeId);const blockedPayment=await import('./js/services/paymentService.js').then(m=>{try{m.confirmDemoPayment({orderId:a.orderId});return false}catch{return true}});return {shortRejected,sameOrder:a.orderId===b.orderId,count:all.length,price:line.unit_price,config:line.customization_data,method:a.order.payment_method,payment:a.order.payment_status,orderStatus:a.order.order_status,cart:cart.getCart().length,blockedPayment,orderId:a.orderId}})()`);
  assert(custom.shortRejected&&custom.sameOrder&&custom.count===2&&custom.price===430000&&custom.method==='bank_transfer_demo'&&custom.payment==='pending'&&custom.orderStatus==='pending'&&custom.cart===0&&custom.blockedPayment);
  assert.equal(custom.config.text,'Chúc mừng');assert.equal(custom.config.sizeId,'20');assert.equal(custom.config.colorId,'#4A3728');
  console.log('PASS custom lead time, configuration snapshot, idempotency, transfer pending, customer cannot confirm');

  await evaluate(`(()=>{const users=JSON.parse(localStorage.getItem('bobot:v1:users'));users.find(x=>x.email===${JSON.stringify(testEmail)}).role='admin';localStorage.setItem('bobot:v1:users',JSON.stringify(users))})()`);
  await navigate('admin-orders.html');
  await waitFor('document.querySelectorAll(".admin-table tbody tr").length===2');
  const adminBefore=await evaluate('({rows:document.querySelectorAll(".admin-table tbody tr").length,paymentButtons:document.querySelectorAll(".admin-action--payment").length})');
  assert.equal(adminBefore.rows,2);assert.equal(adminBefore.paymentButtons,2);
  await evaluate(`document.querySelector('.admin-table tbody tr button.admin-action--payment').click()`);
  await waitFor(`JSON.parse(localStorage.getItem('bobot:v1:orders')).find(x=>x._id===${JSON.stringify(custom.orderId)})?.payment_status==='paid'`);
  const paid=await evaluate(`(async()=>{const payment=await import('./js/services/paymentService.js');const service=await import('./js/services/orderService.js');let duplicateRejected=false;try{payment.confirmDemoPayment({orderId:${JSON.stringify(custom.orderId)}})}catch{duplicateRejected=true}const order=service.getOrders().find(x=>x._id===${JSON.stringify(custom.orderId)});return {payment:order.payment_status,orderStatus:order.order_status,history:payment.getPaymentHistory(order._id).length,duplicateRejected}})()`);
  assert.deepEqual(paid,{payment:'paid',orderStatus:'pending',history:1,duplicateRejected:true});
  await navigate('profile.html');await waitFor('document.querySelectorAll(".profile-order").length===2');
  await navigate('customize.html');await waitFor('document.querySelectorAll("#cake-sizes input").length===3');
  await navigate('menu.html');await waitFor('document.querySelectorAll(".product-card--menu").length===65');
  await navigate('promotion-detail.html?id=4aeb1634-c791-4b1c-837e-515a9bcfa857');
  await waitFor('!!document.querySelector(".promo-detail__discount")');
  assert.equal(await evaluate('!!document.querySelector(".promo-detail__coupon")||document.querySelector(".promo-detail__discount").textContent.includes("Nhập mã:")'),false);
  console.log('PASS payment confirmation, no duplicate history, independent order status, page regressions');

  const hardening=await evaluate(`(async()=>{const auth=await import('./js/services/authService.js');const cart=await import('./js/services/cartService.js');const orders=await import('./js/services/orderService.js');const payment=await import('./js/services/paymentService.js');const admin=await import('./js/services/adminOrderService.js');const users=JSON.parse(localStorage.getItem('bobot:v1:users'));const user=users.find(x=>x.email===${JSON.stringify(testEmail)});user.role='customer';localStorage.setItem('bobot:v1:users',JSON.stringify(users));await cart.addToCart({itemId:'9241fed9-db27-4ee3-be8a-5db690d110bd'});const d=new Date(Date.now()+48*3600000);const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));const base={customerName:'Khách Sprint Một',customerPhone:'0912345678',fulfillmentType:'pickup',deliveryDate:p.year+'-'+p.month+'-'+p.day,deliveryTime:p.hour+':'+p.minute};const [cod,bank]=await Promise.all([orders.createOrder({...base,paymentMethod:'cod',requestId:'hardening-cod'}),orders.createOrder({...base,paymentMethod:'bank_transfer_demo',requestId:'hardening-bank'})]);const separate=cod.orderId!==bank.orderId;const all=orders.getOrders();const records=all.map(x=>['hardening-cod','hardening-bank'].includes(x.client_request_id)?{...x,order_status:'cancelled',status:'cancelled'}:x);localStorage.setItem('bobot:v1:orders',JSON.stringify(records));user.role='staff';localStorage.setItem('bobot:v1:users',JSON.stringify(users));let denied=0;for(const id of [cod.orderId,bank.orderId])try{payment.confirmDemoPayment({orderId:id})}catch(error){if(error.message.includes('đã hủy'))denied++}let adminDenied=false;try{await admin.getAdminOrders()}catch{adminDenied=true}const first=records.find(x=>x.payment_method==='cod'&&x.order_status==='pending');const paid=payment.confirmDemoPayment({orderId:first._id});let repeatDenied=false;try{payment.confirmDemoPayment({orderId:first._id})}catch{repeatDenied=true}return {separate,count:orders.getOrders().length,cod:orders.getOrders().find(x=>x._id===cod.orderId),bank:orders.getOrders().find(x=>x._id===bank.orderId),codHistory:payment.getPaymentHistory(cod.orderId).length,bankHistory:payment.getPaymentHistory(bank.orderId).length,denied,adminDenied,staffPaid:paid.order.payment_status,staffOrderStatus:paid.order.order_status,staffHistory:payment.getPaymentHistory(first._id).length,repeatDenied,codes:[cod.orderCode,bank.orderCode]}})()`);
  assert(hardening.separate&&hardening.count===4&&hardening.denied===2&&hardening.adminDenied&&hardening.repeatDenied);
  assert.deepEqual([hardening.cod.order_status,hardening.cod.payment_status,hardening.codHistory],['cancelled','unpaid',0]);
  assert.deepEqual([hardening.bank.order_status,hardening.bank.payment_status,hardening.bankHistory],['cancelled','pending',0]);
  assert.deepEqual([hardening.staffPaid,hardening.staffOrderStatus,hardening.staffHistory],['paid','pending',1]);
  const legacyMismatch=await evaluate(`(async()=>{const payment=await import('./js/services/paymentService.js');const rows=JSON.parse(localStorage.getItem('bobot:v1:orders'));const order=rows.find(x=>x.client_request_id==='hardening-cod');order.order_status='pending';localStorage.setItem('bobot:v1:orders',JSON.stringify(rows));let blocked=false;try{payment.confirmDemoPayment({orderId:order._id})}catch{blocked=true}return {blocked,status:order.status,payment:JSON.parse(localStorage.getItem('bobot:v1:orders')).find(x=>x._id===order._id).payment_status,history:payment.getPaymentHistory(order._id).length}})()`);
  assert.deepEqual(legacyMismatch,{blocked:true,status:'cancelled',payment:'unpaid',history:0});
  await navigate('admin-orders.html');
  assert.equal(await evaluate('document.querySelector("#admin-ui").hidden'),true);
  await evaluate(`(()=>{const users=JSON.parse(localStorage.getItem('bobot:v1:users'));users.find(x=>x.email===${JSON.stringify(testEmail)}).role='admin';localStorage.setItem('bobot:v1:users',JSON.stringify(users))})()`);
  await navigate('admin-orders.html');await waitFor('document.querySelectorAll(".admin-table tbody tr").length===4');
  for(const code of hardening.codes)assert.equal(await evaluate(`!![...document.querySelectorAll('.admin-table tbody tr')].find(row=>row.textContent.includes(${JSON.stringify(code)}))?.querySelector('.admin-action--payment')`),false);
  console.log('PASS independent request IDs, cancelled COD/bank blocked, status/history synchronized, Staff service versus Admin page permissions');

  for(const width of [1440,390]){
    await viewport(width,width===1440?900:844);
    for(const page of ['menu.html','customize.html','profile.html','admin-orders.html']){
      await navigate(page);
      const over=await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth');
      assert.equal(over,false,`${page} overflows at ${width}px`);
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
  console.log('PASS responsive 1440/390, no JS exceptions or local HTTP failures');
  socket.close();
}

main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  chrome.kill();await sleep(350);
  if(path.resolve(profile).startsWith(root+path.sep))try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});}catch(error){console.error('Temporary Chrome profile cleanup:',error.message);}
});
