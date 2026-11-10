import {getSupabaseClient,backendError,isSupabaseMode} from '../core/backend.js';

async function gateway(action,body){
 if(!isSupabaseMode())throw Error('VNPAY chỉ khả dụng ở chế độ Supabase.');
 const client=await getSupabaseClient();
 const {data,error}=await client.functions.invoke('vnpay-gateway',{body:{action,...body}});
 if(error)throw backendError(error);
 if(data?.error)throw Error(data.error);
 return data;
}
export const startVnpayPayment=orderId=>gateway('start',{orderId});
export const getVnpayAvailability=()=>gateway('availability',{});
export const getVnpayStatus=body=>gateway('status',body);
export const reconcileVnpayPayment=orderId=>gateway('reconcile',{orderId});
export const requestVnpayFullRefund=(orderId,requestId)=>gateway('refund',{orderId,requestId});
