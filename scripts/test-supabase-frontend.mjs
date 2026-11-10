import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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
const pass=message=>console.log('PASS: '+message);
const days=offset=>{
 const date=new Date(Date.now()+offset*86400000);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}T12:00:00+07:00`;
};
const schedule=days(3);
const runId=Date.now().toString(36);
const password='TEST-'+crypto.randomUUID()+'-Aa1!';
const accounts={};
let browser;
let server;
let failure;
let disposable=false;
function runScript(file,parameters=[]){
 const result=spawnSync(process.execPath,[file,...parameters],{cwd:root,encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error(`Local script ${file} failed: ${[result.stdout,result.stderr].filter(Boolean).join('\n')}`);
 return result.stdout;
}
function resetLocal(){
 const command=process.platform==='win32'?'cmd.exe':'npx';
 const args=process.platform==='win32'?['/d','/s','/c','npx.cmd supabase db reset --local --no-seed']:['supabase','db','reset','--local','--no-seed'];
 return spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000});
}
async function ensureServer(){
 try{const response=await fetch('http://127.0.0.1:4173/menu.html');if(response.ok)return;}catch{}
 server=spawn(process.execPath,['scripts/serve-site.cjs'],{cwd:root,stdio:'ignore',windowsHide:true});
 for(let attempt=0;attempt<40;attempt++){
  await new Promise(resolve=>setTimeout(resolve,250));
  try{const response=await fetch('http://127.0.0.1:4173/menu.html');if(response.ok)return;}catch{}
 }
 throw Error('Local HTTP server did not start on 127.0.0.1:4173');
}
try{
 runScript('scripts/verify-supabase-greenfield.mjs');
 disposable=true;
 const clean=resetLocal();if(clean.status!==0)throw Error('Cannot prepare local TEST database: '+[clean.stdout,clean.stderr].filter(Boolean).join('\n'));
 await db.connect();
 for(const role of ['customerA','customerB','staff','admin']){
  const api=client(),email=`test-${role.toLowerCase()}-${runId}@example.test`;
  const {data,error}=await api.auth.signUp({email,password,options:{data:{full_name:`TEST ${role}`}}});
  assert.ifError(error);
  assert.ok(data.user?.id);
  accounts[role]={api,email,id:data.user.id};
  const {data:profile,error:profileError}=await api.from('profiles').select('id,role,status,full_name').eq('id',data.user.id).single();
  assert.ifError(profileError);assert.equal(profile.id,data.user.id);assert.equal(profile.role,'customer');
 }
 pass('Auth sign-up creates Customer profiles through trigger');
 const customer=accounts.customerA.api;
 assert.ifError((await customer.auth.signOut()).error);
 assert.ifError((await customer.auth.signInWithPassword({email:accounts.customerA.email,password})).error);
 assert.equal((await customer.auth.getUser()).data.user.id,accounts.customerA.id);
 pass('Supabase Auth login, logout, session');
 await db.query("update public.profiles set role='staff' where id=$1",[accounts.staff.id]);
 runScript('scripts/bootstrap-admin-local.mjs',['--user-id',accounts.admin.id]);
 runScript('scripts/bootstrap-admin-local.mjs',['--apply','--user-id',accounts.admin.id,'--confirm-id',accounts.admin.id,'--operator','TEST local operator','--reason','TEST fixture validation']);
 assert.equal((await db.query("select count(*)::integer as n from public.audit_log where action='first_admin_bootstrap' and entity_id=$1",[accounts.admin.id])).rows[0].n,1);
 pass('First Admin bootstrapped through trusted local script with audit');
 runScript('scripts/import-catalog-local.mjs',['--test-fixture']);
 runScript('scripts/import-catalog-local.mjs',['--apply','--test-fixture']);
 runScript('scripts/import-catalog-local.mjs',['--apply','--test-fixture']);
 assert.equal((await db.query("select count(*)::integer as n from public.products where source_id like 'TEST-sprint35-%'")).rows[0].n,2);
 const regular=(await db.query("select id from public.products where source_id='TEST-sprint35-product'")).rows[0].id;
 const custom=(await db.query("select id from public.products where source_id='TEST-sprint35-custom'")).rows[0].id;
 const optionIds={};
 for(const role of ['size','flavor','cream','font','color']){
  optionIds[role]=(await db.query(`select o.id from public.customization_options o join public.customization_categories c on c.id=o.category_id where c.pricing_role=$1 and o.source_key=$2`,[role,role==='font'?'font-caveat':role==='color'?'#E57373':`TEST-${role}`])).rows[0].id;
 }
 const storeFixture='scripts/fixtures/store-settings.TEST.json';
 const dryStore=runScript('scripts/configure-store-local.mjs',['--config',storeFixture]);
 const storeHash=dryStore.match(/Store config SHA-256: ([0-9a-f]{64})/)?.[1];assert.ok(storeHash);
 runScript('scripts/configure-store-local.mjs',['--apply','--config',storeFixture,'--confirm-hash',storeHash,'--operator','TEST local operator']);
 assert.match(runScript('scripts/configure-store-local.mjs',['--apply','--config',storeFixture,'--confirm-hash',storeHash,'--operator','TEST local operator']),/NO CHANGE/);
 assert.equal((await db.query("select count(*)::integer as n from public.audit_log where action='store_settings_local_approved'")).rows[0].n,1);
 const promotion=(await db.query("insert into public.promotions(source_id,name,discount_type,discount_value,target_type,starts_at,ends_at,status) values($1,'TEST 10 percent','PERCENT',10,'ALL',now()-interval '1 day',now()+interval '7 days','active') returning id",[`TEST-promo-${runId}`])).rows[0].id;
 await db.query('update public.loyalty_accounts set points=2000,total_earned=2000 where customer_id=$1',[accounts.customerA.id]);
 await db.query("insert into public.loyalty_transactions(customer_id,points,gross_points,transaction_type,event_key,description) values($1,2000,2000,'EARN',$2,'TEST opening balance')",[accounts.customerA.id,`TEST-opening-${runId}`]);
 pass('TEST catalog importer idempotent; store settings script idempotent; promotion and loyalty TEST fixture ready');
 const item={product_id:regular,quantity:1};
 const base={items:[item],fulfillment_type:'pickup',requested_at:schedule,points_used:0};
 const guest=client();
 const guestResult=await guest.rpc('create_online_order',{p_request:{...base,request_id:'TEST-guest',payment_method:'cod',recipient_name:'TEST Guest',recipient_phone:'0900000000'}});
 assert.ok(guestResult.error);pass('Guest cannot create online order');
 const quote=await customer.rpc('quote_order',{p_request:base});assert.ifError(quote.error);
 assert.equal(quote.data.subtotal,100000);assert.equal(quote.data.discount_amount,10000);
 pass('Data API quote uses backend catalog and promotion');
 const pointsQuote=await customer.rpc('quote_order',{p_request:{...base,points_used:1000}});assert.ifError(pointsQuote.error);assert.equal(pointsQuote.data.total_amount,80000);
 const overCap=await customer.rpc('quote_order',{p_request:{...base,points_used:1801}});assert.ok(overCap.error);
 const staleQuote=await customer.rpc('quote_order',{p_request:{...base,points_used:1800}});assert.ifError(staleQuote.error);
 const orderRequest={...base,points_used:1000,request_id:`TEST-cod-${runId}`,payment_method:'cod',recipient_name:'TEST Customer',recipient_phone:'0900000000'};
 const first=await customer.rpc('create_online_order',{p_request:orderRequest});assert.ifError(first.error);assert.ok(first.data.order_id);
 const replay=await customer.rpc('create_online_order',{p_request:orderRequest});assert.ifError(replay.error);assert.equal(replay.data.order_id,first.data.order_id);assert.equal(replay.data.replayed,true);
 const mismatch=await customer.rpc('create_online_order',{p_request:{...orderRequest,notes:'different'}});assert.ok(mismatch.error);
 const codRow=(await db.query('select order_status,payment_status from public.orders where id=$1',[first.data.order_id])).rows[0];
 assert.equal(codRow.payment_status,'unpaid');assert.equal(codRow.order_status,'pending');
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[regular])).rows[0].stock_quantity,9);
 assert.equal((await db.query('select points from public.loyalty_accounts where customer_id=$1',[accounts.customerA.id])).rows[0].points,1000);
 assert.equal((await db.query("select count(*)::integer as n from public.loyalty_transactions where order_id=$1 and transaction_type='REDEEM'",[first.data.order_id])).rows[0].n,1);
 runScript('scripts/import-catalog-local.mjs',['--apply','--test-fixture']);
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[regular])).rows[0].stock_quantity,9);
 const staleOrder=await customer.rpc('create_online_order',{p_request:{...orderRequest,request_id:`TEST-stale-${runId}`,points_used:1800}});assert.ok(staleOrder.error);
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[regular])).rows[0].stock_quantity,9);
 pass('COD with promotion and 1000 points: retry preserves stock/points; stale points and over-cap rejected');
 const second=await customer.rpc('create_online_order',{p_request:{...orderRequest,request_id:`TEST-bank-${runId}`,payment_method:'bank_transfer_demo',points_used:0}});assert.ifError(second.error);assert.notEqual(second.data.order_id,first.data.order_id);
 assert.equal((await db.query('select payment_status from public.orders where id=$1',[second.data.order_id])).rows[0].payment_status,'pending');
 pass('Independent request creates separate bank transfer order pending payment');
 const other=accounts.customerB.api;
 const cross=await other.from('orders').select('id').eq('id',first.data.order_id);assert.ifError(cross.error);assert.equal(cross.data.length,0);
 const crossEdit=await other.from('orders').update({notes:'forged'}).eq('id',first.data.order_id);assert.ok(crossEdit.error);
 const points=await other.from('loyalty_accounts').select('*').eq('customer_id',accounts.customerA.id);assert.ifError(points.error);assert.equal(points.data.length,0);
 const roleEdit=await customer.from('profiles').update({role:'admin'}).eq('id',accounts.customerA.id);assert.ok(roleEdit.error);
 const priceEdit=await accounts.staff.api.from('products').update({base_price:1}).eq('id',regular);assert.ok(priceEdit.error);
 const fakeRole=await customer.auth.updateUser({data:{role:'admin'}});assert.ifError(fakeRole.error);
 assert.equal((await customer.from('profiles').select('role').eq('id',accounts.customerA.id).single()).data.role,'customer');
 pass('RLS and grants block cross-customer reads/writes, Staff price edits and client role spoof');
 const wish=await customer.from('wishlist_items').insert({customer_id:accounts.customerA.id,product_id:regular});assert.ifError(wish.error);
 const otherWishes=await other.from('wishlist_items').select('product_id').eq('customer_id',accounts.customerA.id);assert.ifError(otherWishes.error);assert.equal(otherWishes.data.length,0);
 const wishDelete=await customer.from('wishlist_items').delete().eq('customer_id',accounts.customerA.id).eq('product_id',regular);assert.ifError(wishDelete.error);
 pass('Wishlist Data API respects Customer ownership');
 const customerConfirm=await customer.rpc('confirm_demo_payment',{p_order:second.data.order_id,p_money_received:true});assert.ok(customerConfirm.error);
 const staffConfirm=await accounts.staff.api.rpc('confirm_demo_payment',{p_order:first.data.order_id,p_money_received:true});assert.ifError(staffConfirm.error);
 assert.equal((await db.query('select payment_status,order_status from public.orders where id=$1',[first.data.order_id])).rows[0].payment_status,'paid');
 const adminConfirm=await accounts.admin.api.rpc('confirm_demo_payment',{p_order:second.data.order_id,p_money_received:true});assert.ifError(adminConfirm.error);
 assert.equal((await db.query('select payment_status from public.orders where id=$1',[second.data.order_id])).rows[0].payment_status,'paid');
 pass('Customer denied payment confirmation; Staff/Admin RPC succeeds without order-status mutation');
 assert.equal((await db.query("select count(*)::integer as n from public.loyalty_transactions where order_id=$1 and transaction_type='EARN'",[first.data.order_id])).rows[0].n,0);
 for(const status of ['confirmed','preparing','completed']){
  const transition=await accounts.admin.api.rpc('transition_order',{p_order:first.data.order_id,p_next:status,p_handover:status==='completed'});
  assert.ifError(transition.error);
 }
 assert.equal((await db.query("select gross_points from public.loyalty_transactions where order_id=$1 and transaction_type='EARN'",[first.data.order_id])).rows[0].gross_points,80);
 assert.equal((await db.query('select points from public.loyalty_accounts where customer_id=$1',[accounts.customerA.id])).rows[0].points,1080);
 pass('Only completed plus paid earns 80 loyalty points on 80,000 VND eligible spend');
 const customRequest={...base,items:[{product_id:custom,quantity:1,customization:{size_id:optionIds.size,flavor_id:optionIds.flavor,cream_id:optionIds.cream,font_id:optionIds.font,color_id:optionIds.color,text:'TEST'}}]};
 const tooSoon=await customer.rpc('quote_order',{p_request:{...customRequest,requested_at:new Date(Date.now()+23*3600000+59*60000).toISOString()}});assert.ok(tooSoon.error);
 const customQuote=await customer.rpc('quote_order',{p_request:{...customRequest,requested_at:new Date(Date.now()+24*3600000+60000).toISOString()}});assert.ifError(customQuote.error);assert.equal(customQuote.data.subtotal,370000);
 pass('Custom cake backend price and 24-hour cutoff');
 const fakeDelivery=await customer.rpc('quote_order',{p_request:{...base,fulfillment_type:'delivery',delivery_lat:10.7,delivery_lng:106.7}});assert.ok(fakeDelivery.error);assert.match(fakeDelivery.error.message,/UNTRUSTED_DELIVERY_COORDINATES/);
 pass('Spoofed delivery coordinates cannot produce shipping quote');
 await db.query("update public.profiles set status='blocked' where id=$1",[accounts.customerB.id]);
 const blocked=await other.rpc('create_online_order',{p_request:{...orderRequest,request_id:`TEST-blocked-${runId}`}});assert.ok(blocked.error);
 pass('Blocked profile cannot use sensitive RPC with existing JWT');
 await ensureServer();
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:4173/menu.html');
  await page.waitForTimeout(1200);
  assert.ok(await page.getByText('TEST Regular Cake').count());
  assert.ok(await page.getByText('TEST Custom Cake').count());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-sprint3-menu-${viewport.width}.png`)});
  await page.goto('http://127.0.0.1:4173/product.html?id=TEST-sprint35-product');
  await page.locator('h1').getByText('TEST Regular Cake').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto('http://127.0.0.1:4173/customize.html');
  await page.waitForTimeout(600);
  assert.match(await page.locator('#cake-total').innerText(),/370.000/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-sprint3-customize-${viewport.width}.png`)});
  await page.goto('http://127.0.0.1:4173/login.html');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto('http://127.0.0.1:4173/menu.html');
  await page.evaluate(({id,price})=>localStorage.setItem('bobot:v1:guestCart',JSON.stringify([{key:id+'||',productId:id,itemId:id,quantity:1,unitPrice:price,productNameSnapshot:'TEST Regular Cake'}])),{id:'TEST-sprint35-product',price:100000});
  await page.goto('http://127.0.0.1:4173/login.html?next=menu.html%3Fcheckout%3D1');
  await page.locator('#member-email').fill(accounts.customerA.email);
  await page.locator('#member-password').fill(password);
  await page.locator('#auth-submit').click();
  await page.locator('#checkout-dialog[open]').waitFor({timeout:15000});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bobot:v1:guestCart')).length),1);
  await page.locator('#checkout-form [name="customerName"]').fill('TEST Browser');
  await page.locator('#checkout-form [name="customerPhone"]').fill('0900000000');
  await page.locator('#checkout-date').fill(schedule.slice(0,10));
  await page.locator('#checkout-time').fill('12:00');
  await page.waitForFunction(()=>document.querySelector('#checkout-total')?.textContent?.includes('90.000'));
  const pointsInput=page.locator('#checkout-points');
  assert.ok(Number(await pointsInput.getAttribute('max'))>=5);
  await pointsInput.fill('5');
  await page.waitForFunction(()=>document.querySelector('#checkout-total')?.textContent?.includes('89.950'));
  await page.route('**/rest/v1/rpc/create_online_order',route=>route.abort('failed'));
  await page.locator('#checkout-submit').click();
  await page.waitForFunction(()=>document.querySelector('#checkout-error')?.textContent?.length>0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bobot:v1:guestCart')).length),1);
  await page.unroute('**/rest/v1/rpc/create_online_order');
  await page.locator('#checkout-submit').click();
  await page.locator('#checkout-success:not([hidden])').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bobot:v1:guestCart')).length),0);
  const browserOrder=(await db.query("select points_used,discount_amount,total_amount from public.orders where ship_recipient='TEST Browser' order by created_at desc limit 1")).rows[0];
  assert.deepEqual([browserOrder.points_used,Number(browserOrder.discount_amount),Number(browserOrder.total_amount)],[5,10000,89950]);
  pass(`Browser guest cart survives login/API failure; server checkout succeeds ${viewport.width}px`);
  await page.goto('http://127.0.0.1:4173/profile.html');
  await page.getByText('TEST Regular Cake').first().waitFor();
  assert.ok((await page.locator('#my-orders').innerText()).includes('Thanh toán:'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-sprint3-profile-${viewport.width}.png`)});
  await page.goto('http://127.0.0.1:4173/menu.html');
  const favorite=page.locator('.product-card').filter({hasText:'TEST Regular Cake'}).locator('.product-card__favorite').first();
  await favorite.waitFor();
  await favorite.click();await page.waitForFunction(()=>document.querySelector('.product-card__favorite[aria-pressed="true"]'));
  assert.equal(Number((await db.query('select count(*)::integer as n from public.wishlist_items where customer_id=$1',[accounts.customerA.id])).rows[0].n),1);
  await favorite.click();await page.waitForFunction(()=>!document.querySelector('.product-card__favorite[aria-pressed="true"]'));
  pass(`Browser Wishlist toggle persists through Data API ${viewport.width}px`);
  const adminContext=await browser.newContext({viewport});
  const adminPage=await adminContext.newPage();
  adminPage.on('pageerror',error=>pageErrors.push(error.message));
  await adminPage.goto('http://127.0.0.1:4173/login.html');
  await adminPage.locator('#member-email').fill(accounts.admin.email);
  await adminPage.locator('#member-password').fill(password);
  await adminPage.locator('#auth-submit').click();
  await adminPage.waitForURL('**/index.html');
  await adminPage.goto('http://127.0.0.1:4173/admin-orders.html');
  await adminPage.locator('.admin-table').waitFor();
  const unpaidBefore=Number((await db.query("select count(*)::integer as n from public.orders where payment_status='unpaid'")).rows[0].n);
  await adminPage.locator('.admin-action--payment').first().click();
  await adminPage.waitForFunction(before=>Array.from(document.querySelectorAll('.admin-action--payment')).length<before,unpaidBefore);
  const unpaidAfter=Number((await db.query("select count(*)::integer as n from public.orders where payment_status='unpaid'")).rows[0].n);
  assert.equal(unpaidAfter,unpaidBefore-1);
  pass(`Admin Orders payment button confirms via RPC ${viewport.width}px`);
  assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await adminPage.screenshot({path:path.join(os.tmpdir(),`bobot-sprint3-admin-${viewport.width}.png`)});
  await adminContext.close();
  assert.deepEqual(pageErrors,[]);
  await context.close();
  pass(`Browser Menu, Customizer, Login ${viewport.width}px`);
 }
}catch(error){failure=error;console.error('FAIL:',error.stack||error.message);}finally{
 if(browser)await browser.close().catch(()=>{});
 if(server)server.kill();
 await db.end().catch(()=>{});
 if(disposable){
  const clean=resetLocal();
  if(clean.status===0)console.log('PASS: local TEST fixture removed by database reset');
  else{console.error('FAIL: local TEST cleanup:',[clean.stdout,clean.stderr].filter(Boolean).join('\n'));failure??=Error('Local test cleanup failed');}
 }
}
if(failure)process.exitCode=1;
