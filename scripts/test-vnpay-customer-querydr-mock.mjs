import assert from 'node:assert/strict';
import {hmac} from '../supabase/functions/_shared/vnpay.js';

const orderId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const secret='TEST_SECRET_NOT_FOR_MERCHANT';
const environment={VNPAY_MODE:'sandbox',VNPAY_TMN_CODE:'TESTV210',VNPAY_HASH_SECRET:secret,
 VNPAY_RETURN_URL:'http://127.0.0.1:4173/vnpay-result.html',SUPABASE_URL:'http://127.0.0.1:54321',
 SUPABASE_ANON_KEY:'TEST_ANON',SUPABASE_SERVICE_ROLE_KEY:'TEST_SERVICE'};
const responseFields=['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode','vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo','vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode','vnp_PromotionAmount'];
const gatewayResponse={vnp_ResponseId:'TEST_RESPONSE',vnp_Command:'querydr',vnp_ResponseCode:'00',vnp_Message:'Success',
 vnp_TmnCode:'TESTV210',vnp_TxnRef:'TESTREF123',vnp_Amount:'500000',vnp_BankCode:'NCB',
 vnp_PayDate:'20261109140000',vnp_TransactionNo:'TEST_TRANSACTION',vnp_TransactionType:'01',
 vnp_TransactionStatus:'00',vnp_OrderInfo:'TEST order',vnp_PromotionCode:'',vnp_PromotionAmount:''};
gatewayResponse.vnp_SecureHash=await hmac(secret,responseFields.map(key=>String(gatewayResponse[key]??'')).join('|'));

let handler,profileRole='customer',profileStatus='active',customerOwns=true,reservationAllowed=true,
 gatewaySigned=true,gatewayCalls=0,applyCalls=0,availabilityReady=true;
const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
globalThis.Deno={env:{get:name=>environment[name]||''},serve:callback=>{handler=callback;}};
globalThis.fetch=async (input,options={})=>{
 const url=String(input);
 if(url.endsWith('/auth/v1/user'))return Response.json({id:userId});
 if(url.includes('/rest/v1/profiles'))return Response.json([{id:userId,role:profileRole,status:profileStatus}]);
 if(url.includes('/rest/v1/orders?')&&url.includes('customer_id='))return Response.json(customerOwns?[{id:orderId}]:[]);
 if(url.includes('/rest/v1/orders?'))return Response.json([{id:orderId,order_status:'pending',payment_status:'pending',payments:[{kind:'charge',payment_method:'vnpay',status:'pending',gateway_result:'awaiting'}]}]);
 if(url.includes('/rest/v1/payments?select='))return availabilityReady?Response.json([]):Response.json({message:'missing migration'},{status:400});
 if(url.includes('/rest/v1/payments?order_id='))return Response.json([{id:'33333333-3333-4333-8333-333333333333',amount:5000,payment_method:'vnpay',status:'pending',gateway_txn_ref:'TESTREF123',gateway_create_date:'20261109130000',gateway_result:'awaiting'}]);
 if(url.includes('/rest/v1/rpc/vnpay_reserve_query'))return reservationAllowed?Response.json({reserved:true}):Response.json({message:'VNPAY_QUERY_RATE_LIMIT'},{status:400});
 if(url.includes('/rest/v1/rpc/vnpay_apply_result')){applyCalls++;assert.equal(options.headers.Authorization,'Bearer TEST_SERVICE');return Response.json({RspCode:'00',Message:'Confirm success'});}
 if(url==='https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'){
  gatewayCalls++;
  return Response.json(gatewaySigned?gatewayResponse:{...gatewayResponse,vnp_Amount:'600000'});
 }
 throw Error('Unexpected mock request: '+url);
};
const call=async (action,body={})=>{
 const response=await handler(new Request('http://local/functions/v1/vnpay-gateway',{method:'POST',headers:{Authorization:'Bearer TEST.JWT','Content-Type':'application/json'},body:JSON.stringify({action,...body})}));
 return {status:response.status,body:await response.json()};
};
try{
 await import('../supabase/functions/vnpay-gateway/index.js');
 assert.deepEqual((await call('availability')).body,{available:true});
 availabilityReady=false;assert.deepEqual((await call('availability')).body,{available:false});availabilityReady=true;
 assert.equal((await call('status',{orderId})).body.paymentStatus,'pending');
 assert.equal((await call('reconcile',{orderId})).body.status,'processed');
 assert.equal(gatewayCalls,1);assert.equal(applyCalls,1);
 customerOwns=false;assert.equal((await call('reconcile',{orderId})).status,400);customerOwns=true;
 profileStatus='blocked';assert.equal((await call('reconcile',{orderId})).status,400);profileStatus='active';
 reservationAllowed=false;assert.equal((await call('reconcile',{orderId})).status,400);reservationAllowed=true;
 assert.equal(gatewayCalls,1);
 gatewaySigned=false;assert.equal((await call('reconcile',{orderId})).body.error,'VNPAY_RESPONSE_SIGNATURE_INVALID');gatewaySigned=true;
 assert.equal(applyCalls,1);
 assert.equal((await call('refund',{orderId,requestId:'TESTREFUND'})).body.error,'VNPAY_REFUND_WORKFLOW_NOT_READY');
 assert.equal(applyCalls,1);
}finally{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;}
console.log('PASS VNPAY Customer QUERYDR Edge mock: ownership, blocked, rate reservation, signed response, tamper rejection, availability and refund gate; sandbox NOT RUN');
