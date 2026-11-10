const version='2.1.0';
const payUrl='https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const transactionUrl='https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
const encoder=new TextEncoder();
const formatDate=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date).replace(/\D/g,'');
const escape=value=>encodeURIComponent(String(value)).replace(/%20/g,'+');
const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');

export function gatewayAmount(vnd){
 if(!Number.isSafeInteger(vnd)||vnd<5000||vnd>9999999999)throw Error('VNPAY_AMOUNT_OUT_OF_RANGE');
 return String(vnd*100);
}
export function vnpayDate(date=new Date()){return formatDate(date);}
export function canonicalPay(params){
 return Object.entries(params).filter(([key,value])=>key.startsWith('vnp_')&&key!=='vnp_SecureHash'&&key!=='vnp_SecureHashType'&&value!==undefined&&value!==null)
  .sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>`${escape(key)}=${escape(value)}`).join('&');
}
export async function hmac(secret,data){
 if(!secret)throw Error('VNPAY_SECRET_NOT_CONFIGURED');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-512'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(data)));
}
export function safeHashEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==128||b.length!==128)return false;
 let diff=0;
 for(let i=0;i<128;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
export async function buildPayUrl({tmnCode,secret,txnRef,amount,createDate,expireDate,returnUrl,ipAddress='127.0.0.1'}){
 if(!/^[A-Za-z0-9]{8}$/.test(tmnCode)||!/^[A-Za-z0-9]{1,100}$/.test(txnRef)||!/^[0-9]{14}$/.test(createDate)||!/^[0-9]{14}$/.test(expireDate))throw Error('VNPAY_INVALID_PAY_REQUEST');
 const params={vnp_Version:version,vnp_Command:'pay',vnp_TmnCode:tmnCode,vnp_Amount:gatewayAmount(amount),vnp_CurrCode:'VND',vnp_TxnRef:txnRef,vnp_OrderInfo:`Thanh toan don hang ${txnRef}`,vnp_OrderType:'other',vnp_Locale:'vn',vnp_ReturnUrl:returnUrl,vnp_IpAddr:ipAddress,vnp_CreateDate:createDate,vnp_ExpireDate:expireDate};
 const canonical=canonicalPay(params);
 return `${payUrl}?${canonical}&vnp_SecureHash=${await hmac(secret,canonical)}`;
}
export function parseGatewayQuery(rawUrl){
 const search=new URL(rawUrl).searchParams,params={};
 for(const [key,value] of search){
  if(!key.startsWith('vnp_'))continue;
  if(Object.hasOwn(params,key))throw Error('VNPAY_DUPLICATE_PARAMETER');
  params[key]=value;
 }
 return params;
}
export async function verifyPayResponse(rawUrl,{tmnCode,secret}){
 const params=parseGatewayQuery(rawUrl);
 const signature=params.vnp_SecureHash;
 const valid=safeHashEqual(signature,await hmac(secret,canonicalPay(params)));
 if(!valid||params.vnp_TmnCode!==tmnCode)return {valid:false,params};
 const amount=Number(params.vnp_Amount);
 if(!Number.isSafeInteger(amount)||amount<0||amount%100!==0||!params.vnp_TxnRef)return {valid:false,params};
 return {valid:true,params,amount:amount/100};
}
const queryRequestFields=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TxnRef','vnp_TransactionDate','vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
const refundRequestFields=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TransactionType','vnp_TxnRef','vnp_Amount','vnp_TransactionNo','vnp_TransactionDate','vnp_CreateBy','vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
const responseFields=['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode','vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo','vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo'];
const pipe=(fields,values)=>fields.map(key=>String(values[key]??'')).join('|');
export async function signTransactionRequest(fields,values,secret){return hmac(secret,pipe(fields,values));}
export async function verifyTransactionResponse(values,secret,tmnCode){
 if(values.vnp_TmnCode!==tmnCode)return false;
 const fields=values.vnp_Command==='querydr'?[...responseFields,'vnp_PromotionCode','vnp_PromotionAmount']:values.vnp_Command==='refund'?responseFields:null;
 if(!fields)return false;
 return safeHashEqual(values.vnp_SecureHash,await hmac(secret,pipe(fields,values)));
}
export async function buildQueryRequest({tmnCode,secret,txnRef,transactionDate,requestId,ipAddress='127.0.0.1',now=new Date()}){
 const request={vnp_RequestId:requestId,vnp_Version:version,vnp_Command:'querydr',vnp_TmnCode:tmnCode,vnp_TxnRef:txnRef,vnp_OrderInfo:`Truy van don hang ${txnRef}`,vnp_TransactionDate:transactionDate,vnp_CreateDate:vnpayDate(now),vnp_IpAddr:ipAddress};
 request.vnp_SecureHash=await signTransactionRequest(queryRequestFields,request,secret);
 return request;
}
export async function buildRefundRequest({tmnCode,secret,txnRef,amount,transactionNo,transactionDate,requestId,createBy,ipAddress='127.0.0.1',now=new Date()}){
 const request={vnp_RequestId:requestId,vnp_Version:version,vnp_Command:'refund',vnp_TmnCode:tmnCode,vnp_TransactionType:'02',vnp_TxnRef:txnRef,vnp_Amount:gatewayAmount(amount),vnp_TransactionNo:transactionNo??'',vnp_TransactionDate:transactionDate,vnp_CreateBy:createBy,vnp_CreateDate:vnpayDate(now),vnp_IpAddr:ipAddress,vnp_OrderInfo:`Hoan tien don hang ${txnRef}`};
 request.vnp_SecureHash=await signTransactionRequest(refundRequestFields,request,secret);
 return request;
}
export async function callTransactionApi(payload,{transport=fetch,endpoint=transactionUrl,timeoutMs=10000}={}){
 if(endpoint!==transactionUrl)throw Error('VNPAY_ENDPOINT_NOT_ALLOWED');
 const signal=AbortSignal.timeout(timeoutMs);
 const response=await transport(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
 if(!response.ok)throw Error('VNPAY_TRANSACTION_HTTP_ERROR');
 return response.json();
}
export async function eventFingerprint(params){
 const payload=Object.entries(params).filter(([key])=>key!=='vnp_SecureHash').sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('&');
 return hex(await crypto.subtle.digest('SHA-256',encoder.encode(payload)));
}
