import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:4173/';
let server,browser;
try{
 try{if(!(await fetch(origin+'vnpay-result.html')).ok)throw Error('SITE_NOT_RUNNING');}
 catch{
  server=spawn(process.execPath,['scripts/serve-site.cjs'],{stdio:'ignore',windowsHide:true});
  let ready=false;
  for(let i=0;i<40;i++){
   await new Promise(resolve=>setTimeout(resolve,250));
   try{ready=(await fetch(origin+'vnpay-result.html')).ok;if(ready)break;}catch{}
  }
  if(!ready)throw Error('SITE_NOT_RUNNING');
 }
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const scenario of ['signed_paid','unsigned_return_only','provider_error']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let reconciled=false;
  await page.route('**/functions/v1/vnpay-gateway',route=>{
   const action=route.request().postDataJSON()?.action;
   if(action==='status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({orderId:'11111111-1111-4111-8111-111111111111',paymentStatus:reconciled?'paid':'pending',gatewayResult:reconciled?'paid':'awaiting'})});
   if(action==='reconcile'){
    if(scenario==='signed_paid')reconciled=true;
    return route.fulfill({status:scenario==='provider_error'?503:200,contentType:'application/json',body:JSON.stringify(scenario==='provider_error'?{error:'VNPAY_TRANSACTION_HTTP_ERROR'}:{status:reconciled?'processed':'reconciliation_required'})});
   }
   return route.abort();
  });
  await page.goto(origin+'vnpay-result.html?vnp_TxnRef=TESTREF123&vnp_ResponseCode=00',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('#vnpay-result-status')?.textContent?.includes('Đang '));
  const message=await page.locator('#vnpay-result-status').innerText();
  if(scenario==='signed_paid')assert.match(message,/Backend đã xác nhận giao dịch VNPAY sandbox thành công/);
  else assert.match(message,/Chưa xác nhận đã nhận tiền/);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
  console.log(`PASS VNPAY Return browser mock: ${scenario}`);
 }
}finally{if(browser)await browser.close();if(server)server.kill();}
