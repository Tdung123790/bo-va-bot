import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
import {getCurrentMember} from './authService.js';
import {getModerationReviews,moderateReview} from './reviewService.js';

async function clientForAdmin(){
  if(!isSupabaseMode())throw Error('Quản trị yêu cầu Supabase.');
  if(getCurrentMember()?.role!=='admin')throw Error('Chỉ Admin được quản trị.');
  return getSupabaseClient();
}

async function read(client,table,columns,order='created_at'){
  const {data,error}=await client.from(table).select(columns).order(order,{ascending:false}).limit(1000);
  if(error)throw backendError(error);
  return data||[];
}

async function rpc(name,args){
  const client=await clientForAdmin();
  const {data,error}=await client.rpc(name,args);
  if(error)throw backendError(error);
  return data;
}

export async function loadManagementData(){
  const client=await clientForAdmin();
  const [products,categories,promotions,profiles,reviews]=await Promise.all([
    read(client,'products','id,name,description,image_url,base_price,stock_quantity,status,is_featured,is_best_seller,is_customizable,category_id'),
    read(client,'categories','id,name,status','name'),
    read(client,'promotions','id,source_id,name,description,discount_type,discount_value,target_type,target_product_id,target_category_id,min_order_value,max_discount,starts_at,ends_at,usage_limit,usage_per_customer,used_count,status'),
    read(client,'profiles','id,full_name,role,status,created_at'),
    getModerationReviews()
  ]);
  return {products,categories,promotions,profiles,reviews};
}

export const updateProduct=params=>rpc('admin_update_product_checked',params);
export const createPromotion=params=>rpc('admin_create_promotion',params);
export const activateFinalPromotion=()=>rpc('admin_activate_final_20261112',{});
export const updatePromotion=params=>rpc('admin_set_promotion',params);
export const assignRole=params=>rpc('admin_assign_role',params);
export const updateReview=(id,status,reason)=>moderateReview(id,status,reason);
