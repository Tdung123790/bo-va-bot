import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:4173/';
let server,browser;
try{
 try{if(!(await fetch(origin+'menu.html')).ok)throw Error('SITE_NOT_RUNNING');}
 catch{
  server=spawn(process.execPath,['scripts/serve-site.cjs'],{stdio:'ignore',windowsHide:true});
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
   await new Promise(resolve=>setTimeout(resolve,250));
   try{ready=(await fetch(origin+'menu.html')).ok;if(ready)break;}catch{}
  }
  if(!ready)throw Error('SITE_NOT_RUNNING');
 }
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:width===768?1024:width===390?844:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const available=width===1440;
  await page.route('**/functions/v1/vnpay-gateway',route=>route.fulfill({status:200,
   contentType:'application/json',body:JSON.stringify({available})}));
  await page.goto(origin+'menu.html',{waitUntil:'domcontentloaded'});
  const state=await page.evaluate(async()=>{
   const {initCheckoutForm}=await import('./js/components/checkout-form.js');
   await initCheckoutForm();
   const radios=[...document.querySelectorAll('#checkout-form [name=paymentMethod]')];
   return {methods:radios.map(item=>item.value),vnpayDisabled:radios.find(item=>item.value==='vnpay')?.disabled,
    overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.waitForFunction(()=>!document.querySelector('#checkout-form [value="vnpay"]')?.closest('label')?.textContent.includes('đang kiểm tra'));
  const configured=await page.locator('#checkout-form [value="vnpay"]').isDisabled();
  assert.deepEqual(state.methods,['bank_transfer_demo','vnpay']);
  assert.equal(configured,!available);
  assert.equal(state.overflow,false);
  assert.deepEqual(errors,[]);
  console.log(`PASS VNPAY checkout UI ${width}px: separate demo/VNPAY methods, no overflow or pageerror`);
  await page.close();
 }
}finally{
 if(browser)await browser.close();
 if(server)server.kill();
}
