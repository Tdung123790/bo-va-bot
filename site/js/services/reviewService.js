import {list,findById,queryCollection} from './jsonService.js';
// Adapter đọc JSON cho Phase 1; chuyển sang Supabase trong phase do người dùng chỉ định.
export function getAll(includeRefs=[],pagination={}){return list('reviews',includeRefs,pagination);}
export function getById(id,includeRefs=[]){return findById('reviews',id);}
export function query(filters={},pagination={}){return queryCollection('reviews',filters,pagination);}
export const reviewService={getAll,getById,query};
