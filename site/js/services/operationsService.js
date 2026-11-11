import {getCurrentMember} from './authService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';

function requireOperator(){
 const member=getCurrentMember();
 if(!isSupabaseMode()||!['staff','admin'].includes(member?.role)||member?.status==='blocked')throw Error('Chỉ Staff hoặc Admin đang hoạt động được xử lý đơn.');
 return member;
}

export async function getOperationalOrders(){
 requireOperator();
 const client=await getSupabaseClient();
 const {data,error}=await client.from('orders').select('id,order_code,customer_id,sales_channel,fulfillment_type,order_status,payment_status,cancel_request_id,cancel_request_status,cancel_request_reason,cancel_requested_at,cancel_resolution_note,total_amount,ship_recipient,ship_phone,requested_at,created_at,notes,delivery_failed_at,delivery_failure_reason,order_items(line_no,product_name_snapshot,unit_price,quantity,subtotal,customization_data),order_status_history(from_status,to_status,actor_type,note,created_at),payments(id,kind,payment_method,status,amount,created_at,paid_at,refund_approved_at,refund_reason,transaction_code)').order('created_at',{ascending:false}).limit(200);
 if(error)throw backendError(error);
 return data||[];
}

async function change(name,args){
 requireOperator();
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc(name,args);
 if(error)throw backendError(error);
 return data;
}

export const transitionOperationalOrder=(orderId,status,note)=>change('transition_order',{p_order:orderId,p_next:status,p_handover:status==='completed',p_note:note||null});
export const cancelOperationalOrder=(orderId,reason)=>change('cancel_order',{p_order:orderId,p_reason:reason});
export const confirmOperationalPayment=orderId=>change('confirm_demo_payment',{p_order:orderId,p_money_received:true});
export const completePosSale=orderId=>change('complete_pos_sale',{p_order:orderId,p_cash_collected:true,p_handover:true});
export const recordDeliveryFailure=(orderId,reason)=>change('record_delivery_failure',{p_order:orderId,p_reason:reason});
export const requestDemoRefund=(orderId,requestId,reason)=>change('request_demo_refund',{p_order:orderId,p_request_id:requestId,p_reason:reason});
export const approveDemoRefund=refundId=>change('approve_demo_refund',{p_refund:refundId});
export const executeDemoRefund=(refundId,reference)=>change('execute_demo_refund',{p_refund:refundId,p_reference:reference});
export const resolveCancellationRequest=(requestId,approve,note,restockEligible=false)=>change('resolve_order_cancel_request',{p_request:requestId,p_approve:approve,p_note:note,p_restock_eligible:restockEligible});
