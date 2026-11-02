import {list,findById,queryCollection} from './jsonService.js';
// Adapter đọc JSON cho Phase 1; chuyển sang Supabase trong phase do người dùng chỉ định.
export function getAll(includeRefs=[],pagination={}){return list('products',includeRefs,pagination);}
export function getById(id,includeRefs=[]){return findById('products',id);}
export function query(filters={},pagination={}){return queryCollection('products',filters,pagination);}
export const productService={getAll,getById,query};
