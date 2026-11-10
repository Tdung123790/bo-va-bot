import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const installed=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(installed?{executablePath:installed}:{})});
try{
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:4173/menu.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const {initCheckoutForm}=await import('/js/components/checkout-form.js');
   const dialog=await initCheckoutForm();dialog.showModal();
  });
  const boundaries=await page.evaluate(async()=>{
   const {validateRequestedAt}=await import('/js/services/orderService.js');
   const now=new Date('2026-11-09T14:00:00+07:00');
   const accepted=(date,time,options)=>{try{validateRequestedAt(date,time,{...options,now});return true;}catch{return false;}};
   return [accepted('2026-11-09','16:00',{minRegularHours:2}),accepted('2026-11-09','15:59',{minRegularHours:2}),accepted('2026-11-10','14:00',{hasCustomCake:true}),accepted('2026-11-10','13:59',{hasCustomCake:true})];
  });
  assert.deepEqual(boundaries,[true,false,true,false]);
  const dialog=page.locator('#checkout-dialog');
  await dialog.waitFor();
  assert.equal(await page.locator('input[name="fulfillmentType"][value="pickup"]').isChecked(),true);
  assert.equal(await page.locator('input[name="fulfillmentType"][value="delivery"]').isDisabled(),false);
  await page.locator('input[name="fulfillmentType"][value="delivery"]').check();
  assert.equal(await page.locator('#checkout-verify').isVisible(),true);
  assert.equal(await page.locator('#checkout-total').innerText(),'Cần xác minh địa chỉ');
  if(width===390){
   const leafletReady=await page.locator('#checkout-map.leaflet-container').waitFor({timeout:9000}).then(()=>true).catch(()=>false);
   if(leafletReady){
    await page.locator('#checkout-map').click({position:{x:100,y:100}});
    assert.match(await page.locator('#checkout-verification').innerText(),/Cần xác minh lại/);
    console.log('PASS Leaflet pin interaction at 390px');
   }else assert.fail('Leaflet pin interaction: local asset unavailable in browser environment');
  }
  const geometry=await page.evaluate(()=>({dialogWidth:document.querySelector('#checkout-dialog').getBoundingClientRect().width,viewport:innerWidth,bodyScroll:document.documentElement.scrollWidth}));
  assert.ok(geometry.dialogWidth<=geometry.viewport+1);
  assert.ok(geometry.bodyScroll<=geometry.viewport+1);
  await page.locator('input[name="fulfillmentType"][value="pickup"]').check();
  assert.equal(await page.locator('#checkout-shipping').isVisible(),false);
  assert.deepEqual(pageErrors,[]);
  await page.close();
  console.log(`PASS checkout layout ${width}px: delivery verification controls, no horizontal overflow, pickup remains selectable`);
 }
}finally{await browser.close();}
