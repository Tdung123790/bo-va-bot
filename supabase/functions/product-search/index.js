const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const modelPromise=Deno.readTextFile(new URL('./model.json',import.meta.url)).then(JSON.parse);

function normalize(value){
 return value.toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function weighted(counts,idf){
 const weights=new Map();
 let squared=0;
 for(const [index,count] of counts){
  const weight=count*idf[index];
  weights.set(index,weight);
  squared+=weight*weight;
 }
 if(!squared)return weights;
 const norm=Math.sqrt(squared);
 for(const [index,weight] of weights)weights.set(index,weight/norm);
 return weights;
}

function charVector(query,model){
 const counts=new Map();
 for(const token of normalize(query).split(' ')){
  if(!token)continue;
  const padded=` ${token} `;
  for(let n=2;n<=5;n++)for(let i=0;i<=padded.length-n;i++){
   const term=padded.slice(i,i+n);
   if(!Object.hasOwn(model.char_vocabulary,term))continue;
   const index=model.char_vocabulary[term];
   counts.set(index,(counts.get(index)||0)+1);
  }
 }
 return weighted(counts,model.char_idf);
}

function wordVector(query,model){
 const tokens=normalize(query).split(' ').filter(Boolean);
 const counts=new Map();
 for(let n=1;n<=2;n++)for(let i=0;i<=tokens.length-n;i++){
  const term=tokens.slice(i,i+n).join(' ');
  if(!Object.hasOwn(model.word_vocabulary,term))continue;
  const index=model.word_vocabulary[term];
  counts.set(index,(counts.get(index)||0)+1);
 }
 return weighted(counts,model.word_idf);
}

function dot(indices,weights,query){
 let score=0;
 for(let i=0;i<indices.length;i++)score+=(query.get(indices[i])||0)*weights[i];
 return score;
}

async function eligibleProducts(){
 const url=Deno.env.get('SUPABASE_URL');
 const key=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key)throw Error('BACKEND_UNAVAILABLE');
 const response=await fetch(`${url}/rest/v1/products?select=source_id,status,stock_quantity,base_price,is_customizable&status=eq.active&limit=1000`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!response.ok)throw Error('CATALOG_UNAVAILABLE');
 const rows=await response.json();
 return new Set(rows.filter(row=>row.source_id&&Number(row.stock_quantity)>0&&Number(row.base_price)>0&&!row.is_customizable).map(row=>row.source_id));
}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const body=await request.json().catch(()=>null);
 const query=body?.query;
 const limit=body?.limit===undefined?12:Number(body.limit);
 if(typeof query!=='string'||query.trim().length<2||query.length>120||!Number.isInteger(limit)||limit<1||limit>24)return json({error:'INVALID_SEARCH_REQUEST'},400);
 try{
  const model=await modelPromise;
  if(model.version!=='tfidf-hybrid-20261110-v1'||model.documents?.length!==63)throw Error('MODEL_UNAVAILABLE');
  const word=wordVector(query,model);
  const char=charVector(query,model);
  const eligible=await eligibleProducts();
  const results=model.documents.filter(row=>eligible.has(row.source_id)).map(row=>{
   const score=model.weights.word*dot(row.word_indices,row.word_weights,word)+model.weights.char_wb*dot(row.char_indices,row.char_weights,char);
   return {source_id:row.source_id,score};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.source_id.localeCompare(b.source_id)).slice(0,limit)
   .map(row=>({source_id:row.source_id,score:Number(row.score.toFixed(6))}));
  return json({results,model_version:model.version,corpus_fingerprint:model.corpus_fingerprint,mode:'model'});
 }catch{return json({error:'SEARCH_UNAVAILABLE'},503);}
});
