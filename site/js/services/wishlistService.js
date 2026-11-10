import {getJSON,setJSON} from '../core/storage.js';
import {getCurrentMember} from './authService.js';import {getAll as getProducts} from './productService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
export const WISHLIST_KEY='bobot:v1:wishlist';
function owner(){const id=getCurrentMember()?.contactId;if(!id)throw Error('UNAUTHORIZED');return id;}
function demoIds(){const id=owner();const data=getJSON(WISHLIST_KEY,{});return Array.isArray(data?.[id])?[...new Set(data[id].map(String))]:[];}
async function demoList(){const selected=new Set(ids());const res=await getProducts([], {limit:1000});return {success:true,items:(res.items||[]).filter(p=>selected.has(String(p.id||p._id))),ids:[...selected]};}
async function demoToggle(productId){const id=owner(),key=String(productId||'');if(!key)throw Error('MISSING_PRODUCT_ID');const data=getJSON(WISHLIST_KEY,{})||{};const values=new Set(Array.isArray(data[id])?data[id]:[]);const favorited=!values.has(key);favorited?values.add(key):values.delete(key);data[id]=[...values];if(!setJSON(WISHLIST_KEY,data))throw Error('Không lưu được danh sách yêu thích');window.dispatchEvent(new CustomEvent('bobot:wishlist-updated',{detail:{ids:data[id]}}));return {success:true,isFavorited:favorited,ids:data[id]};}
export const wishlistService={toggle,list,ids};
let cachedIds=[];
async function loadBackendWishlist(notify=true){
 const id=getCurrentMember()?.contactId;
 if(!id){cachedIds=[];if(notify)window.dispatchEvent(new Event('bobot:wishlist-updated'));return;}
 const client=await getSupabaseClient();
 const {data,error}=await client.from('wishlist_items').select('product_id,products(source_id)').eq('customer_id',id);
 if(error)throw backendError(error);
 cachedIds=data.map(row=>row.products?.source_id||row.product_id);
 if(notify)window.dispatchEvent(new Event('bobot:wishlist-updated'));
}
if(isSupabaseMode()){
 window.addEventListener('bobot:auth-change',()=>loadBackendWishlist().catch(console.error));
 queueMicrotask(()=>loadBackendWishlist().catch(console.error));
}
export function ids(){return isSupabaseMode()?[...cachedIds]:demoIds();}
export async function list(){if(!isSupabaseMode())return demoList();await loadBackendWishlist(false);const selected=new Set(cachedIds);const res=await getProducts([],{limit:1000});return {success:true,items:res.items.filter(product=>selected.has(product.id)),ids:[...selected]};}
export async function toggle(productId){
 if(!isSupabaseMode())return demoToggle(productId);
 const customerId=owner(),key=String(productId||'');
 await loadBackendWishlist(false);
 const products=await getProducts([],{limit:1000});
 const product=products.items.find(row=>row.id===key||row.backendId===key);
 if(!product)throw Error('Sản phẩm chưa có mapping trên backend.');
 const client=await getSupabaseClient(),favorited=!cachedIds.includes(product.id);
 const result=favorited?await client.from('wishlist_items').insert({customer_id:customerId,product_id:product.backendId}):await client.from('wishlist_items').delete().eq('customer_id',customerId).eq('product_id',product.backendId);
 if(result.error)throw backendError(result.error);
 await loadBackendWishlist();return {success:true,isFavorited:favorited,ids:[...cachedIds]};
}
