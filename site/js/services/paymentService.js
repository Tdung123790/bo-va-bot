import {getJSON,setJSON} from '../core/storage.js';
import {getCurrentMember} from './authService.js';
import {getOrders,ORDER_KEY} from './orderService.js';
import {earnForCompletedOrder} from './loyaltyService.js';
import {normalizeOrderStatus} from './orderStatusService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
const paymentCache=new Map();
export function cachePaymentRows(orderId,rows){paymentCache.set(orderId,rows);}
export function getPaymentHistory(orderId){
 if(!isSupabaseMode())return demoGetPaymentHistory(orderId);
 return (paymentCache.get(orderId)||[]).filter(row=>row.kind==='charge'&&row.status==='paid').map(row=>({created_at:row.paid_at||row.created_at,payment_method:row.payment_method}));
}
export function confirmDemoPayment({orderId}={}){
 if(!isSupabaseMode())return demoConfirmDemoPayment({orderId});
 return confirmBackendPayment(orderId);
}
async function confirmBackendPayment(orderId){
 const actor=getCurrentMember();
 if(!actor||!['staff','admin'].includes(actor.role))throw Error('Chỉ Staff hoặc Admin được xác nhận thanh toán demo.');
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('confirm_demo_payment',{p_order:orderId,p_money_received:true});
 if(error)throw backendError(error);
 return {success:true,order:data};
}

export const PAYMENT_HISTORY_KEY='bobot:v1:paymentHistory';
function demoGetPaymentHistory(orderId){
 const rows=getJSON(PAYMENT_HISTORY_KEY,[]);
 return (Array.isArray(rows)?rows:[]).filter(row=>row.order_id===orderId);
}

function demoConfirmDemoPayment({orderId}={}){
 const actor=getCurrentMember();
 if(!actor||!['staff','admin'].includes(actor.role))throw Error('Chỉ Staff hoặc Admin được xác nhận thanh toán demo');
 const orders=getOrders(),index=orders.findIndex(order=>order._id===orderId||order.id===orderId);
 if(index<0)throw Error('Không tìm thấy đơn hàng');
 const original=orders[index];
 if(normalizeOrderStatus(original.order_status)==='cancelled'||normalizeOrderStatus(original.status)==='cancelled')throw Error('Đơn đã hủy không thể xác nhận thanh toán mới');
 if(!['bank_transfer_demo'].includes(original.payment_method))throw Error('Đơn chưa có phương thức thanh toán demo hợp lệ');
 if(String(original.payment_status||'').toLowerCase()==='paid')throw Error('Thanh toán demo đã được xác nhận trước đó');
 if(!['unpaid','pending'].includes(String(original.payment_status||'').toLowerCase()))throw Error('Trạng thái thanh toán không thể xác nhận');
 const now=new Date().toISOString();
 const updated={...original,payment_status:'paid',payment_confirmed_at:now,payment_confirmed_by:actor.contactId};
 const before=getJSON(PAYMENT_HISTORY_KEY,[]),history=Array.isArray(before)?before:[];
 const entry={history_id:crypto.randomUUID(),order_id:original._id,action:'demo_payment_confirmed',payment_method:original.payment_method,from_status:original.payment_status,to_status:'paid',changed_by:actor.contactId,created_at:now};
 orders[index]=updated;
 if(!setJSON(ORDER_KEY,orders))throw Error('Không lưu được trạng thái thanh toán demo');
 if(!setJSON(PAYMENT_HISTORY_KEY,[...history,entry])){orders[index]=original;setJSON(ORDER_KEY,orders);throw Error('Không lưu được lịch sử thanh toán demo');}
 try{
  const loyalty=updated.order_status==='completed'?earnForCompletedOrder(updated):{earned:0};
  window.dispatchEvent(new CustomEvent('bobot:orders-updated',{detail:{orderId:original._id}}));
  return {success:true,order:updated,entry,loyalty};
 }catch(error){orders[index]=original;setJSON(ORDER_KEY,orders);setJSON(PAYMENT_HISTORY_KEY,history);throw error;}
}

export const paymentService={getPaymentHistory,confirmDemoPayment};
