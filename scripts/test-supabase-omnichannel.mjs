import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {localDbPassword} from './local-db-password.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await fs.readFile(path.join(root,'site/backend-config.local.json'),'utf8'));
assert.equal(new URL(config.url).hostname,'127.0.0.1');
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres'});
const client=()=>createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const run=(file,args=[])=>{const result=spawnSync(process.execPath,[file,...args],{cwd:root,encoding:'utf8',timeout:30000});if(result.status!==0)throw Error(result.stderr||result.stdout);return result.stdout;};
const reset=()=>spawnSync(process.platform==='win32'?'cmd.exe':'npx',process.platform==='win32'?['/d','/s','/c','npx.cmd supabase db reset --local --no-seed']:['supabase','db','reset','--local','--no-seed'],{cwd:root,encoding:'utf8',timeout:180000});
const pass=text=>console.log('PASS: '+text);
const day=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
const date=day(),schedule=new Date(Date.parse(date+'T05:00:00Z')+3*86400000).toISOString();
const runId=Date.now().toString(36),password='TEST-'+crypto.randomUUID()+'-Aa1!',accounts={};
let browser,server,disposable=false,failure;
async function ensureServer(){
 try{if((await fetch('http://127.0.0.1:4173/pos.html')).ok)return;}catch{}
 server=spawn(process.execPath,['scripts/serve-site.cjs'],{cwd:root,stdio:'ignore',windowsHide:true});
 for(let attempt=0;attempt<40;attempt++){await new Promise(resolve=>setTimeout(resolve,250));try{if((await fetch('http://127.0.0.1:4173/pos.html')).ok)return;}catch{}}
 throw Error('Local website server unavailable.');
}
try{
 run('scripts/verify-supabase-greenfield.mjs');disposable=true;
 await db.connect();
 for(const role of ['customer','staff','admin']){
  const api=client(),email=`TEST-sprint4-${role}-${runId}@example.test`;
  const {data,error}=await api.auth.signUp({email,password,options:{data:{full_name:'TEST '+role}}});
  assert.ifError(error);assert.ok(data.user?.id);
  accounts[role]={api,email,id:data.user.id};
 }
 await db.query("update public.profiles set role='staff' where id=$1",[accounts.staff.id]);
 await db.query("update public.profiles set role='admin' where id=$1",[accounts.admin.id]);
 run('scripts/import-catalog-local.mjs',['--test-fixture','--apply']);
 const product=(await db.query("select id from public.products where source_id='TEST-sprint35-product'")).rows[0].id;
 const category=(await db.query("select id from public.categories where source_id='TEST-sprint35-category'")).rows[0].id;
 const store='scripts/fixtures/store-settings.TEST.json',hash=run('scripts/configure-store-local.mjs',['--config',store]).match(/SHA-256: ([0-9a-f]{64})/)?.[1];
 assert.ok(hash);run('scripts/configure-store-local.mjs',['--config',store,'--confirm-hash',hash,'--operator','TEST operator','--apply']);
 const promotion=(await db.query("insert into public.promotions(source_id,name,discount_type,discount_value,target_type,usage_limit,starts_at,ends_at,status) values($1,'TEST POS 10 percent','PERCENT',10,'ALL',2,now()-interval '1 day',now()+interval '7 days','active') returning id",['TEST-pos-promo-'+runId])).rows[0].id;
 const guest=client(),staff=accounts.staff.api,customer=accounts.customer.api,admin=accounts.admin.api;
 const counter={items:[{product_id:product,quantity:1}],fulfillment_type:'counter',points_used:0};
 const quote=await staff.rpc('quote_order',{p_request:counter});assert.ifError(quote.error);assert.equal(quote.data.total_amount,90000);
 const forbiddenGuest=await guest.rpc('record_pos_sale',{p_request:{...counter,payment_method:'cash_demo',request_id:'TEST-guest'}});assert.ok(forbiddenGuest.error);
 const forbiddenCustomer=await customer.rpc('record_pos_sale',{p_request:{...counter,payment_method:'cash_demo',request_id:'TEST-customer'}});assert.ok(forbiddenCustomer.error);
 for(const extra of [{customer_id:accounts.customer.id},{pos_link_code:'TEST-expired-or-replayed'},{verification_code:'TEST-forged'}]){
  const result=await staff.rpc('record_pos_sale',{p_request:{...counter,...extra,payment_method:'cash_demo',request_id:'TEST-link-'+crypto.randomUUID()}});
  assert.match(result.error?.message||'',/POS_CUSTOMER_LINK_REQUIRES_VERIFICATION/);
 }
 assert.equal((await db.query('select count(*)::integer as n from public.orders')).rows[0].n,0);
 for(const result of [
  await staff.from('products').update({base_price:1}).eq('id',product),
  await staff.from('promotions').update({discount_value:100}).eq('id',promotion),
  await staff.from('profiles').update({role:'admin'}).eq('id',accounts.staff.id),
  await staff.from('loyalty_accounts').update({points:1000}).eq('customer_id',accounts.customer.id)])assert.ok(result.error);
 pass('Staff POS quote uses backend; Guest/Customer POS and Staff direct financial/role writes denied');
 const posRequest={...counter,payment_method:'cash_demo',request_id:'TEST-pos-'+runId};
 const sale=await staff.rpc('record_pos_sale',{p_request:posRequest});assert.ifError(sale.error);
 const replay=await staff.rpc('record_pos_sale',{p_request:posRequest});assert.ifError(replay.error);assert.equal(replay.data.order_id,sale.data.order_id);assert.equal(replay.data.replayed,true);
 const posRow=(await db.query("select sales_channel,fulfillment_type,customer_id,order_status,payment_status,total_amount from public.orders where id=$1",[sale.data.order_id])).rows[0];
 assert.deepEqual([posRow.sales_channel,posRow.fulfillment_type,posRow.customer_id,posRow.order_status,posRow.payment_status,Number(posRow.total_amount)],['offline','counter',null,'pending','unpaid',90000]);
 assert.equal((await db.query("select payment_method from public.payments where order_id=$1 and kind='charge'",[sale.data.order_id])).rows[0].payment_method,'cash_demo');
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[product])).rows[0].stock_quantity,9);
 assert.ifError((await staff.rpc('complete_pos_sale',{p_order:sale.data.order_id,p_cash_collected:true,p_handover:true})).error);
 pass('POS guest stays unpaid until cash collection and handover; replay does not duplicate stock/payment');
 const online={items:[{product_id:product,quantity:1}],fulfillment_type:'pickup',requested_at:schedule,points_used:0,payment_method:'cod',recipient_name:'TEST customer',recipient_phone:'0900000000',request_id:'TEST-online-'+runId};
 const onlineResult=await customer.rpc('create_online_order',{p_request:online});assert.ifError(onlineResult.error);
 assert.equal((await db.query('select used_count from public.promotions where id=$1',[promotion])).rows[0].used_count,2);
 const beforeCancel=(await db.query('select stock_quantity from public.products where id=$1',[product])).rows[0].stock_quantity;
 const cancel=await staff.rpc('cancel_order',{p_order:onlineResult.data.order_id,p_reason:'TEST khách đổi ý'});assert.ifError(cancel.error);
 const repeatCancel=await staff.rpc('cancel_order',{p_order:onlineResult.data.order_id,p_reason:'TEST khách đổi ý'});assert.ifError(repeatCancel.error);
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[product])).rows[0].stock_quantity,beforeCancel+1);
 assert.equal((await db.query('select used_count from public.promotions where id=$1',[promotion])).rows[0].used_count,1);
 assert.equal((await db.query("select count(*)::integer n from public.order_status_history where order_id=$1 and to_status='cancelled'",[onlineResult.data.order_id])).rows[0].n,1);
 pass('Staff cancellation restores stock and promotion quota once');
 const pending=await customer.rpc('create_online_order',{p_request:{...online,request_id:'TEST-late-'+runId}});assert.ifError(pending.error);
 for(const status of ['confirmed','preparing','completed'])assert.ifError((await staff.rpc('transition_order',{p_order:pending.data.order_id,p_next:status,p_handover:status==='completed'})).error);
 let dashboard=await admin.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'});assert.ifError(dashboard.error);
 assert.equal(Number(dashboard.data.summary.online_revenue),0);assert.equal(Number(dashboard.data.summary.offline_revenue),90000);
 assert.ok((await staff.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'})).error);
 assert.ok((await customer.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'})).error);
 assert.ok((await guest.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'})).error);
 assert.ifError((await staff.rpc('confirm_demo_payment',{p_order:pending.data.order_id,p_money_received:true})).error);
 dashboard=await admin.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'});assert.ifError(dashboard.error);
 assert.equal(Number(dashboard.data.summary.online_revenue),90000);assert.equal(Number(dashboard.data.summary.product_revenue),180000);
 assert.equal(Number(dashboard.data.summary.new_customers),1);assert.equal(Number(dashboard.data.summary.unique_customers),1);
 const refundRequest=await staff.rpc('request_demo_refund',{p_order:pending.data.order_id,p_request_id:'TEST-refund-'+runId,p_reason:'TEST approved refund'});assert.ifError(refundRequest.error);
 assert.ifError((await admin.rpc('approve_demo_refund',{p_refund:refundRequest.data.refund_id})).error);
 assert.ifError((await staff.rpc('execute_demo_refund',{p_refund:refundRequest.data.refund_id})).error);
 dashboard=await admin.rpc('admin_dashboard',{p_from:date,p_to:date,p_channel:'all'});assert.ifError(dashboard.error);
 assert.equal(Number(dashboard.data.summary.product_revenue),90000);
 assert.equal(Number(dashboard.data.summary.offline_revenue),90000);
 pass('Admin-only Dashboard: unpaid excluded, late payment recognized, refund deducted once, POS guest not a new Customer');
 await db.query("insert into public.products(source_id,category_id,name,base_price,stock_quantity,status) values($1,$2,'TEST stock race',100000,1,'active')",['TEST-stock-race-'+runId,category]);
 const raceProduct=(await db.query('select id from public.products where source_id=$1',['TEST-stock-race-'+runId])).rows[0].id;
 await db.query("update public.promotions set status='inactive' where id=$1",[promotion]);
 const raceOnline={...online,items:[{product_id:raceProduct,quantity:1}],request_id:'TEST-race-online-'+runId};
 const racePos={...counter,items:[{product_id:raceProduct,quantity:1}],payment_method:'cash_demo',request_id:'TEST-race-pos-'+runId};
 const race=await Promise.all([customer.rpc('create_online_order',{p_request:raceOnline}),staff.rpc('record_pos_sale',{p_request:racePos})]);
 assert.equal(race.filter(result=>!result.error).length,1);
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[raceProduct])).rows[0].stock_quantity,0);
 assert.equal((await db.query('select count(*)::integer n from public.orders where client_request_id like $1',['TEST-race-%'+runId])).rows[0].n,1);
 pass('Online/POS stock=1 race commits only one order');
 const operation=await customer.rpc('create_online_order',{p_request:{...online,request_id:'TEST-operation-'+runId}});assert.ifError(operation.error);
 const operationCode=(await db.query('select order_code from public.orders where id=$1',[operation.data.order_id])).rows[0].order_code;
 const scaleOrder=await customer.rpc('create_online_order',{p_request:{...online,request_id:'TEST-scale-'+runId}});assert.ifError(scaleOrder.error);
 assert.ifError((await staff.rpc('confirm_demo_payment',{p_order:scaleOrder.data.order_id,p_money_received:true})).error);
 for(const status of ['confirmed','preparing','completed'])assert.ifError((await staff.rpc('transition_order',{p_order:scaleOrder.data.order_id,p_next:status,p_handover:status==='completed'})).error);
 await ensureServer();
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:4173/login.html');
  await page.locator('#member-email').fill(accounts.staff.email);await page.locator('#member-password').fill(password);await page.locator('#auth-submit').click();await page.waitForURL('**/index.html');
  await page.goto('http://127.0.0.1:4173/pos.html');await page.getByText('TEST Regular Cake').first().waitFor();
  await page.locator('.pos-product').filter({hasText:'TEST Regular Cake'}).getByRole('button',{name:'Thêm vào giỏ'}).click();
  await page.waitForFunction(()=>document.querySelector('#pos-total')?.textContent?.includes('100.000'));
  await page.locator('#pos-submit').click();await page.waitForFunction(()=>document.querySelector('#pos-result')?.textContent?.includes('Tiền mặt demo'));
  await page.waitForFunction(()=>document.querySelector('#pos-cart')?.textContent?.includes('Chưa có sản phẩm.'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-pos-${viewport.width}.png`)});
  await page.goto('http://127.0.0.1:4173/staff-orders.html');await page.locator('.staff-order').first().waitFor();
  if(viewport.width===1440){
   const card=page.locator('.staff-order').filter({hasText:operationCode});
   await card.getByRole('button',{name:'Đã xác nhận'}).click();
   await page.waitForFunction(code=>[...document.querySelectorAll('.staff-order')].some(row=>row.textContent.includes(code)&&row.textContent.includes('Đơn: Đã xác nhận')),operationCode);
   await card.getByRole('button',{name:'Xác nhận thanh toán demo'}).click();
   await page.waitForFunction(code=>[...document.querySelectorAll('.staff-order')].some(row=>row.textContent.includes(code)&&row.textContent.includes('Thanh toán: paid')),operationCode);
   await card.locator('.staff-reason').fill('TEST hủy có lý do');await card.getByRole('button',{name:'Hủy đơn'}).click();
   await page.waitForFunction(code=>[...document.querySelectorAll('.staff-order')].some(row=>row.textContent.includes(code)&&row.textContent.includes('Đơn: Đã hủy')),operationCode);
   assert.equal((await db.query('select order_status from public.orders where id=$1',[operation.data.order_id])).rows[0].order_status,'cancelled');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-staff-${viewport.width}.png`)});
  await page.goto('http://127.0.0.1:4173/dashboard.html');
  assert.equal(await page.locator('#dashboard-app').isVisible(),false);
  await context.close();
  const adminContext=await browser.newContext({viewport}),adminPage=await adminContext.newPage();
  adminPage.on('pageerror',error=>errors.push(error.message));
  await adminPage.goto('http://127.0.0.1:4173/login.html');
  await adminPage.locator('#member-email').fill(accounts.admin.email);await adminPage.locator('#member-password').fill(password);await adminPage.locator('#auth-submit').click();await adminPage.waitForURL('**/index.html');
  await adminPage.goto('http://127.0.0.1:4173/dashboard.html');await adminPage.locator('.dashboard-kpi').first().waitFor();
  assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const channel of ['online','offline']){
   await adminPage.locator('#dashboard-channel').selectOption(channel);
   await adminPage.locator('#dashboard-filter button').click();
   await adminPage.waitForFunction(()=>document.querySelector('#dashboard-status')?.textContent==='Đã cập nhật số liệu từ Supabase.');
   assert.equal(await adminPage.locator('.dashboard-day-bar').last().evaluate(element=>element.style.height),'144px');
  }
  await adminPage.locator('#dashboard-channel').selectOption('all');
  await adminPage.locator('#dashboard-filter button').click();
  await adminPage.waitForFunction(()=>document.querySelector('#dashboard-status')?.textContent==='Đã cập nhật số liệu từ Supabase.');
  await adminPage.screenshot({path:path.join(os.tmpdir(),`bobot-dashboard-${viewport.width}.png`)});
  if(viewport.width===1440){
   const originalFrom=await adminPage.locator('#dashboard-from').inputValue(),originalTo=await adminPage.locator('#dashboard-to').inputValue();
   await adminPage.locator('#dashboard-from').fill('2000-01-01');await adminPage.locator('#dashboard-to').fill('2000-01-01');
   await adminPage.locator('#dashboard-filter button').click();
   await adminPage.locator('#dashboard-chart').getByText('Chưa có doanh thu completed + paid trong khoảng đã chọn.').waitFor();
   await adminPage.locator('#dashboard-from').fill(originalFrom);await adminPage.locator('#dashboard-to').fill(originalTo);
   let failOnce=true;
   await adminPage.route('**/rest/v1/rpc/admin_dashboard',route=>{if(failOnce){failOnce=false;return route.abort('failed');}return route.continue();});
   await adminPage.locator('#dashboard-filter button').click();
   await adminPage.locator('#dashboard-error').getByText('Không tải được Dashboard:',{exact:false}).waitFor();
   assert.equal(await adminPage.locator('#dashboard-filter button').isEnabled(),true);
   await adminPage.locator('#dashboard-filter button').click();
   await adminPage.waitForFunction(()=>document.querySelector('#dashboard-status')?.textContent==='Đã cập nhật số liệu từ Supabase.');
   assert.equal(await adminPage.locator('#dashboard-error').textContent(),'');
   await adminPage.unroute('**/rest/v1/rpc/admin_dashboard');
  }
  await adminContext.close();assert.deepEqual(errors,[]);
  pass(`Browser POS, Staff Orders, Dashboard ${viewport.width}px without overflow or JavaScript error`);
 }
}catch(error){failure=error;console.error('FAIL:',error.stack||error.message);}finally{
 if(browser)await browser.close().catch(()=>{});
 if(server)server.kill();
 await db.end().catch(()=>{});
 if(disposable){const clean=reset();if(clean.status===0)pass('local TEST fixture removed by database reset');else{console.error('BLOCKED TEST cleanup:',clean.stderr||clean.stdout);failure||=Error('TEST cleanup failed');}}
}
if(failure)process.exitCode=1;
