import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../staging');
const served=new Set(['index.html','404.html','assets/staging.css','favicon.svg','robots.txt']);
const type=name=>name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/plain; charset=utf-8';
const server=http.createServer(async(request,response)=>{
 let name;
 try{name=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/^\//,'')||'index.html';}
 catch{response.writeHead(400).end();return;}
 const allowed=served.has(name);
 const file=allowed?name:'404.html';
 try{
  const body=await fs.readFile(path.join(root,file));
  response.writeHead(allowed?200:404,{'Content-Type':type(file),'Cache-Control':'no-store'}).end(body);
 }catch{response.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  page.on('request',request=>{if(new URL(request.url()).origin!==base)external.push(request.url())});
  const response=await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  assert.equal(await page.locator('.notice').textContent(),'Môi trường thử nghiệm — Không nhận đơn hàng thực tế');
  assert.equal(await page.locator('script,form,img,iframe').count(),0);
  assert.equal(await page.locator('link[rel="stylesheet"]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(254, 245, 225)');
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(os.tmpdir(),`bobot-staging-${viewport.width}.png`),fullPage:true});
  await page.close();
  console.log(`PASS staging browser ${viewport.width}x${viewport.height}: content, CSS, overflow, console, network`);
 }
 for(const route of ['checkout.html','login.html','pos.html','staff-orders.html','admin-orders.html','dashboard.html','backend-config.json','supabase/functions/vnpay-gateway','scripts/test-vnpay-edge-local.mjs','.git/config']){
  const response=await fetch(`${base}/${route}`);
  assert.equal(response.status,404,route);
  assert.match(await response.text(),/Trang này không khả dụng/);
 }
 console.log('PASS staging route security: checkout, auth, POS, admin, backend and internal paths return 404');
}finally{
 await browser?.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
}
