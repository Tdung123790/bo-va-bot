const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const dataPromise=Deno.readTextFile(new URL('./rankings.json',import.meta.url)).then(JSON.parse);

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const body=await request.json().catch(()=>null);
 const productId=body?.product_id;
 if(typeof productId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId))return json({error:'INVALID_PRODUCT_ID'},400);
 try{
  const data=await dataPromise;
  const productIds=data.rankings[productId];
  return json({source_id:productId,method:data.method,product_ids:productIds||[]});
 }catch{return json({error:'RECOMMENDATION_UNAVAILABLE'},503);}
});
