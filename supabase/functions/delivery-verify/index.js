import {validateProviderMatch,normalizeAddress} from '../_shared/delivery.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});
const env=name=>Deno.env.get(name)||'';
const supabaseUrl=()=>env('SUPABASE_URL').replace(/\/$/,'');
let lookupQueue=Promise.resolve(),nextLookupAt=0;
async function supabase(path,key,body,method='GET'){
 const response=await fetch(supabaseUrl()+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('BACKEND_UNAVAILABLE');
 return response.json();
}

const BOBOT_ADDRESS_AUTOCOMPLETE_V1=true;

async function geoapifyLookup(mode,text,limit){
 const key=env('BOBOT_GEOAPIFY_API_KEY');
 if(!key)throw Error('GEOCODER_NOT_CONFIGURED');
 const url=new URL('https://api.geoapify.com/v1/geocode/'+mode);
 url.searchParams.set('text',text);
 url.searchParams.set('lang','vi');
 url.searchParams.set('filter','countrycode:vn');
 url.searchParams.set('bias','proximity:106.700540,10.773150');
 url.searchParams.set('limit',String(limit));
 url.searchParams.set('format','json');
 url.searchParams.set('apiKey',key);
 const response=await fetch(url,{
  headers:{Accept:'application/json'},
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error('GEOCODER_UNAVAILABLE');
 const data=await response.json();
 if(!Array.isArray(data.results))throw Error('GEOCODER_UNAVAILABLE');
 return data.results.filter(x=>
  String(x.country_code).toLowerCase()==='vn' &&
  Number.isFinite(Number(x.lat)) &&
  Number.isFinite(Number(x.lon))
 );
}

async function geoapifySelectedPlace(placeId){
 if(!/^[0-9a-f]{30,190}$/i.test(placeId))throw Error('INVALID_ADDRESS_SELECTION');

 const key=env('BOBOT_GEOAPIFY_API_KEY');
 if(!key)throw Error('GEOCODER_NOT_CONFIGURED');

 const url=new URL('https://api.geoapify.com/v2/place-details');
 url.searchParams.set('id',placeId);
 url.searchParams.set('apiKey',key);

 const response=await fetch(url,{
  headers:{Accept:'application/json'},
  signal:AbortSignal.timeout(8000)
 });

 if(!response.ok)throw Error('GEOCODER_UNAVAILABLE');

 const data=await response.json();
 const feature=Array.isArray(data.features)
  ?data.features.find(x=>x?.properties?.feature_type==='details')
  :null;

 const p=feature?.properties;

 if(!p||String(p.country_code||'').toLowerCase()!=='vn'
  ||!p.housenumber||!p.street||!(p.city||p.state)){
  throw Error('ADDRESS_MANUAL_REVIEW_REQUIRED');
 }

 const lat=Number(p.lat),lng=Number(p.lon);

 if(!Number.isFinite(lat)||!Number.isFinite(lng)){
  throw Error('GEOCODER_INVALID_LOCATION');
 }

 return {
  lat,lng,
  country_code:'VN',
  house_number:p.housenumber,
  road:p.street,
  city:p.city||p.state,
  provider_ref:'GEO_'+placeId
 };
}

async function geoapifyProvider(address){
 const rows=await geoapifyLookup('search',address,5);
 const result=rows.find(x=>x.housenumber&&x.street&&(x.city||x.state)&&x.place_id);
 if(!result)throw Error('ADDRESS_MANUAL_REVIEW_REQUIRED');
 return {
  lat:result.lat,
  lng:result.lon,
  country_code:'VN',
  house_number:result.housenumber,
  road:result.street,
  city:result.city||result.state,
  provider_ref:'GEO_'+String(result.place_id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,180)
 };
}

async function provider(address,serviceKey){
 if(env('BOBOT_GEOAPIFY_API_KEY'))return geoapifyProvider(address);
 const contact=env('BOBOT_NOMINATIM_CONTACT_URL');
 if(!/^(?:https:\/\/[^\s/]+(?:\/[^\s]*)?|mailto:[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(contact))throw Error('GEOCODER_NOT_CONFIGURED');
 const url=new URL(env('BOBOT_NOMINATIM_URL')||'https://nominatim.openstreetmap.org/search');
 if(url.hostname==='nominatim.openstreetmap.org'&&(env('BOBOT_DELIVERY_TEST_MODE')!=='isolated'
  ||!['127.0.0.1','localhost','kong','host.docker.internal'].includes(new URL(supabaseUrl()).hostname)))throw Error('GEOCODER_RATE_LIMIT_UNSAFE');
 if(url.protocol!=='https:'&&!(env('BOBOT_DELIVERY_TEST_MODE')==='isolated'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('GEOCODER_ENDPOINT_NOT_ALLOWED');
 if(url.username||url.password)throw Error('GEOCODER_ENDPOINT_NOT_ALLOWED');
 url.searchParams.set('q',address);
 url.searchParams.set('format','jsonv2');
 url.searchParams.set('addressdetails','1');
 url.searchParams.set('countrycodes','vn');
 url.searchParams.set('limit','1');
 const lookup=async()=>{
  const delay=Math.max(0,nextLookupAt-Date.now());
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  await supabase('/rest/v1/rpc/reserve_nominatim_request',serviceKey,{},'POST');
  nextLookupAt=Date.now()+1100;
  const response=await fetch(url,{headers:{'User-Agent':`BoBotDeliveryDemo/1.0 (${contact})`,'Accept-Language':'vi','Accept':'application/json'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('GEOCODER_UNAVAILABLE');
  const rows=await response.json();
  const result=Array.isArray(rows)?rows[0]:null;
  if(!result)throw Error('ADDRESS_MANUAL_REVIEW_REQUIRED');
  if(!['node','way','relation'].includes(result.osm_type)||!Number.isSafeInteger(Number(result.osm_id))||Number(result.osm_id)<=0)throw Error('GEOCODER_INVALID_LOCATION');
  return {lat:result.lat,lng:result.lon,country_code:String(result.address?.country_code||'').toUpperCase(),house_number:result.address?.house_number,road:result.address?.road||result.address?.pedestrian||result.address?.residential,city:result.address?.city||result.address?.town||result.address?.state,provider_ref:`OSM_${result.osm_type}_${result.osm_id}`};
 };
 const pending=lookupQueue.then(lookup,lookup);
 lookupQueue=pending.catch(()=>{});
 return pending;
}

const BOBOT_SIGNED_ADDRESS_SELECTION_V1=true;
const selectionEncoder=new TextEncoder();
const selectionDecoder=new TextDecoder();
const encodeSelectionBytes=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const decodeSelectionBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function selectionKey(){
 return crypto.subtle.importKey('raw',selectionEncoder.encode('BOBOT_DELIVERY_SELECTION_V1:'+env('SUPABASE_SERVICE_ROLE_KEY')),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function issueAddressSelection(value){
 const data=selectionEncoder.encode(JSON.stringify(value));
 const sig=await crypto.subtle.sign('HMAC',await selectionKey(),data);
 return encodeSelectionBytes(data)+'.'+encodeSelectionBytes(sig);
}
async function verifyAddressSelection(token,userId){
 try{
  if(typeof token!=='string'||token.length<40||token.length>4000)throw Error();
  const parts=token.split('.');
  if(parts.length!==2)throw Error();
  const data=decodeSelectionBytes(parts[0]),sig=decodeSelectionBytes(parts[1]);
  if(!await crypto.subtle.verify('HMAC',await selectionKey(),sig,data))throw Error();
  const value=JSON.parse(selectionDecoder.decode(data));
  if(value.v!==1||value.user_id!==userId||!Number.isFinite(value.exp)||value.exp<Date.now()||value.exp>Date.now()+300000||value.country_code!=='VN'||!value.house_number||!value.road||!value.city||!value.provider_ref)throw Error();
  return value;
 }catch{throw Error('INVALID_ADDRESS_SELECTION');}
}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return json({ok:true});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const publicKey=env('SUPABASE_ANON_KEY'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!publicKey||!serviceKey||!supabaseUrl())throw Error('BACKEND_NOT_CONFIGURED');
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))throw Error('AUTH_REQUIRED');
  const jwt=authorization.slice(7);
  const userResponse=await fetch(supabaseUrl()+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:`Bearer ${jwt}`},signal:AbortSignal.timeout(10000)});
  if(!userResponse.ok)throw Error('AUTH_REQUIRED');
  const user=await userResponse.json();
  const profileResponse=await fetch(`${supabaseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,status&limit=1`,{headers:{apikey:publicKey,Authorization:`Bearer ${jwt}`},signal:AbortSignal.timeout(10000)});
  if(!profileResponse.ok)throw Error('PROFILE_UNAVAILABLE');
  const profile=(await profileResponse.json())[0];
  if(!profile||profile.role!=='customer'||profile.status!=='active')throw Error('CUSTOMER_REQUIRED');
  const settings=await supabase('/rest/v1/store_settings?store_key=eq.main&select=delivery_origin_approved_at,delivery_origin_approval_source&limit=1',serviceKey);
  if(!settings[0]?.delivery_origin_approved_at||!settings[0]?.delivery_origin_approval_source)throw Error('DELIVERY_ORIGIN_NOT_APPROVED');
  const body=await request.json();
  if(body?.action==='suggest'){
   const query=String(body?.query||'').trim();
   if(query.length<4||query.length>120)throw Error('INVALID_ADDRESS_QUERY');
   const entries=await geoapifyLookup('autocomplete',query,6);
   const suggestions=await Promise.all(entries.filter(x=>x.housenumber&&x.street&&(x.city||x.state)&&x.place_id&&x.formatted).map(async x=>{
    const trusted={v:1,user_id:user.id,exp:Date.now()+300000,formatted:String(x.formatted),lat:Number(x.lat),lng:Number(x.lon),country_code:'VN',house_number:String(x.housenumber),road:String(x.street),city:String(x.city||x.state),provider_ref:'GEO_'+String(x.place_id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,180)};
    return {display_name:trusted.formatted,lat:trusted.lat,lon:trusted.lng,selection_token:await issueAddressSelection(trusted)};
   }));
   return json({suggestions});
  }
    const address=String(body?.address||''),requestId=String(body?.request_id||'');
  if(address.length<12||address.length>500||/\b0\d{9,10}\b/u.test(address)||requestId.length<1||requestId.length>200||!body?.pin||!Number.isFinite(Number(body.pin.lat))||!Number.isFinite(Number(body.pin.lng))||Number(body.pin.lat)< -90||Number(body.pin.lat)>90||Number(body.pin.lng)< -180||Number(body.pin.lng)>180)throw Error('INVALID_VERIFICATION_REQUEST');
  const placeId=typeof body.place_id==='string'?body.place_id.trim():'';
  const selection=body?.selection_token?await verifyAddressSelection(body.selection_token,user.id):null;
  if(selection&&normalizeAddress(address)!==normalizeAddress(selection.formatted))throw Error('ADDRESS_MANUAL_REVIEW_REQUIRED');
  const match=validateProviderMatch(address,body.pin,selection||await provider(address,serviceKey));
  const result=await supabase('/rest/v1/rpc/issue_delivery_proof',serviceKey,{
   p_customer:user.id,p_request_id:requestId,p_address:address,p_lat:match.lat,p_lng:match.lng,p_provider_ref:match.providerRef
  },'POST');
  return json({proof_id:result.proof_id,expires_at:result.expires_at});
 }catch(error){
  const code=String(error?.message||'DELIVERY_VERIFICATION_FAILED');
  const status=code==='AUTH_REQUIRED'||code==='CUSTOMER_REQUIRED'?403:code.includes('NOT_CONFIGURED')||code.includes('UNAVAILABLE')||code==='DELIVERY_ORIGIN_NOT_APPROVED'?503:400;
  return json({error:code},status);
 }
});
