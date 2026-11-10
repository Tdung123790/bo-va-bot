import {getJSON,setJSON} from '../core/storage.js';
import {store} from '../core/store.js';
import {getById} from './productService.js';
import {getById as getCustomCakeById,calculatePrice as calculateCakePrice} from './customCakeService.js';
import {isSupabaseMode} from '../core/backend.js';
import {getCurrentMember,subscribe as subscribeAuth} from './authService.js';
import {copyGuestCakesToAccount} from './customCakeService.js';
export const CART_KEY='bobot:v1:guestCart';
const listeners=new Set();
export function getCartStorageKey(){
 const id=getCurrentMember()?.id;
 return id?`bobot:v2:cart:user:${id}`:CART_KEY;
}
export function getCart(){const value=getJSON(getCartStorageKey(),[]);return Array.isArray(value)?value:[];}
export function getCount(){return getCart().reduce((n,i)=>n+i.quantity,0);}
export function getTotal(){return getCart().reduce((n,i)=>n+i.quantity*i.unitPrice,0);}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function notify(items){store.set({cart:items,cartCount:items.reduce((n,i)=>n+i.quantity,0)});for(const fn of listeners)fn(items);window.dispatchEvent(new CustomEvent('bobot:cart-updated',{detail:{cart:items}}));return items;}
function publish(items){if(!setJSON(getCartStorageKey(),items))throw Error('Không thể lưu giỏ hàng');return notify(items);}
subscribeAuth(()=>notify(getCart()));
window.addEventListener('storage',event=>{if(event.key===getCartStorageKey())notify(getCart());});
export function claimGuestCart(){
 const member=getCurrentMember();
 if(!member||member.role!=='customer')throw Error('Chỉ tài khoản Customer mới có thể nhận giỏ khách.');
 const guest=getJSON(CART_KEY,[]);
 if(!Array.isArray(guest)||!guest.length)return 0;
 const target=getCart(),byKey=new Map(target.map(item=>[item.key,item]));
 for(const item of guest){
  if(!item?.key||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>99)continue;
  const existing=byKey.get(item.key);
  if(existing){existing.quantity=Math.min(99,existing.quantity+item.quantity);}
  else{const copy={...item};target.push(copy);byKey.set(copy.key,copy);}
 }
 const cakeIds=guest.map(item=>item.customCakeId).filter(Boolean);
 copyGuestCakesToAccount(cakeIds);
 if(!setJSON(getCartStorageKey(),target))throw Error('Không thể chuyển giỏ khách vào tài khoản.');
 if(!setJSON(CART_KEY,[]))throw Error('Đã lưu giỏ vào tài khoản nhưng không thể xóa giỏ khách.');
 notify(target);
 return guest.length;
}
export async function addToCart({collectionId='bakeryproducts',itemId,quantity=1,variantId=null,customCakeId=null,customizationData=null}={}){
 const sessionKey=getCartStorageKey();
 if(!itemId)throw Error('Thiếu mã sản phẩm');if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Số lượng phải từ 1 đến 99');
 const product=await getById(itemId);if(!product||product.status==='inactive')throw Error('Không tìm thấy sản phẩm');
 if(product.isCustomizable&&!customCakeId)throw Error('Vui lòng chọn cấu hình bánh tùy chỉnh');
 const customCake=product.isCustomizable?getCustomCakeById(customCakeId):null;
 if(product.isCustomizable&&!customCake)throw Error('Không tìm thấy cấu hình bánh tùy chỉnh');
 if(isSupabaseMode()&&!product.isCustomizable&&(!Number.isSafeInteger(Number(product.price))||Number(product.price)<=0))throw Error('Sản phẩm chưa có giá được xác nhận trên backend.');
 const unitPrice=customCake?await calculateCakePrice(customCake):product.price;
 if(sessionKey!==getCartStorageKey())throw Error('Phiên đăng nhập đã thay đổi, hãy thử lại.');
 const rows=getCart(),key=[itemId,variantId||'',customCakeId||''].join('|'),found=rows.find(i=>i.key===key),newQty=quantity+(found?.quantity||0);
 // Bánh thiết kế được làm theo đơn; bản ghi khuôn CMS có stockQuantity=0.
 const madeToOrder=Boolean(customCake);
 if(newQty>99||(!madeToOrder&&Number.isFinite(product.stockQuantity)&&product.stockQuantity>=0&&newQty>product.stockQuantity))throw Error('Số lượng vượt tồn kho');
 if(found){found.quantity=newQty;found.unitPrice=unitPrice;}else rows.push({key,productId:String(itemId),itemId:String(itemId),collectionId,variantId,customCakeId,quantity,unitPrice,productNameSnapshot:product.name,image:product.image,customizationData});
 return publish(rows);
}
export function updateQuantity(keyOrItem,quantity){const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;if(!Number.isSafeInteger(quantity)||quantity<0||quantity>99)throw Error('Số lượng không hợp lệ');const rows=getCart();const found=rows.find(i=>i.key===key);if(!found)throw Error('Không tìm thấy dòng hàng');if(quantity===0)return removeFromCart(key);found.quantity=quantity;return publish(rows);}
export function removeFromCart(keyOrItem){const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;return publish(getCart().filter(i=>i.key!==key));}
export function clearCart(){return publish([]);}
export function openCart(){store.set('cartOpen',true);window.dispatchEvent(new Event('bobot:cart-open'));}
export function closeCart(){store.set('cartOpen',false);window.dispatchEvent(new Event('bobot:cart-close'));}
export function toggleCart(){store.get('cartOpen')?closeCart():openCart();}
export const cartService={getCart,getCount,getTotal,getCartStorageKey,claimGuestCart,subscribe,addToCart,updateQuantity,removeFromCart,clearCart,openCart,closeCart,toggleCart};
