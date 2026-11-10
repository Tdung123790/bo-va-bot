import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const root='http://127.0.0.1:4173/';
let server;
try{if(!(await fetch(root+'index.html')).ok)throw Error('unavailable');}
catch{
 server=spawn(process.execPath,['scripts/serve-site.cjs'],{stdio:'ignore',windowsHide:true});
 let ready=false;
 for(let i=0;i<40;i++){await new Promise(resolve=>setTimeout(resolve,250));try{ready=(await fetch(root+'index.html')).ok;if(ready)break;}catch{}}
 if(!ready)throw Error('Local HTTP server unavailable');
}
const routes=['index.html','menu.html','product.html','customize.html','promotions.html','promotion-detail.html','reviews.html','about.html','contact.html','wishlist.html','login.html','profile.html','admin-orders.html','pos.html','staff-orders.html','dashboard.html','vnpay-result.html','404.html'];
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const failures=[],images=[];
 for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  for(const route of routes){
   const page=await context.newPage(),errors=[],http=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('response',response=>{if(response.url().startsWith(root)&&response.status()>=400&&!response.url().endsWith('/favicon.ico'))http.push(response.status()+' '+response.url());});
   const response=await page.goto(root+route,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(550);
   const state=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,broken:[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.currentSrc||img.src),fontStatus:document.fonts.status}));
   if(response?.status()!==200||state.scroll>state.width||errors.length||http.length)failures.push({route,width:viewport.width,status:response?.status(),scroll:state.scroll,errors,http});
   if(state.broken.length)images.push({route,width:viewport.width,count:state.broken.length});
   await page.close();
  }
  await context.close();
 }
 console.log(JSON.stringify({routes:routes.length,viewports:[1440,768,390],failures,brokenImages:images},null,2));
 if(failures.length)process.exitCode=1;
}finally{if(browser)await browser.close();if(server)server.kill();}
