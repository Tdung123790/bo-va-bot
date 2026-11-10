import {list,findById,queryCollection} from './jsonService.js';
import {paginate} from './jsonService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
// Adapter đọc JSON cho Phase 1; chuyển sang Supabase trong phase do người dùng chỉ định.
// MenuPage.tsx dùng tên này khi cả itemName và name của bản ghi Wix đều thiếu.
const normalizeProduct=product=>product&&({
  ...product,
  name:product.itemName?.trim()?product.itemName:product.name?.trim()?product.name:'Bánh Bơ & Bột',
});
const normalizePage=page=>({...page,items:page.items.map(normalizeProduct)});
const mapBackendProduct=row=>({id:row.source_id||row.id,backendId:row.id,sourceId:row.source_id,
 name:row.name,itemName:row.name,description:row.description||'',image:row.image_url||'',
 price:row.base_price,stockQuantity:row.stock_quantity,status:row.status,
 category:row.categories?.name||'',categoryId:row.categories?.source_id||row.category_id,
 isCustomizable:row.is_customizable,isBestSeller:row.is_best_seller,isFeatured:row.is_featured});
async function backendProducts(){
 const client=await getSupabaseClient();
 const {data,error}=await client.from('products').select('*,categories(name,source_id)').eq('status','active').order('created_at',{ascending:true}).limit(1000);
 if(error)throw backendError(error);
 return data.map(mapBackendProduct);
}
export async function getAll(includeRefs=[],pagination={}){return isSupabaseMode()?paginate(await backendProducts(),pagination):normalizePage(await list('products',includeRefs,pagination));}
export async function getById(id,includeRefs=[]){if(isSupabaseMode())return (await backendProducts()).find(row=>String(row.id)===String(id)||row.backendId===id)||null;return normalizeProduct(await findById('products',id));}
export async function query(filters={},pagination={}){if(isSupabaseMode()){let rows=await backendProducts();for(const [key,value] of Object.entries(filters)){if(value==null)continue;rows=rows.filter(row=>String(row[key]??'').toLowerCase()===String(value).toLowerCase());}return paginate(rows,pagination);}return normalizePage(await queryCollection('products',filters,pagination));}
export const productService={getAll,getById,query};
