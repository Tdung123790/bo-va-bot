import {getJSON,setJSON} from '../core/storage.js';
import {getOrders,getOrderItems,ORDER_KEY} from './orderService.js';import {getCurrentMember,isAdmin} from './authService.js';
import {getNextStatus,normalizeOrderStatus} from './orderStatusService.js';import {earnForCompletedOrder} from './loyaltyService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
import {cachePaymentRows} from './paymentService.js';
export const HISTORY_KEY='bobot:v1:orderStatusHistory';
const historyCache=new Map();
function authorize(){const member=getCurrentMember();if(!member||!isAdmin(member))throw Error('FORBIDDEN_NOT_ADMIN');return member;}
async function demoGetAdminOrders(){authorize();const rows=getOrders().slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,100);const lineRows=getOrderItems();return {success:true,orders:rows.map(o=>({...o,db_items:lineRows.filter(i=>i.order_id===o._id)}))};}
async function demoUpdateOrderStatus({orderId,status}={}){const admin=authorize();if(!orderId||!status)throw Error('MISSING_DATA');const orders=getOrders(),idx=orders.findIndex(o=>o._id===orderId||o.id===orderId);if(idx<0)throw Error('ORDER_NOT_FOUND');const original=orders[idx],current=normalizeOrderStatus(original.order_status||original.status),next=getNextStatus(current,original.fulfillmentType);if(status!==next)throw Error('INVALID_STATUS_TRANSITION');const now=new Date().toISOString();const updated={...original,order_status:next,status:next,...(next==='completed'&&!original.completed_at?{completed_at:now}:{})};const before=getJSON(HISTORY_KEY,[])||[],entry={history_id:crypto.randomUUID(),order_id:original._id,status:next,changed_by:admin.contactId,created_at:now};orders[idx]=updated;if(!setJSON(ORDER_KEY,orders))throw Error('Không lưu được đơn');if(!setJSON(HISTORY_KEY,[...before,entry])){orders[idx]=original;setJSON(ORDER_KEY,orders);throw Error('Không lưu được lịch sử');}try{const loyalty=next==='completed'?earnForCompletedOrder(updated):{earned:0};window.dispatchEvent(new CustomEvent('bobot:orders-updated',{detail:{orderId}}));return {success:true,order:updated,loyalty};}catch(e){orders[idx]=original;setJSON(ORDER_KEY,orders);setJSON(HISTORY_KEY,before);throw e;}}
async function demoGetMyOrders(){const id=getCurrentMember()?.contactId;if(!id)throw Error('UNAUTHORIZED');const lineRows=getOrderItems();return {success:true,orders:getOrders().filter(x=>x.customer_id===id).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).map(o=>({...o,db_items:lineRows.filter(i=>i.order_id===o._id)}))};}
function demoGetHistory(orderId){const arr=getJSON(HISTORY_KEY,[])||[];return arr.filter(x=>x.order_id===orderId);}
export const adminOrderService={getAdminOrders,updateOrderStatus,getMyOrders,getHistory};
async function backendOrders(customerId=null){
 const client=await getSupabaseClient();
 let query=client.from('orders').select('*,order_items(*),order_status_history(*),payments(*)').order('created_at',{ascending:false}).limit(100);
 if(customerId)query=query.eq('customer_id',customerId);
 const {data,error}=await query;if(error)throw backendError(error);
 return data.map(row=>{
  historyCache.set(row.id,(row.order_status_history||[]).map(entry=>({...entry,status:entry.to_status})));
  cachePaymentRows(row.id,row.payments||[]);
  return {...row,_id:row.id,payment_method:row.payments?.find(payment=>payment.kind==='charge')?.payment_method,
   fulfillmentType:row.fulfillment_type,customerName:row.ship_recipient,customerPhone:row.ship_phone,
   deliveryAddress:row.ship_address,estimatedTime:row.requested_at,db_items:row.order_items||[]};
 });
}
export async function getAdminOrders(){authorize();return isSupabaseMode()?{success:true,orders:await backendOrders()}:demoGetAdminOrders();}
export async function getMyOrders(){const id=getCurrentMember()?.contactId;if(!id)throw Error('UNAUTHORIZED');return isSupabaseMode()?{success:true,orders:await backendOrders(id)}:demoGetMyOrders();}
export async function requestCancellation(orderId,reason){
 if(!isSupabaseMode()||!getCurrentMember()?.contactId)throw Error('Bạn cần đăng nhập.');
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('submit_order_cancel_request',{p_order:orderId,p_reason:reason});
 if(error)throw backendError(error);
 return data;
}
export async function cancelMyOrder(orderId){
 if(!isSupabaseMode())throw Error('Chức năng hủy đơn chỉ khả dụng trong chế độ Supabase.');
 if(!getCurrentMember()?.contactId)throw Error('Bạn cần đăng nhập.');
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('cancel_order',{p_order:orderId,p_reason:null});
 if(error)throw backendError(error);
 return data;
}
export async function updateOrderStatus({orderId,status}={}){
 if(!isSupabaseMode())return demoUpdateOrderStatus({orderId,status});
 authorize();const client=await getSupabaseClient();
 const {data,error}=await client.rpc('transition_order',{p_order:orderId,p_next:status,p_handover:status==='completed'});
 if(error)throw backendError(error);return {success:true,order:data};
}
export function getHistory(orderId){return isSupabaseMode()?historyCache.get(orderId)||[]:demoGetHistory(orderId);}
