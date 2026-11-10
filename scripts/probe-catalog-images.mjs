import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'reference/production/catalog-approval.json'),'utf8'));
const rows=manifest.products.filter(row=>row.imageUrl);
let cursor=0;
const results=[];
async function worker(){
 while(cursor<rows.length){
  const row=rows[cursor++];
  let result;
  try{
   const url=new URL(row.imageUrl);
   if(url.protocol!=='https:')throw Error('HTTPS_REQUIRED');
   const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(5000),redirect:'follow'});
   result={sourceId:row.sourceId,status:response.ok?'REACHABLE_AT_CHECK_TIME':'UNVERIFIED_HTTP',httpStatus:response.status};
  }catch(error){result={sourceId:row.sourceId,status:'UNVERIFIED_NETWORK',error:error.name==='TimeoutError'?'TIMEOUT':error.message};}
  results.push(result);
 }
}
await Promise.all(Array.from({length:Math.min(8,rows.length)},()=>worker()));
results.sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
const summary={checked:results.length,reachable:results.filter(row=>row.status==='REACHABLE_AT_CHECK_TIME').length,unverifiedHttp:results.filter(row=>row.status==='UNVERIFIED_HTTP').length,unverifiedNetwork:results.filter(row=>row.status==='UNVERIFIED_NETWORK').length,rightsVerified:0};
const index=process.argv.indexOf('--report');
if(index>=0){const file=path.resolve(process.argv[index+1]);await fs.writeFile(file,JSON.stringify({checkedAt:new Date().toISOString(),summary,results},null,2)+'\n');}
console.log(JSON.stringify(summary));
