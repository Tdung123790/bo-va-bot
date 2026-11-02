import {list,findById,queryCollection} from './jsonService.js';
export function getAll(includeRefs=[],pagination={}){return list('promotions',includeRefs,pagination);}
export function getById(id){return findById('promotions',id);}
export function query(filters={},pagination={}){return queryCollection('promotions',filters,pagination);}
export async function validateCoupon(code,subtotal=0,{today=new Date()}={}){
 const normalized=String(code||'').trim().toUpperCase();if(!normalized)return {isValid:false,discount:0,message:'Vui lòng nhập mã giảm giá'};
 const {items}=await getAll([],{limit:1000});const promo=items.find(p=>String(p.code||'').trim().toUpperCase()===normalized);
 if(!promo)return {isValid:false,discount:0,message:'Mã giảm giá không tồn tại'};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(today);
 if(promo.status==='inactive'||(promo.startDate&&day<promo.startDate.slice(0,10))||(promo.endDate&&day>promo.endDate.slice(0,10)))return {isValid:false,discount:0,message:'Mã chưa có hiệu lực hoặc đã hết hạn'};
 if(subtotal<Number(promo.minOrderValue||0))return {isValid:false,discount:0,message:'Đơn hàng chưa đủ giá trị tối thiểu'};
 const percent=Number.isFinite(Number(promo.discountPercent))?Number(promo.discountPercent):Number(String(promo.discountDetails||'').match(/\d+/)?.[0]||0);
 let discount= Math.round(subtotal*Math.max(0,percent)/100);if(promo.maxDiscount>0)discount=Math.min(discount,Number(promo.maxDiscount));discount=Math.min(subtotal,discount);
 return {isValid:true,discount,message:'Áp dụng mã giảm giá thành công',promotionId:promo.id,code:normalized};
}
export const promotionService={getAll,getById,query,validateCoupon};
