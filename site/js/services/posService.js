import {getCurrentMember} from './authService.js';
import {getSupabaseClient,isSupabaseMode,backendError} from '../core/backend.js';

function requireOperator(){
 const user=getCurrentMember();
 if(!isSupabaseMode()||!['staff','admin'].includes(user?.role)||user?.status==='blocked')throw Error('Chỉ Staff hoặc Admin đang hoạt động được sử dụng POS Supabase.');
 return user;
}

export async function getPosCatalog(){
 requireOperator();
 const client=await getSupabaseClient();
 const {data,error}=await client.from('products').select('id,source_id,name,base_price,stock_quantity,status,is_customizable,image_url,categories(name)').eq('status','active').order('name').limit(1000);
 if(error)throw backendError(error);
 return data||[];
}

export async function quotePosSale(items){
 requireOperator();
 if(!Array.isArray(items)||!items.length)throw Error('Giỏ POS trống.');
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('quote_order',{p_request:{items,fulfillment_type:'counter',points_used:0}});
 if(error)throw backendError(error);
 return data;
}

export async function recordPosSale(request){
 requireOperator();
 if(!request?.request_id||!Array.isArray(request.items)||!request.items.length)throw Error('Yêu cầu POS không hợp lệ.');
 const client=await getSupabaseClient();
 const payload={items:request.items,fulfillment_type:'counter',payment_method:'cash_demo',points_used:0,request_id:request.request_id};
 const {data,error}=await client.rpc('record_pos_sale',{p_request:payload});
 if(error)throw backendError(error);
 const {data:order,error:readError}=await client.from('orders').select('id,order_code,total_amount,sales_channel,fulfillment_type,order_status,payment_status,payments(kind,payment_method,status)').eq('id',data.order_id).single();
 if(readError)throw backendError(readError);
 return {...data,order};
}

export async function completePosSale(orderId){
 requireOperator();
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('complete_pos_sale',{p_order:orderId,p_cash_collected:true,p_handover:true});
 if(error)throw backendError(error);
 return data;
}
