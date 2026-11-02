import {getJSON,setJSON} from '../core/storage.js';
import {store} from '../core/store.js';
import {getById} from './productService.js';
export const CART_KEY='bobot:v1:guestCart';
const listeners=new Set();
export function getCart(){const value=getJSON(CART_KEY,[]);return Array.isArray(value)?value:[];}
export function getCount(){return getCart().reduce((n,i)=>n+i.quantity,0);}
export function getTotal(){return getCart().reduce((n,i)=>n+i.quantity*i.unitPrice,0);}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function publish(items){if(!setJSON(CART_KEY,items))throw Error('Không thể lưu giỏ hàng');store.set({cart:items,cartCount:items.reduce((n,i)=>n+i.quantity,0)});for(const fn of listeners)fn(items);window.dispatchEvent(new CustomEvent('bobot:cart-updated',{detail:{cart:items}}));return items;}
export async function addToCart({collectionId='bakeryproducts',itemId,quantity=1,variantId=null,customCakeId=null,customizationData=null}={}){
 if(!itemId)throw Error('Thiếu mã sản phẩm');if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Số lượng phải từ 1 đến 99');
 const product=await getById(itemId);if(!product||product.status==='inactive')throw Error('Không tìm thấy sản phẩm');
 if(product.isCustomizable&&!customCakeId)throw Error('Vui lòng chọn cấu hình bánh tùy chỉnh');
 const rows=getCart(),key=[itemId,variantId||'',customCakeId||''].join('|'),found=rows.find(i=>i.key===key),newQty=quantity+(found?.quantity||0);
 if(newQty>99||(Number.isFinite(product.stockQuantity)&&product.stockQuantity>=0&&newQty>product.stockQuantity))throw Error('Số lượng vượt tồn kho');
 if(found)found.quantity=newQty;else rows.push({key,productId:String(itemId),itemId:String(itemId),collectionId,variantId,customCakeId,quantity,unitPrice:product.price,productNameSnapshot:product.name,image:product.image,customizationData});
 return publish(rows);
}
export function updateQuantity(keyOrItem,quantity){const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;if(!Number.isSafeInteger(quantity)||quantity<0||quantity>99)throw Error('Số lượng không hợp lệ');const rows=getCart();const found=rows.find(i=>i.key===key);if(!found)throw Error('Không tìm thấy dòng hàng');if(quantity===0)return removeFromCart(key);found.quantity=quantity;return publish(rows);}
export function removeFromCart(keyOrItem){const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;return publish(getCart().filter(i=>i.key!==key));}
export function clearCart(){return publish([]);}
export function openCart(){store.set('cartOpen',true);window.dispatchEvent(new Event('bobot:cart-open'));}
export function closeCart(){store.set('cartOpen',false);window.dispatchEvent(new Event('bobot:cart-close'));}
export function toggleCart(){store.get('cartOpen')?closeCart():openCart();}
export const cartService={getCart,getCount,getTotal,subscribe,addToCart,updateQuantity,removeFromCart,clearCart,openCart,closeCart,toggleCart};
