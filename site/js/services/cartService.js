import {getJSON,setJSON,removeKey} from '../core/storage.js';
import {store} from '../core/store.js';
import {getById} from './productService.js';
import {getById as getCustomCakeById,calculatePrice as calculateCakePrice,copyGuestCakesToAccount,hydrateAccountCakes,CUSTOM_CAKES_KEY} from './customCakeService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
import {getCurrentMember,subscribe as subscribeAuth} from './authService.js';

export const CART_KEY='bobot:v1:guestCart';
const listeners=new Set();
let loadedOwner=null;
let loading=null;
let queue=Promise.resolve();
let channel=null;
let channelOwner=null;
let previousOwner=getCurrentMember()?.id||null;
const currentOwner=()=>getCurrentMember()?.role==='customer'?getCurrentMember()?.id:null;
const cacheKey=id=>`bobot:v3:cart:cache:user:${id}`;
const legacyKey=id=>`bobot:v2:cart:user:${id}`;
const isCloudCustomer=()=>isSupabaseMode()&&Boolean(currentOwner());

export function getCartStorageKey(){
 const id=currentOwner();
 return id?(isSupabaseMode()?cacheKey(id):legacyKey(id)):CART_KEY;
}
export function getCart(){
 const value=getJSON(getCartStorageKey(),[]);
 return Array.isArray(value)?value:[];
}
export function getCount(){return getCart().reduce((n,i)=>n+Number(i.quantity||0),0);}
export function getTotal(){return getCart().reduce((n,i)=>n+Number(i.quantity||0)*Number(i.unitPrice||0),0);}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function notify(items){
 store.set({cart:items,cartCount:items.reduce((n,i)=>n+Number(i.quantity||0),0)});
 for(const fn of listeners)fn(items);
 window.dispatchEvent(new CustomEvent('bobot:cart-updated',{detail:{cart:items}}));
 return items;
}
function publish(items){
 if(!setJSON(getCartStorageKey(),items))throw Error('Không thể lưu giỏ hàng');
 return notify(items);
}
function fail(error){
 const reason=backendError(error);
 window.dispatchEvent(new CustomEvent('bobot:cart-sync-error',{detail:{message:reason.message}}));
 return reason;
}
function serial(task){
 const result=queue.catch(()=>{}).then(task);
 queue=result.catch(()=>{});
 return result;
}
async function fetchRemote(owner){
 const client=await getSupabaseClient();
 const {data,error}=await client.from('customer_carts').select('items,version').eq('customer_id',owner).maybeSingle();
 if(error)throw backendError(error);
 const items=Array.isArray(data?.items)?data.items:[];
 if(currentOwner()===owner){
  hydrateAccountCakes(items,owner);
  loadedOwner=owner;
  publish(items);
 }
 return items;
}
export async function ensureCartReady(){
 const owner=currentOwner();
 if(!isSupabaseMode()||!owner)return getCart();
 if(loadedOwner===owner)return getCart();
 if(loading?.owner===owner)return loading.promise;
 const promise=fetchRemote(owner).catch(error=>{throw fail(error);}).finally(()=>{if(loading?.promise===promise)loading=null;});
 loading={owner,promise};
 return promise;
}
export async function refreshCart(){
 const owner=currentOwner();
 if(!isSupabaseMode()||!owner)return getCart();
 return serial(async()=>{
  if(currentOwner()!==owner)return getCart();
  try{return await fetchRemote(owner);}catch(error){throw fail(error);}
 });
}
async function rpcMutation(owner,action,params={}){
 if(currentOwner()!==owner)throw Error('Phiên đăng nhập đã thay đổi, vui lòng thử lại.');
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('customer_cart_mutate',{p_action:action,...params});
 if(error)throw backendError(error);
 if(!Array.isArray(data?.items))throw Error('Backend trả giỏ hàng không hợp lệ.');
 if(currentOwner()===owner){
  hydrateAccountCakes(data.items,owner);
  loadedOwner=owner;
  publish(data.items);
 }
 return data.items;
}
function mutate(action,params={}){
 const owner=currentOwner();
 if(!isSupabaseMode()||!owner)throw Error('Giỏ hàng Cloud chỉ dành cho Customer đã đăng nhập.');
 return serial(async()=>{
  await ensureCartReady();
  if(currentOwner()!==owner)throw Error('Phiên đăng nhập đã thay đổi, vui lòng thử lại.');
  try{return await rpcMutation(owner,action,params);}catch(error){throw fail(error);}
 });
}
function changeLocal(action,key,quantity){
 const rows=getCart();
 if(action==='clear')return publish([]);
 const found=rows.find(item=>item.key===key);
 if(action==='remove')return publish(rows.filter(item=>item.key!==key));
 if(!found)throw Error('Không tìm thấy dòng hàng');
 found.quantity=quantity;
 return publish(rows);
}
async function attachRealtime(owner){
 const client=await getSupabaseClient();
 if(channelOwner===owner)return;
 if(channel){await client.removeChannel(channel);channel=null;channelOwner=null;}
 if(!owner)return;
 channelOwner=owner;
 channel=client.channel('bobot-cart-'+owner).on('postgres_changes',{
  event:'*',schema:'public',table:'customer_carts',filter:'customer_id=eq.'+owner
 },()=>{if(currentOwner()===owner)refreshCart().catch(console.error);}).subscribe();
}
subscribeAuth(member=>{
 const next=member?.role==='customer'?member.id:null;
 if(previousOwner&&!next){
  setJSON(CART_KEY,[]);
  removeKey(CUSTOM_CAKES_KEY);
 }
 if(next!==previousOwner){loadedOwner=null;loading=null;}
 previousOwner=next;
 notify(getCart());
 if(isSupabaseMode()){
  attachRealtime(next).catch(error=>console.warn('Cart realtime:',error));
  if(next)ensureCartReady().catch(console.error);
 }
});
window.addEventListener('storage',event=>{
 if(event.key===getCartStorageKey())notify(getCart());
});
window.addEventListener('focus',()=>{if(isCloudCustomer())refreshCart().catch(console.error);});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&isCloudCustomer())refreshCart().catch(console.error);
});
setInterval(()=>{if(!document.hidden&&isCloudCustomer())refreshCart().catch(console.error);},30000);
if(isCloudCustomer()){
 attachRealtime(currentOwner()).catch(console.error);
 ensureCartReady().catch(console.error);
}
export function hasLegacyAccountCart(){
 const owner=currentOwner();
 if(!owner||!isSupabaseMode())return false;
 const legacy=getJSON(legacyKey(owner),[]);
 return Array.isArray(legacy)&&legacy.length>0;
}
export async function claimLegacyAccountCart(){
 const owner=currentOwner();
 if(!owner||!isSupabaseMode())return 0;
 const legacy=getJSON(legacyKey(owner),[]);
 if(!Array.isArray(legacy)||!legacy.length)return 0;
 const items=legacy.map(item=>{
  const cake=item.customCakeId?getCustomCakeById(item.customCakeId):null;
  return cake?{...item,customCakeData:cake}:item;
 });
 await mutate('import',{p_items:items});
 removeKey(legacyKey(owner));
 return items.length;
}
export async function claimGuestCart(){
 const member=getCurrentMember();
 if(!member||member.role!=='customer')throw Error('Chỉ tài khoản Customer mới có thể nhận giỏ khách.');
 const guest=getJSON(CART_KEY,[]);
 if(!Array.isArray(guest)||!guest.length)return 0;
 const cakeRows=getJSON(CUSTOM_CAKES_KEY,[]);
 const cakes=Array.isArray(cakeRows)?cakeRows:[];
 const items=guest.map(item=>{
  const cake=item.customCakeId?cakes.find(value=>value.id===item.customCakeId):null;
  return cake?{...item,customCakeData:cake}:item;
 });
 if(isCloudCustomer()){
  await mutate('import',{p_items:items});
 }else{
  const target=getCart(),byKey=new Map(target.map(item=>[item.key,item]));
  for(const item of items){
   if(!item?.key||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>99)continue;
   const found=byKey.get(item.key);
   if(found)found.quantity=Math.min(99,found.quantity+item.quantity);
   else{target.push({...item});byKey.set(item.key,target[target.length-1]);}
  }
  publish(target);
 }
 copyGuestCakesToAccount(guest.map(item=>item.customCakeId).filter(Boolean));
 if(!setJSON(CART_KEY,[]))throw Error('Đã lưu giỏ nhưng không thể xóa giỏ Guest.');
 notify(getCart());
 return guest.length;
}
export async function addToCart({collectionId='bakeryproducts',itemId,quantity=1,variantId=null,customCakeId=null,customizationData=null}={}){
 const owner=currentOwner(),sessionKey=getCartStorageKey();
 if(!itemId)throw Error('Thiếu mã sản phẩm');
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Số lượng phải từ 1 đến 99');
 if(owner&&isSupabaseMode())await ensureCartReady();
 const product=await getById(itemId);
 if(!product||product.status==='inactive')throw Error('Không tìm thấy sản phẩm');
 if(product.isCustomizable&&!customCakeId)throw Error('Vui lòng chọn cấu hình bánh tùy chỉnh');
 const customCake=product.isCustomizable?getCustomCakeById(customCakeId):null;
 if(product.isCustomizable&&!customCake)throw Error('Không tìm thấy cấu hình bánh tùy chỉnh');
 if(isSupabaseMode()&&!product.isCustomizable&&(!Number.isSafeInteger(Number(product.price))||Number(product.price)<=0))throw Error('Sản phẩm chưa có giá được xác nhận trên backend.');
 const unitPrice=customCake?await calculateCakePrice(customCake):product.price;
 if(owner!==currentOwner()||sessionKey!==getCartStorageKey())throw Error('Phiên đăng nhập đã thay đổi, hãy thử lại.');
 const key=[itemId,variantId||'',customCakeId||''].join('|');
 const row={key,productId:String(itemId),itemId:String(itemId),collectionId,variantId,customCakeId,quantity,unitPrice,productNameSnapshot:product.name,image:product.image,customizationData,customCakeData:customCake||null};
 if(isCloudCustomer()){
  const prior=getCart().find(item=>item.key===key);
  if(!customCake&&Number.isFinite(product.stockQuantity)&&product.stockQuantity>=0&&quantity+(prior?.quantity||0)>product.stockQuantity)throw Error('Số lượng vượt tồn kho');
  return mutate('add',{p_item:row});
 }
 const rows=getCart(),found=rows.find(item=>item.key===key),newQty=quantity+(found?.quantity||0);
 if(newQty>99||(!customCake&&Number.isFinite(product.stockQuantity)&&product.stockQuantity>=0&&newQty>product.stockQuantity))throw Error('Số lượng vượt tồn kho');
 if(found){found.quantity=newQty;found.unitPrice=unitPrice;}else rows.push(row);
 return publish(rows);
}
export async function updateQuantity(keyOrItem,quantity){
 const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>99)throw Error('Số lượng không hợp lệ');
 if(quantity===0)return removeFromCart(key);
 if(isCloudCustomer())return mutate('set',{p_key:key,p_quantity:quantity});
 return changeLocal('set',key,quantity);
}
export async function removeFromCart(keyOrItem){
 const key=typeof keyOrItem==='string'?keyOrItem:keyOrItem?.key;
 if(isCloudCustomer())return mutate('remove',{p_key:key});
 return changeLocal('remove',key);
}
export async function clearCart(){
 if(isCloudCustomer())return mutate('clear');
 return changeLocal('clear');
}
export function openCart(){store.set('cartOpen',true);window.dispatchEvent(new Event('bobot:cart-open'));}
export function closeCart(){store.set('cartOpen',false);window.dispatchEvent(new Event('bobot:cart-close'));}
export function toggleCart(){store.get('cartOpen')?closeCart():openCart();}
export const cartService={getCart,getCount,getTotal,getCartStorageKey,ensureCartReady,refreshCart,claimGuestCart,claimLegacyAccountCart,hasLegacyAccountCart,subscribe,addToCart,updateQuantity,removeFromCart,clearCart,openCart,closeCart,toggleCart};
