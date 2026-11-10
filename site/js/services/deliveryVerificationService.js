import {getBackendUrl,getBackendPublishableKey,getSupabaseClient,isSupabaseMode} from '../core/backend.js';

const BOBOT_ADDRESS_AUTOCOMPLETE_V1=true;
const BOBOT_SIGNED_ADDRESS_SELECTION_V1=true;

export async function suggestDeliveryAddresses(query,signal){
 if(!isSupabaseMode())return [];
 const client=await getSupabaseClient();
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session?.access_token)return [];
 const base=getBackendUrl();
 const url=base?new URL(base):null;
 if(!url||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&['localhost','127.0.0.1'].includes(location.hostname)))throw Error('Ch?a c?u h?nh backend giao h?ng h?p l?.');
 const response=await fetch(new URL('/functions/v1/delivery-verify',base),{
  method:'POST',
  headers:{
   'Content-Type':'application/json',
   apikey:getBackendPublishableKey(),
   Authorization:'Bearer '+session.access_token
  },
  body:JSON.stringify({action:'suggest',query}),
  signal
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Kh?ng t?m ???c ??a ch?.');
 return Array.isArray(data.suggestions)?data.suggestions:[];
}

export async function verifyDeliveryAddress({address,lat,lng,requestId,placeId=null,selectionToken=null}){
 if(!isSupabaseMode())throw Error('Xác minh giao hàng chỉ có ở chế độ Supabase.');
 const client=await getSupabaseClient();
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session?.access_token)throw Error('Vui lòng đăng nhập Customer để xác minh địa chỉ.');
 const base=getBackendUrl();
 const url=base?new URL(base):null;
 if(!url||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&['localhost','127.0.0.1'].includes(location.hostname)))throw Error('Chưa cấu hình backend giao hàng hợp lệ.');
 let response;
 try{response=await fetch(new URL('/functions/v1/delivery-verify',base),{method:'POST',headers:{'Content-Type':'application/json',apikey:getBackendPublishableKey(),Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({address,pin:{lat,lng},request_id:requestId,place_id:placeId,selection_token:selectionToken}),signal:AbortSignal.timeout(12000)});}
 catch{throw Error('Không kết nối được dịch vụ xác minh địa chỉ. Vui lòng thử lại.');}
 const result=await response.json().catch(()=>({}));
 if(!response.ok){
  if(result.error==='GEOCODER_NOT_CONFIGURED'||result.error==='DELIVERY_ORIGIN_NOT_APPROVED')throw Error('Giao hàng chưa được cấu hình để xác minh địa chỉ.');
  if(result.error==='PIN_ADDRESS_MISMATCH'||result.error==='ADDRESS_MANUAL_REVIEW_REQUIRED')throw Error('Ghim và địa chỉ chưa khớp; vui lòng kiểm tra hoặc chọn nhận tại cửa hàng.');
  throw Error('Chưa thể xác minh địa chỉ giao hàng. Vui lòng thử lại hoặc chọn nhận tại cửa hàng.');
 }
 if(!result.proof_id||!result.expires_at)throw Error('Backend chưa trả bằng chứng xác minh địa chỉ.');
 return result;
}
