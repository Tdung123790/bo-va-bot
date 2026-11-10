import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {buildPayUrl,verifyPayResponse,canonicalPay,hmac,gatewayAmount,vnpayDate,
 buildQueryRequest,buildRefundRequest,verifyTransactionResponse,callTransactionApi} from '../supabase/functions/_shared/vnpay.js';

const secret=randomBytes(32).toString('hex'),tmnCode='TESTV210';
assert.equal(vnpayDate(new Date('2026-11-06T00:00:00Z')),'20261106070000');
assert.equal(gatewayAmount(100000),'10000000');
for(const invalid of [0,-1,1.1,4999,10000000000,Number.MAX_SAFE_INTEGER]){
 assert.throws(()=>gatewayAmount(invalid));
}
const url=await buildPayUrl({tmnCode,secret,txnRef:'A1B2C3',amount:100000,
 createDate:'20261106070000',expireDate:'20261106071500',
 returnUrl:'http://127.0.0.1:4173/vnpay-result.html'});
assert.ok(url.startsWith('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?'));
assert.equal((await verifyPayResponse(url,{tmnCode,secret})).valid,true);
const tampered=new URL(url);
tampered.searchParams.set('vnp_Amount','100');
assert.equal((await verifyPayResponse(tampered.href,{tmnCode,secret})).valid,false);
await assert.rejects(()=>verifyPayResponse(`${url}&vnp_Amount=100`,{tmnCode,secret}),/VNPAY_DUPLICATE_PARAMETER/);
const callback=new URL('http://127.0.0.1:54321/functions/v1/vnpay-gateway?action=ipn');
const fields={vnp_Amount:'10000000',vnp_TmnCode:tmnCode,vnp_TxnRef:'A1B2C3',
 vnp_ResponseCode:'00',vnp_TransactionStatus:'00',vnp_TransactionNo:'123456',
 vnp_OrderInfo:'Thanh toan don hang A1B2C3'};
for(const [key,value] of Object.entries(fields))callback.searchParams.set(key,value);
callback.searchParams.set('vnp_SecureHash',await hmac(secret,canonicalPay(fields)));
assert.equal((await verifyPayResponse(callback.href,{tmnCode,secret})).amount,100000);
const badCode=new URL(callback);
badCode.searchParams.set('vnp_TmnCode','BADV2100');
assert.equal((await verifyPayResponse(badCode.href,{tmnCode,secret})).valid,false);
const requestId='UNITTESTREQ1';
const query=await buildQueryRequest({tmnCode,secret,txnRef:'A1B2C3',
 transactionDate:'20261106070000',requestId,now:new Date('2026-11-06T01:00:00Z')});
const queryParts=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TxnRef',
 'vnp_TransactionDate','vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
assert.equal(query.vnp_SecureHash,await hmac(secret,queryParts.map(key=>query[key]).join('|')));
const refund=await buildRefundRequest({tmnCode,secret,txnRef:'A1B2C3',amount:100000,
 transactionNo:'123456',transactionDate:'20261106070000',requestId,
 createBy:'TESTSTAFF',now:new Date('2026-11-06T01:00:00Z')});
assert.equal(refund.vnp_TransactionType,'02');
const refundParts=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TransactionType',
 'vnp_TxnRef','vnp_Amount','vnp_TransactionNo','vnp_TransactionDate','vnp_CreateBy',
 'vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
assert.equal(refund.vnp_SecureHash,await hmac(secret,refundParts.map(key=>refund[key]).join('|')));
const response={vnp_ResponseId:'RESP1',vnp_Command:'querydr',vnp_ResponseCode:'00',
 vnp_Message:'Success',vnp_TmnCode:tmnCode,vnp_TxnRef:'A1B2C3',vnp_Amount:'10000000',
 vnp_BankCode:'NCB',vnp_PayDate:'20261106070500',vnp_TransactionNo:'123456',
 vnp_TransactionType:'01',vnp_TransactionStatus:'00',vnp_OrderInfo:'Thanh toan'};
const responseParts=['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode',
 'vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo',
 'vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode',
 'vnp_PromotionAmount'];
response.vnp_SecureHash=await hmac(secret,responseParts.map(key=>response[key]??'').join('|'));
assert.equal(await verifyTransactionResponse(response,secret,tmnCode),true);
response.vnp_Amount='20000000';
assert.equal(await verifyTransactionResponse(response,secret,tmnCode),false);
const refundResponse={...response,vnp_Command:'refund',vnp_TransactionType:'02',vnp_Amount:'10000000'};
refundResponse.vnp_SecureHash=await hmac(secret,responseParts.slice(0,-2).map(key=>refundResponse[key]??'').join('|'));
assert.equal(await verifyTransactionResponse(refundResponse,secret,tmnCode),true);
refundResponse.vnp_TransactionStatus='05';
assert.equal(await verifyTransactionResponse(refundResponse,secret,tmnCode),false);
let requests=0;
const mock=async (endpoint,options)=>{
 requests++;
 assert.equal(endpoint,'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
 assert.equal(options.method,'POST');
 return {ok:true,json:async()=>({vnp_ResponseCode:'00'})};
};
assert.equal((await callTransactionApi(query,{transport:mock})).vnp_ResponseCode,'00');
assert.equal(requests,1);
await assert.rejects(()=>callTransactionApi(query,{transport:async()=>{throw Error('NETWORK_DOWN');}}),/NETWORK_DOWN/);
await assert.rejects(()=>callTransactionApi(query,{transport:async()=>({ok:false,status:503})}),/VNPAY_TRANSACTION_HTTP_ERROR/);
await assert.rejects(()=>callTransactionApi(query,{transport:(_url,{signal})=>new Promise((_resolve,reject)=>{
 const watchdog=setTimeout(()=>reject(Error('ABORT_NOT_DELIVERED')),100);
 signal.addEventListener('abort',()=>{clearTimeout(watchdog);reject(signal.reason);},{once:true});
}),timeoutMs:5}),/timeout|aborted/i);
await assert.rejects(()=>callTransactionApi(query,{transport:mock,endpoint:'https://example.invalid/transaction'}),/VNPAY_ENDPOINT_NOT_ALLOWED/);
console.log('PASS VNPAY UNIT: amount/date including 5000 VND minimum, PAY/QUERYDR/REFUND signing, response verification, tampering, network failure/timeout and mock transport');
