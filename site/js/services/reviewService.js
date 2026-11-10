import {loadCollection,paginate} from './jsonService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';

async function publishedReviews(){
  const legacy=(await loadCollection('reviews'))
    .filter(row=>row.status==='published'&&row.id&&Number.isInteger(Number(row.rating))&&Number(row.rating)>=1&&Number(row.rating)<=5&&String(row.text||'').trim()&&!Number.isNaN(Date.parse(row.reviewDate)))
    .map(row=>({id:`legacy:${row.id}`,source_id:String(row.id),rating:Number(row.rating),content:row.text,image_url:row.image||null,created_at:row.reviewDate,status:'published',source:'legacy',legacyCustomerId:String(row.customerId||'')}));
  if(!isSupabaseMode())return legacy.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const client=await getSupabaseClient();
  const live=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await client.from('reviews')
      .select('id,source_id,product_id,rating,content,image_url,status,created_at')
      .eq('status','published').order('created_at',{ascending:false}).range(offset,offset+999);
    if(error)throw backendError(error);
    live.push(...(data||[]));
    if(!data||data.length<1000)break;
  }
  const seen=new Set(live.map(row=>String(row.source_id||'')).filter(Boolean));
  return [...live.map(row=>({...row,source:'supabase'})),...legacy.filter(row=>!seen.has(row.source_id))]
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
}

export async function getAll(includeRefs=[],pagination={}){return paginate(await publishedReviews(),pagination);}

export async function getById(id,includeRefs=[]){
  return (await publishedReviews()).find(row=>String(row.id)===String(id)||row.source==='legacy'&&String(row.source_id)===String(id))||null;
}

export async function query(filters={},pagination={}){
  let rows=await publishedReviews();
  for(const [key,value] of Object.entries(filters)){if(value==null)continue;rows=rows.filter(item=>String(item[key]??'')===String(value));}
  return paginate(rows,pagination);
}

export async function getMyReviews(){
  if(!isSupabaseMode())return [];
  const client=await getSupabaseClient();
  const {data,error}=await client.rpc('my_reviews');
  if(error)throw backendError(error);
  return Array.isArray(data)?data:[];
}

export async function getReviewableItems(){
  if(!isSupabaseMode())return [];
  const client=await getSupabaseClient();
  const {data,error}=await client.rpc('reviewable_items');
  if(error)throw backendError(error);
  return Array.isArray(data)?data:[];
}

export async function submitReview({orderItemId,rating,content}){
  if(!isSupabaseMode())throw Error('Đăng đánh giá mới yêu cầu Supabase.');
  const client=await getSupabaseClient();
  const {data,error}=await client.rpc('submit_review',{
    p_order_item:orderItemId,p_rating:Number(rating),p_content:String(content||'').trim(),p_image_url:null
  });
  if(error)throw backendError(error);
  return data;
}

export async function getModerationReviews(){
  if(!isSupabaseMode())throw Error('Quản lý đánh giá yêu cầu Supabase.');
  const client=await getSupabaseClient();
  const {data,error}=await client.from('reviews')
    .select('id,product_id,rating,content,status,created_at')
    .order('created_at',{ascending:false}).limit(300);
  if(error)throw backendError(error);
  return data||[];
}

export async function moderateReview(id,status,reason=null){
  if(!isSupabaseMode())throw Error('Quản lý đánh giá yêu cầu Supabase.');
  const client=await getSupabaseClient();
  const {data,error}=await client.rpc('admin_moderate_review_with_reason',{p_review:id,p_status:status,p_reason:reason});
  if(error)throw backendError(error);
  return data;
}

export const reviewService={getAll,getById,query,getMyReviews,getReviewableItems,submitReview,getModerationReviews,moderateReview};
