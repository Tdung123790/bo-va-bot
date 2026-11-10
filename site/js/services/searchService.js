import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';

export async function searchProducts(query,{limit=24}={}){
 if(!isSupabaseMode())throw Error('Tìm kiếm bằng mô hình cần kết nối Supabase.');
 const client=await getSupabaseClient();
 const {data,error}=await client.functions.invoke('product-search',{body:{query,limit}});
 if(error)throw backendError(error);
 if(data?.mode!=='model'||!Array.isArray(data.results)||!data.results.every(row=>typeof row.source_id==='string'&&Number.isFinite(row.score)&&row.score>=0&&row.score<=1))throw Error('Kết quả tìm kiếm từ mô hình không hợp lệ.');
 return data;
}
