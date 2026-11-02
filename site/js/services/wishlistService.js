import {getJSON,setJSON} from '../core/storage.js';
import {getCurrentMember} from './authService.js';import {getAll as getProducts} from './productService.js';
export const WISHLIST_KEY='bobot:v1:wishlist';
function owner(){const id=getCurrentMember()?.contactId;if(!id)throw Error('UNAUTHORIZED');return id;}
export function ids(){const id=owner();const data=getJSON(WISHLIST_KEY,{});return Array.isArray(data?.[id])?[...new Set(data[id].map(String))]:[];}
export async function list(){const selected=new Set(ids());const res=await getProducts([], {limit:1000});return {success:true,items:(res.items||[]).filter(p=>selected.has(String(p.id||p._id))),ids:[...selected]};}
export async function toggle(productId){const id=owner(),key=String(productId||'');if(!key)throw Error('MISSING_PRODUCT_ID');const data=getJSON(WISHLIST_KEY,{})||{};const values=new Set(Array.isArray(data[id])?data[id]:[]);const favorited=!values.has(key);favorited?values.add(key):values.delete(key);data[id]=[...values];if(!setJSON(WISHLIST_KEY,data))throw Error('Không lưu được danh sách yêu thích');window.dispatchEvent(new CustomEvent('bobot:wishlist-updated',{detail:{ids:data[id]}}));return {success:true,isFavorited:favorited,ids:data[id]};}
export const wishlistService={toggle,list,ids};
