import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {canonicalPay,hmac} from '../supabase/functions/_shared/vnpay.js';
import {localDbPassword} from './local-db-password.mjs';

const root=path.resolve(import.meta.dirname,'..');
const db=new Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:localDbPassword()});
const config=JSON.parse(await fs.readFile(path.join(root,'site/backend-config.local.json'),'utf8'));
if(config.mode!=='supabase'||config.url!=='http://127.0.0.1:54321')throw Error('LOCAL_SUPABASE_CONFIG_REQUIRED');
const api=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const testEmail=`vnpay-test-${randomUUID()}@example.invalid`;
const testPassword=randomBytes(24).toString('base64url');
const tmnCode='TESTV210',secret=randomBytes(32).toString('hex');
const edgeUrl='http://127.0.0.1:54321/functions/v1/vnpay-gateway';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bobot-vnpay-test-'));
const envFile=path.join(directory,'.env');
let worker,userId,otherUserId,accessToken,browser;
const ids=[randomUUID(),randomUUID(),randomUUID()];
const paymentIds=[randomUUID(),randomUUID(),randomUUID()];
let stdout='';
async function call(action,body={},token){
 const response=await fetch(edgeUrl,{method:'POST',headers:{'Content-Type':'application/json',
  ...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,...body})});
 return {status:response.status,data:await response.json()};
}
async function notification(txnRef,amount,transactionNo='123456'){
 const fields={vnp_Amount:String(amount*100),vnp_TmnCode:tmnCode,vnp_TxnRef:txnRef,
  vnp_ResponseCode:'00',vnp_TransactionStatus:'00',vnp_TransactionNo:transactionNo,
  vnp_OrderInfo:`Thanh toan don hang ${txnRef}`};
 const url=new URL(edgeUrl);
 url.searchParams.set('action','ipn');
 for(const [key,value] of Object.entries(fields))url.searchParams.set(key,value);
 url.searchParams.set('vnp_SecureHash',await hmac(secret,canonicalPay(fields)));
 return url;
}
try{
 await db.connect();
 const inventory=await db.query(`select
  (select count(*) from auth.users) users,
  (select count(*) from public.orders) orders,
  (select count(*) from public.payments) payments,
  (select count(*) from public.daily_analytics) analytics,
  (select count(*) from public.audit_log) audit,
  (select count(*) from public.loyalty_accounts) loyalty`);
 if(Object.values(inventory.rows[0]).some(value=>Number(value)!==0))throw Error('LOCAL_DB_NOT_EMPTY_TEST_ABORTED');
 await fs.writeFile(envFile,`VNPAY_MODE=sandbox\nVNPAY_TMN_CODE=${tmnCode}\nVNPAY_HASH_SECRET=${secret}\nVNPAY_RETURN_URL=http://127.0.0.1:4173/vnpay-result.html\n`,{mode:0o600});
 worker=spawn(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),
  'functions','serve','vnpay-gateway','--no-verify-jwt','--env-file',envFile],
  {cwd:root,env:{...process.env,DO_NOT_TRACK:'1'},windowsHide:true});
 worker.stdout.on('data',chunk=>{stdout+=String(chunk).slice(-1000);});
 worker.stderr.on('data',chunk=>{stdout+=String(chunk).slice(-1000);});
 let ready=false,lastCode='none';
 for(let attempt=0;attempt<40;attempt++){
  await new Promise(resolve=>setTimeout(resolve,500));
  try{
   const response=await fetch(await notification('READYNOTFOUND',100000,'999999'));
   lastCode=(await response.json()).RspCode;
   if(response.ok&&lastCode==='01'){ready=true;break;}
  }catch{}
  if(worker.exitCode!==null)break;
 }
 if(!ready)throw Error('EDGE_FUNCTION_NOT_READY '+lastCode+': '+stdout.slice(-400));
 assert.equal((await call('availability')).data.available,true);
 const signup=await api.auth.signUp({email:testEmail,password:testPassword});
 if(signup.error)throw signup.error;
 userId=signup.data.user?.id;
 let session=signup.data.session;
 if(!session){const login=await api.auth.signInWithPassword({email:testEmail,password:testPassword});
  if(login.error)throw login.error;session=login.data.session;}
 accessToken=session.access_token;
 for(let i=0;i<ids.length;i++){
  await db.query(`insert into public.orders(id,order_code,customer_id,created_by,
    sales_channel,fulfillment_type,client_request_id,request_payload,requested_at,
    subtotal,total_amount) values($1,$2,$3,$3,'online','pickup',$4,'{}',now()+interval '48 hours',100000,100000)`,
   [ids[i],`VNPAY-TEST-${i}-${randomUUID().slice(0,8)}`,userId,`vnpay-test-${i}-${randomUUID()}`]);
  await db.query(`insert into public.payments(id,order_id,kind,payment_method,status,
    amount,product_amount,shipping_amount,request_id)
    values($1,$2,'charge','vnpay','pending',100000,100000,0,$3)`,
   [paymentIds[i],ids[i],`vnpay-test-${i}`]);
 }
 assert.equal((await call('start',{orderId:ids[0]})).status,401);
 const sessions=[];
 for(const id of ids){
  const result=await call('start',{orderId:id},accessToken);
  assert.equal(result.status,200,JSON.stringify(result.data));
  sessions.push(new URL(result.data.url));
 }
 const ref=sessions[0].searchParams.get('vnp_TxnRef');
 assert.equal((await call('status',{txnRef:ref},accessToken)).data.paymentStatus,'pending');
 assert.equal((await call('refund',{orderId:ids[0],requestId:'TESTREFUND'},accessToken)).data.error,'VNPAY_REFUND_WORKFLOW_NOT_READY');
 const otherSignup=await api.auth.signUp({email:`vnpay-other-${randomUUID()}@example.invalid`,password:randomBytes(24).toString('base64url')});
 if(otherSignup.error)throw otherSignup.error;
 otherUserId=otherSignup.data.user?.id;
 const otherToken=otherSignup.data.session?.access_token;
 assert.ok(otherToken);
 assert.equal((await call('status',{orderId:ids[0]},otherToken)).data.error,'ORDER_NOT_FOUND');
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:4173/vnpay-result.html?vnp_TxnRef='+ref+'&vnp_ResponseCode=00',{waitUntil:'domcontentloaded'});
 const crossOrigin=await page.evaluate(async({url,token,txnRef})=>{
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,
   'Content-Type':'application/json','x-client-info':'supabase-js-test'},
   body:JSON.stringify({action:'status',txnRef})});
  return {status:response.status,data:await response.json()};
 },{url:edgeUrl,token:accessToken,txnRef:ref});
 assert.equal(crossOrigin.status,200);
 assert.equal(crossOrigin.data.paymentStatus,'pending');
 await browser.close();browser=null;
 const forged=await notification(ref,100000);
 forged.searchParams.set('vnp_Amount','100');
 assert.equal((await (await fetch(forged)).json()).RspCode,'97');
 const wrongAmount=await notification(ref,99000);
 assert.equal((await (await fetch(wrongAmount)).json()).RspCode,'04');
 const valid=await notification(ref,100000);
 assert.equal((await (await fetch(valid)).json()).RspCode,'00');
 assert.equal((await (await fetch(valid)).json()).RspCode,'02');
 assert.equal((await call('status',{txnRef:ref},accessToken)).data.paymentStatus,'paid');
 await db.query(`update public.orders set order_status='cancelled',cancelled_at=now() where id=$1`,[ids[1]]);
 const cancelled=await notification(sessions[1].searchParams.get('vnp_TxnRef'),100000,'123457');
 assert.equal((await (await fetch(cancelled)).json()).Message,'Reconciliation required');
 assert.equal((await call('status',{txnRef:sessions[1].searchParams.get('vnp_TxnRef')},accessToken)).data.gatewayResult,'reconciliation_required');
 const concurrent=await notification(sessions[2].searchParams.get('vnp_TxnRef'),100000,'123458');
 const simultaneous=await Promise.all([fetch(concurrent),fetch(concurrent)]);
 const codes=await Promise.all(simultaneous.map(async response=>(await response.json()).RspCode));
 assert.deepEqual(codes.sort(),['00','02']);
 const rows=await db.query(`select
  (select count(*) from public.payments where id=any($1::uuid[]) and status='paid') paid,
  (select count(*) from public.audit_log where entity_id=$2 and action='vnpay_paid') audit_count`,
  [paymentIds,paymentIds[2]]);
 assert.equal(Number(rows.rows[0].paid),2);
 assert.equal(Number(rows.rows[0].audit_count),1);
 await db.query(`update public.profiles set role='staff' where id=$1`,[userId]);
 assert.equal((await call('refund',{orderId:ids[0],requestId:'TESTREFUND',amount:1},accessToken)).data.error,'VNPAY_REFUND_WORKFLOW_NOT_READY');
 const refunds=await db.query(`select count(*) from public.payments where order_id=$1 and kind='refund'`,[ids[0]]);
 assert.equal(Number(refunds.rows[0].count),0);
 console.log('PASS VNPAY EDGE MOCK LOCAL: Auth/ownership, partial refund denial, tamper, amount, duplicate/concurrent IPN, cancel reconciliation');
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(worker?.pid){try{execFileSync('taskkill',['/PID',String(worker.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
 try{
  await db.query(`delete from public.audit_log where entity_id=any($1::uuid[])`,[paymentIds]);
  await db.query(`delete from public.payments where id=any($1::uuid[])`,[paymentIds]);
  await db.query(`delete from public.orders where id=any($1::uuid[])`,[ids]);
  await db.query(`delete from public.daily_analytics`);
  if(userId){
   await db.query(`delete from public.loyalty_accounts where customer_id=$1`,[userId]);
   await db.query(`delete from public.profiles where id=$1`,[userId]);
   await db.query(`delete from auth.users where id=$1`,[userId]);
  }
  if(otherUserId){
   await db.query(`delete from public.loyalty_accounts where customer_id=$1`,[otherUserId]);
   await db.query(`delete from public.profiles where id=$1`,[otherUserId]);
   await db.query(`delete from auth.users where id=$1`,[otherUserId]);
  }
 }catch(error){console.error('TEST_FIXTURE_CLEANUP_FAILED:',error.message);process.exitCode=1;}
 await db.end().catch(()=>{});
 await fs.rm(directory,{recursive:true,force:true});
}
