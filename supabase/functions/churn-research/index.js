const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
const env=name=>Deno.env.get(name)||'';
const files={summary:'research.json',evaluation:'assets/churn_evaluation.png',importance:'assets/churn_feature_importance.png'};

async function isActiveAdmin(request){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const publicKey=env('SUPABASE_ANON_KEY'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!publicKey||!serviceKey)throw Error('BACKEND_NOT_CONFIGURED');
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))return false;
 const userResponse=await fetch(base+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:authorization},signal:AbortSignal.timeout(10000)});
 if(!userResponse.ok)return false;
 const user=await userResponse.json();
 if(!user?.id)return false;
 const profileResponse=await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status&limit=1`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},signal:AbortSignal.timeout(10000)});
 if(!profileResponse.ok)throw Error('PROFILE_UNAVAILABLE');
 const profile=(await profileResponse.json())[0];
 return profile?.role==='admin'&&profile?.status==='active';
}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  if(!await isActiveAdmin(request))return json({error:'ADMIN_REQUIRED'},403);
  const body=await request.json().catch(()=>null);
  const asset=body?.asset;
  if(!Object.hasOwn(files,asset))return json({error:'INVALID_ASSET'},400);
  const bytes=await Deno.readFile(new URL('./'+files[asset],import.meta.url));
  return new Response(bytes,{headers:{...headers,'Content-Type':asset==='summary'?'application/json; charset=utf-8':'image/png'}});
 }catch(error){
  return json({error:error?.message==='BACKEND_NOT_CONFIGURED'?'BACKEND_NOT_CONFIGURED':'CHURN_RESEARCH_UNAVAILABLE'},503);
 }
});
