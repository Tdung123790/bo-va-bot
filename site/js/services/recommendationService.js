import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';

export async function getRelatedProductIds(sourceId){
 if(!isSupabaseMode())throw Error('Gợi ý sản phẩm liên quan chỉ có trong chế độ Supabase.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId))return [];
 const client=await getSupabaseClient();
 const {data,error}=await client.functions.invoke('related-products',{body:{product_id:sourceId}});
 if(error)throw backendError(error);
 if(data?.source_id!==sourceId||data?.method!=='content_sim'||!Array.isArray(data.product_ids)||!data.product_ids.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))||new Set(data.product_ids).size!==data.product_ids.length||data.product_ids.includes(sourceId))throw Error('Kết quả gợi ý sản phẩm không hợp lệ.');
 return data.product_ids;
}
