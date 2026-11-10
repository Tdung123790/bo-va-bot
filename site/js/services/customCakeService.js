import {getJSON,setJSON} from '../core/storage.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
import {getCurrentMember} from './authService.js';
export const CUSTOM_CAKES_KEY='bobot:v1:customCakes';let optionsPromise;
export function getCustomCakeStorageKey(){
 const id=getCurrentMember()?.id;
 return id?`bobot:v2:customCakes:user:${id}`:CUSTOM_CAKES_KEY;
}
export function copyGuestCakesToAccount(ids){
 if(!getCurrentMember()?.id)return;
 const source=getJSON(CUSTOM_CAKES_KEY,[]),key=getCustomCakeStorageKey();
 if(!Array.isArray(source)||!ids.length||key===CUSTOM_CAKES_KEY)return;
 const selected=source.filter(item=>ids.includes(item.id));
 if(!selected.length)return;
 const target=getJSON(key,[]),existing=Array.isArray(target)?target:[];
 const known=new Set(existing.map(item=>item.id));
 if(!setJSON(key,[...existing,...selected.filter(item=>!known.has(item.id))]))throw Error('Không thể lưu bản nháp bánh vào tài khoản.');
}
async function demoGetOptions(){if(!optionsPromise)optionsPromise=fetch('data/cake-options.json').then(r=>{if(!r.ok)throw Error('Không thể đọc tùy chọn bánh');return r.json();}).catch(e=>{optionsPromise=null;throw e;});return optionsPromise;}
export function getById(id){const a=getJSON(getCustomCakeStorageKey(),[]);return Array.isArray(a)?a.find(c=>c.id===id)||null:null;}
export async function calculatePrice(config){const o=await getOptions(),s=o.sizes.find(x=>x.id===config.sizeId),f=o.flavors.find(x=>x.id===config.flavorId),c=o.creams.find(x=>x.id===config.creamId);if(!s||!f||!c)throw Error('Tùy chọn bánh không hợp lệ');return Number(s.price)+Number(f.priceModifier||0)+Number(c.priceModifier||0);}
export async function createCake(config){const options=await getOptions();const check=(items,id)=>items.some(x=>x.id===id);if(!check(options.sizes,config.sizeId)||!check(options.flavors,config.flavorId)||!check(options.creams,config.creamId)||!check(options.fonts,config.fontId)||!check(options.textColors,config.colorId))throw Error('Lựa chọn thiết kế không hợp lệ');const text=String(config.text||'').trim();if(text.length>30)throw Error('Lời chúc dài quá 30 ký tự');const estimatedPrice=await calculatePrice(config),cake={id:crypto.randomUUID(),...config,text,estimatedPrice,createdAt:new Date().toISOString()};const key=getCustomCakeStorageKey();const a=getJSON(key,[]);const records=Array.isArray(a)?a:[];if(!setJSON(key,[...records,cake]))throw Error('Không thể lưu thiết kế');return cake;}
async function backendOptions(){
 const client=await getSupabaseClient();
 const [{data,error},{data:products,error:productError}]=await Promise.all([
  client.from('customization_options').select('id,source_key,name,base_price,price_modifier,display_order,customization_categories!inner(pricing_role,status)').eq('status','active').eq('customization_categories.status','active').order('display_order'),
  client.from('products').select('id,source_id').eq('status','active').eq('is_customizable',true).limit(2)
 ]);
 if(error||productError)throw backendError(error||productError);
 const roles={size:'sizes',flavor:'flavors',cream:'creams',font:'fonts',color:'textColors'};
 const result={sizes:[],flavors:[],creams:[],fonts:[],textColors:[],customProductId:products?.length===1?(products[0].source_id||products[0].id):null};
 for(const row of data){const bucket=roles[row.customization_categories.pricing_role];if(bucket)result[bucket].push({id:row.id,sourceKey:row.source_key,name:row.name,price:row.base_price,priceModifier:row.price_modifier,value:row.source_key});}
 if(!result.customProductId||Object.values(roles).some(bucket=>!result[bucket].length))throw Error('Tùy chọn bánh hoặc sản phẩm tùy chỉnh chưa được cấu hình trên backend.');
 return result;
}
export async function getOptions(){if(!isSupabaseMode())return demoGetOptions();if(!optionsPromise)optionsPromise=backendOptions().catch(error=>{optionsPromise=null;throw error;});return optionsPromise;}
export const customCakeService={getOptions,getById,calculatePrice,createCake};
