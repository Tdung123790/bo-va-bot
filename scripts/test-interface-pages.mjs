import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
const productId='0533f042-0bc0-487c-8a31-70b2fd00ec02';
const routes=['menu.html',`product.html?id=${productId}`,'wishlist.html','profile.html','login.html','reviews.html','contact.html','admin-management.html','admin-orders.html','staff-orders.html','pos.html','dashboard.html'];
const widths=[['desktop',1440,900],['tablet',768,1024],['mobile',390,844],['small-mobile',360,800]];
const output='artifacts/ui-polish/pages';
await fs.mkdir(output,{recursive:true});
const results=[];
try{
 for(const [label,width,height] of widths){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.setDefaultTimeout(12000);
  await page.route('https://**/*',route=>route.abort());
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const route of routes){
   errors.length=0;
   await page.goto(`http://127.0.0.1:4173/${route}`,{waitUntil:'domcontentloaded',timeout:15000});
   if(route==='menu.html')await page.locator('.product-card--menu').first().waitFor({state:'attached',timeout:18000});
   if(route.startsWith('product.html'))await page.locator('.detail-grid').first().waitFor({state:'attached',timeout:18000});
   await page.waitForTimeout(750);
   const name=route.split('?')[0].replace('.html','');
   const state=await page.evaluate(()=>({width:document.documentElement.scrollWidth-innerWidth,title:document.title,page:document.body.dataset.page||'',main:!!document.querySelector('main')}));
   await page.screenshot({path:`${output}/${label}-${name}.png`,timeout:12000,animations:'disabled'});
   results.push({size:label,route,state,errors:[...errors]});
   assert.ok(state.width<=1,`${label} ${route}: horizontal overflow ${state.width}px`);
   assert.equal(state.main,true,`${label} ${route}: missing main`);
  }
  await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(`${output}/report.json`,JSON.stringify(results,null,2));
console.log(`PASS ${results.length} page and viewport combinations`);
console.log(JSON.stringify(results.filter(row=>row.errors.length)));
