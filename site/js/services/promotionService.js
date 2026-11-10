import {loadCollection,paginate} from './jsonService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';

function hcmDate(now){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function identifiers(value){
  if(!Array.isArray(value))return [];
  return value.map(item=>String(typeof item==='object'?(item?.id??item?._id??''):item)).filter(Boolean);
}

function eligibleSubtotal(promotion,lines){
  const target=String(promotion.targetType||'').toUpperCase();
  if(target==='ALL')return lines.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  const ids=identifiers(promotion.targetProductIds||promotion.productIds||promotion.targetIds);
  const categories=identifiers(promotion.targetCategoryIds||promotion.categoryIds);
  if(target==='PRODUCT'&&ids.length)return lines.filter(line=>ids.includes(String(line.productId))).reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  if(target==='CATEGORY'&&categories.length)return lines.filter(line=>categories.includes(String(line.categoryId))).reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  return 0; // CMS không có quan hệ đích: không suy ra áp dụng toàn bộ đơn.
}

export function selectAutomaticPromotion(lines,promotions,{today=new Date()}={}){
  const day=hcmDate(today);
  const subtotal=lines.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  let best={discount:0,promotionId:null,promotion:null};
  for(const promotion of promotions){
    if(promotion.status!=='active'||!promotion.id)continue;
    if((promotion.startDate&&day<promotion.startDate.slice(0,10))||(promotion.endDate&&day>promotion.endDate.slice(0,10)))continue;
    if(subtotal<Number(promotion.minOrderValue||0))continue;
    const eligible=eligibleSubtotal(promotion,lines);
    if(eligible<=0)continue;
    const percent=Number(promotion.discountPercent);
    const fixed=Number(promotion.discountValue);
    const type=String(promotion.discountType||'').toLowerCase();
    let discount=0;
    if(type==='fixed'||type==='amount'){
      if(Number.isSafeInteger(fixed)&&fixed>0)discount=fixed;
    }else if(type==='percent'||type==='percentage'){
      if(Number.isFinite(percent)&&percent>0&&percent<=100)discount=Math.round(eligible*percent/100);
    }else if(Number.isFinite(percent)&&percent>0&&percent<=100){
      discount=Math.round(eligible*percent/100); // CMS cũ ghi cùng con số vào discountPercent và discountValue.
    }else if(Number.isSafeInteger(fixed)&&fixed>0){
      discount=fixed;
    }
    if(Number(promotion.maxDiscount)>0)discount=Math.min(discount,Number(promotion.maxDiscount));
    discount=Math.min(eligible,subtotal,Math.max(0,Math.round(discount)));
    if(discount>best.discount||(discount===best.discount&&discount>0&&String(promotion.id)<String(best.promotionId))){
      best={discount,promotionId:promotion.id,promotion};
    }
  }
  return best;
}

export async function getAutomaticPromotion(lines,options={}){
  const promotions=options.promotions||(await getAll([],{limit:1000})).items;
  return selectAutomaticPromotion(lines,promotions,options);
}

// Giữ export cũ để mã tích hợp lịch sử không vỡ, nhưng không chấp nhận voucher mới.
export async function validateCoupon(){return {isValid:false,discount:0,message:'Khuyến mãi được áp dụng tự động; không sử dụng mã voucher.'};}

export const promotionService={getAll,getById,query,getAutomaticPromotion,selectAutomaticPromotion,validateCoupon};
async function backendPromotions(){
 const client=await getSupabaseClient();
 const {data,error}=await client.from('promotions').select('*').eq('status','active').order('starts_at',{ascending:false}).limit(1000);
 if(error)throw backendError(error);
 return data.map(row=>({...row,id:row.source_id||row.id,backendId:row.id,title:row.name,startDate:row.starts_at,endDate:row.ends_at,
  discountType:row.discount_type,discountValue:row.discount_value,discountPercent:row.discount_type==='PERCENT'?row.discount_value:null,
  minOrderValue:row.min_order_value,maxDiscount:row.max_discount,targetType:row.target_type}));
}
async function publicPromotions(){
 const archive=(await loadCollection('promotions')).filter(row=>row.id&&row.title?.trim()&&row.description?.trim());
 const backend=isSupabaseMode()?await backendPromotions():[];
 const backendBySource=new Map(backend.map(row=>[String(row.id),row]));
 const day=hcmDate(new Date());
 const rows=archive.map(row=>{
  const live=backendBySource.get(String(row.id));
  backendBySource.delete(String(row.id));
  const start=String(live?.startDate||row.startDate||'').slice(0,10);
  const end=String(live?.endDate||row.endDate||'').slice(0,10);
  const availability=end&&day>end?'ended':start&&day<start?'upcoming':live&&live.status==='active'?'active':'unavailable';
  return {...row,...live,id:row.id,title:live?.title||row.title,description:live?.description||row.description,bannerImage:row.bannerImage,discountDetails:row.discountDetails,startDate:start,endDate:end,availability,status:availability==='active'?'active':'inactive',source:live?'supabase':'archive'};
 });
 for(const row of backendBySource.values()){
  const start=String(row.startDate||'').slice(0,10);
  const end=String(row.endDate||'').slice(0,10);
  const availability=end&&day>end?'ended':start&&day<start?'upcoming':'active';
  rows.push({...row,startDate:start,endDate:end,availability,status:availability==='active'?'active':'inactive',source:'supabase'});
 }
 return rows.sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
}
export async function getAll(includeRefs=[],pagination={}){return paginate(await publicPromotions(),pagination);}
export async function getById(id){return (await publicPromotions()).find(row=>String(row.id)===String(id)||String(row.backendId||'')===String(id))||null;}
export async function query(filters={},pagination={}){let rows=await publicPromotions();for(const [key,value] of Object.entries(filters)){if(value==null)continue;rows=rows.filter(row=>String(row[key]??'')===String(value));}return paginate(rows,pagination);}
