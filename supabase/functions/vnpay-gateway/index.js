import {buildPayUrl,verifyPayResponse,buildQueryRequest,
  verifyTransactionResponse,callTransactionApi,eventFingerprint,gatewayAmount} from '../_shared/vnpay.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
const env=name=>Deno.env.get(name)||'';
const base=()=>env('SUPABASE_URL').replace(/\/$/,'');
const publicKey=()=>env('SUPABASE_ANON_KEY');
const serviceKey=()=>env('SUPABASE_SERVICE_ROLE_KEY');
const credentials=()=>{
 if(env('VNPAY_MODE')!=='sandbox'||!env('VNPAY_TMN_CODE')||!env('VNPAY_HASH_SECRET'))throw Error('VNPAY_SANDBOX_NOT_CONFIGURED');
 return {tmnCode:env('VNPAY_TMN_CODE'),secret:env('VNPAY_HASH_SECRET')};
};
async function rest(path,{token,method='GET',body,service=false}={}){
 const key=service?serviceKey():publicKey();
 if(!key||!token)throw Error('BACKEND_AUTH_NOT_CONFIGURED');
 const response=await fetch(`${base()}${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.message||data?.error||data?.code||'BACKEND_REQUEST_FAILED');
 return data;
}
async function userToken(request){
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))throw Error('AUTH_REQUIRED');
 const token=authorization.slice(7);
 await rest('/auth/v1/user',{token});
 return token;
}
async function rpc(name,body,token,service=false){
 return rest(`/rest/v1/rpc/${name}`,{token,service,method:'POST',body});
}
function ipAddress(request){
 const candidate=request.headers.get('cf-connecting-ip')||'127.0.0.1';
 return /^[0-9a-fA-F:.]{3,45}$/.test(candidate)?candidate:'127.0.0.1';
}
async function start(request){
 const token=await userToken(request),{tmnCode,secret}=credentials();
 const body=await request.json(),orderId=body?.orderId;
 if(typeof orderId!=='string'||! /^[0-9a-f-]{36}$/i.test(orderId))throw Error('ORDER_ID_REQUIRED');
 const returnUrl=env('VNPAY_RETURN_URL');
 if(!returnUrl)throw Error('VNPAY_RETURN_URL_NOT_CONFIGURED');
 const target=new URL(returnUrl);
 if(target.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(target.hostname))throw Error('VNPAY_RETURN_URL_NOT_SECURE');
 if(!/^[A-Za-z0-9]{8}$/.test(tmnCode))throw Error('VNPAY_SANDBOX_NOT_CONFIGURED');
 const result=await rpc('vnpay_begin_payment',{p_order:orderId},token);
 const url=await buildPayUrl({tmnCode,secret,txnRef:result.txn_ref,
  amount:Number(result.amount),createDate:result.create_date,expireDate:result.expire_date,
  returnUrl:target.href,ipAddress:ipAddress(request)});
 return json({url,orderId:result.order_id,paymentStatus:'pending'});
}
async function status(request){
 const token=await userToken(request),body=await request.json();
 let orderId=String(body?.orderId||'');
 if(!orderId&&/^[A-Za-z0-9]{1,100}$/.test(String(body?.txnRef||''))){
  const payments=await rest(`/rest/v1/payments?gateway_txn_ref=eq.${encodeURIComponent(body.txnRef)}&kind=eq.charge&select=order_id&limit=1`,{token});
  orderId=payments?.[0]?.order_id||'';
 }
 if(!/^[0-9a-f-]{36}$/i.test(orderId))throw Error('ORDER_ID_REQUIRED');
 const rows=await rest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_status,payment_status,payments(kind,payment_method,status,gateway_result)&limit=1`,{token});
 if(!rows?.length)throw Error('ORDER_NOT_FOUND');
 const order=rows[0],payment=order.payments?.find(row=>row.kind==='charge');
 return json({orderId:order.id,orderStatus:order.order_status,paymentStatus:order.payment_status,
  gatewayResult:payment?.payment_method==='vnpay'?payment.gateway_result:null});
}
async function ipn(request){
 let verified;
 try{verified=await verifyPayResponse(request.url,credentials());}
 catch{return json({RspCode:'97',Message:'Invalid signature'});}
 if(!verified.valid)return json({RspCode:'97',Message:'Invalid signature'});
 const fields=verified.params;
 if(!fields.vnp_TxnRef||!fields.vnp_ResponseCode||!fields.vnp_TransactionStatus)
  return json({RspCode:'99',Message:'Invalid notification'});
 try{
  const result=await rpc('vnpay_apply_result',{
   p_txn_ref:fields.vnp_TxnRef,p_amount:verified.amount,
   p_external:fields.vnp_TransactionNo||null,p_response_code:fields.vnp_ResponseCode,
   p_transaction_status:fields.vnp_TransactionStatus,
   p_event_hash:await eventFingerprint(fields),p_source:'ipn'
  },serviceKey(),true);
  return json(result);
 }catch{return json({RspCode:'99',Message:'Unknown error'});}
}
async function chargeFor(orderId,token){
 const rows=await rest(`/rest/v1/payments?order_id=eq.${encodeURIComponent(orderId)}&kind=eq.charge&select=id,amount,payment_method,status,gateway_txn_ref,gateway_create_date,gateway_transaction_no,gateway_result&limit=1`,{token});
 if(!rows?.length||rows[0].payment_method!=='vnpay')throw Error('VNPAY_PAYMENT_NOT_FOUND');
 return rows[0];
}
async function requireReconcileActor(token,orderId){
 const user=await rest('/auth/v1/user',{token});
 const profiles=await rest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,status&limit=1`,{token});
 const actor=profiles?.[0];
 if(!actor||actor.status!=='active'||!['customer','staff','admin'].includes(actor.role))throw Error('STAFF_ADMIN_REQUIRED');
 if(actor.role==='customer'){
  const orders=await rest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${encodeURIComponent(user.id)}&sales_channel=eq.online&select=id&limit=1`,{token});
  if(!orders?.length)throw Error('ORDER_NOT_FOUND');
 }
 return actor;
}
async function reconcile(request){
 const token=await userToken(request);
 const body=await request.json(),orderId=String(body?.orderId||'');
 if(!/^[0-9a-f-]{36}$/i.test(orderId))throw Error('ORDER_ID_REQUIRED');
 await requireReconcileActor(token,orderId);
 const charge=await chargeFor(orderId,token),{tmnCode,secret}=credentials();
 if(!charge.gateway_txn_ref||!charge.gateway_create_date)throw Error('PAYMENT_SESSION_NOT_STARTED');
 if(charge.status!=='pending'||['paid','failed','refunded'].includes(charge.gateway_result))return json({status:'unchanged',gatewayMessage:'Payment already resolved'});
 await rpc('vnpay_reserve_query',{p_order:orderId},token);
 const requestId=crypto.randomUUID().replace(/-/g,'');
 const queryIp=env('VNPAY_QUERY_IP')||ipAddress(request);
 if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(queryIp)||queryIp.split('.').some(part=>Number(part)>255)){
  throw Error('VNPAY_QUERY_IP_INVALID');
 }
 const payload=await buildQueryRequest({tmnCode,secret,txnRef:charge.gateway_txn_ref,
  transactionDate:charge.gateway_create_date,requestId,ipAddress:queryIp});
  
 const response=await callTransactionApi(payload);
 
 if(!response||typeof response!=='object'||Array.isArray(response)){
  throw Error('VNPAY_QUERYDR_INVALID_RESPONSE');
 }
 
 if(typeof response.vnp_SecureHash!=='string'||!response.vnp_SecureHash){
  if(response.vnp_ResponseCode==='99'&&response.vnp_Message==='Unexpected error'){
   return json({
    status:'reconciliation_required',
    gatewayCode:'99',
    reason:'VNPAY_QUERYDR_UPSTREAM_ERROR'
   });
  }
  throw Error('VNPAY_QUERYDR_UNSIGNED_RESPONSE');
 }

 if(!await verifyTransactionResponse(response,secret,tmnCode)){
  throw Error('VNPAY_RESPONSE_SIGNATURE_INVALID');
 }

 if(response.vnp_TxnRef!==charge.gateway_txn_ref||response.vnp_Amount!==gatewayAmount(Number(charge.amount))||response.vnp_Command!=='querydr')throw Error('VNPAY_RESPONSE_IDENTITY_MISMATCH');
 if(response.vnp_TransactionType!=='01')throw Error('VNPAY_RESPONSE_TYPE_MISMATCH');
 if(response.vnp_ResponseCode!=='00')return json({status:'reconciliation_required',gatewayCode:response.vnp_ResponseCode});
 const applied=await rpc('vnpay_apply_result',{
  p_txn_ref:charge.gateway_txn_ref,p_amount:Number(charge.amount),
  p_external:response.vnp_TransactionNo||null,p_response_code:response.vnp_ResponseCode,
  p_transaction_status:response.vnp_TransactionStatus,p_event_hash:await eventFingerprint(response),
  p_source:'querydr'
 },serviceKey(),true);
 return json({status:applied.RspCode==='00'?'processed':'unchanged',gatewayMessage:applied.Message});
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return json({});
 try{
  const action=request.method==='GET'?new URL(request.url).searchParams.get('action'):(await request.clone().json()).action;
  if(action==='availability'&&request.method==='POST'){
   let available=false;
   try{
    const {tmnCode}=credentials(),target=new URL(env('VNPAY_RETURN_URL'));
    if(/^[A-Za-z0-9]{8}$/.test(tmnCode)&&(target.protocol==='https:'||['localhost','127.0.0.1'].includes(target.hostname))){
     await rest('/rest/v1/payments?select=gateway_txn_ref,gateway_query_reserved_at&limit=0',{token:serviceKey(),service:true});
     available=true;
    }
   }catch{}
   return json({available});
  }
  if(action==='ipn'&&request.method==='GET')return ipn(request);
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(action==='start')return await start(request);
  if(action==='status')return await status(request);
  if(action==='reconcile')return await reconcile(request);
  if(action==='refund')throw Error('VNPAY_REFUND_WORKFLOW_NOT_READY');
  return json({error:'UNKNOWN_ACTION'},404);
 }catch(error){
  const message=String(error?.message||'REQUEST_FAILED');
  const safe=/^(AUTH_REQUIRED|STAFF_ADMIN_REQUIRED|ORDER_ID_REQUIRED|ORDER_NOT_FOUND|VNPAY_[A-Z_]+|PAYMENT_SESSION_[A-Z_]+|PARTIAL_REFUND_REQUIRES_POLICY_APPROVAL|REQUEST_ID_REQUIRED|REFUND_[A-Z_]+|BACKEND_[A-Z_]+)$/.test(message)?message:'REQUEST_FAILED';
  return json({error:safe},safe==='AUTH_REQUIRED'?401:400);
 }
});
