import * as cart from '../services/cartService.js';
import {calculateOrder} from '../services/orderService.js';
import {getCurrentMember} from '../services/authService.js';
import {loginUrl} from '../core/guard.js';
import {formatVND} from '../core/format.js';
import {escapeHtml} from '../core/dom.js';
import {toast} from '../core/toast.js';
import {initCheckoutForm} from './checkout-form.js';
import {isSupabaseMode} from '../core/backend.js';
import {getById as getCustomCakeById,getOptions} from '../services/customCakeService.js';

let initialized=false;
export async function initCartDrawer(){
 if(initialized)return;initialized=true;
 let dialog=document.querySelector('#cart-drawer');
 if(!dialog){const mount=document.createElement('div');document.body.append(mount);const response=await fetch('partials/cart-drawer.html');if(!response.ok)throw Error('Không tải được giỏ hàng');mount.innerHTML=await response.text();dialog=mount.querySelector('dialog');}
 const area=dialog.querySelector('#cart-drawer-items'),total=dialog.querySelector('#cart-drawer-total');
 const discount=dialog.querySelector('#cart-drawer-discount'),checkout=dialog.querySelector('#cart-checkout');
 let renderVersion=0,opening=false;
 async function render(){
  const version=++renderVersion,items=cart.getCart();
  const options=items.some(item=>item.customCakeId)?await getOptions().catch(()=>null):null;
  if(version!==renderVersion)return;
  const detail=item=>{
   const cake=item.customCakeId?(getCustomCakeById(item.customCakeId)||item.customCakeData):null;
   if(!cake)return '';
   const fields=[['sizes','sizeId','Kích thước'],['flavors','flavorId','Cốt bánh'],['creams','creamId','Kem phủ'],['fonts','fontId','Font chữ'],['textColors','colorId','Màu chữ']];
   const parts=fields.map(([bucket,key,label])=>{const choice=options?.[bucket]?.find(value=>value.id===cake[key]);return choice?`${label}: ${choice.name}`:null;}).filter(Boolean);
   if(cake.text)parts.push(`Lời chúc: “${cake.text}”`);
   return parts.length?`<small>${escapeHtml(parts.join(' · '))}</small>`:'';
  };
  area.innerHTML=items.length?items.map(item=>`<article class="cart-line" data-key="${escapeHtml(item.key)}">${item.image?`<img class="cart-line__image" src="${escapeHtml(item.image)}" alt="" loading="lazy">`:''}<div class="cart-line__content"><strong>${escapeHtml(item.productNameSnapshot)}</strong>${detail(item)}<p>${formatVND(item.unitPrice)}</p><div class="cart-line__actions"><button type="button" data-cart-minus aria-label="Giảm số lượng">−</button><span>${item.quantity}</span><button type="button" data-cart-plus aria-label="Tăng số lượng">+</button><button type="button" data-cart-remove aria-label="Xóa sản phẩm">✕</button></div></div></article>`).join(''):'<p class="cart-empty">Giỏ Hàng Của Bạn Trống. Thêm một số bánh ngọt ngon lành để bắt đầu.</p>';
  checkout.disabled=!items.length;discount.hidden=true;
  if(!items.length){total.parentElement.classList.remove('cart-drawer__total--pending');total.textContent=formatVND(0);return;}
  if(isSupabaseMode()){total.parentElement.classList.add('cart-drawer__total--pending');total.textContent='Tính khi thanh toán';return;}
  total.parentElement.classList.remove('cart-drawer__total--pending');
  total.textContent='Đang tính...';
  try{
   const quote=await calculateOrder({items,fulfillmentType:'pickup'});
   if(version!==renderVersion)return;
   discount.hidden=quote.discountAmount===0;
   discount.querySelector('strong').textContent='−'+formatVND(quote.discountAmount);
   total.textContent=formatVND(quote.totalAmount);
  }catch(error){if(version!==renderVersion)return;total.textContent=error.message;checkout.disabled=true;}
 }
 async function beginCheckout(){
  if(opening)return;
  try{await cart.ensureCartReady();}catch(error){toast({title:'Chưa đồng bộ giỏ hàng',description:error.message,variant:'destructive'});return;}
  if(!cart.getCart().length)return;
  const member=getCurrentMember();
  if(!member){
   const next=new URL(location.href);next.searchParams.set('checkout','1');
   location.assign(loginUrl('Vui lòng đăng nhập để đặt bánh online.',next.pathname.split('/').pop()+next.search+next.hash));
   return;
  }
  if(member.role!=='customer'){toast({title:'Cần tài khoản khách hàng',description:'Đơn online chỉ dành cho tài khoản Customer.',variant:'destructive'});return;}
  opening=true;
  try{
   await initCheckoutForm();
   cart.closeCart();
   const form=document.querySelector('#checkout-dialog');
   if(!form.open)form.showModal();
   window.dispatchEvent(new Event('bobot:checkout-open'));
   if(new URLSearchParams(location.search).has('checkout')){const url=new URL(location.href);url.searchParams.delete('checkout');history.replaceState(null,'',url.pathname+url.search+url.hash);}
  }catch(error){toast({title:'Không thể mở thanh toán',description:error.message,variant:'destructive'});}
  finally{opening=false;}
 }
 cart.subscribe(render);
 window.addEventListener('bobot:cart-open',()=>{render();if(!dialog.open)dialog.showModal();});
 window.addEventListener('bobot:cart-close',()=>{if(dialog.open)dialog.close();});
 dialog.querySelector('[data-cart-close]').addEventListener('click',cart.closeCart);
 dialog.addEventListener('close',()=>cart.closeCart());
 dialog.querySelector('#cart-clear').addEventListener('click',async()=>{try{await cart.clearCart();}catch(error){toast({title:'Không thể xóa giỏ hàng',description:error.message,variant:'destructive'});}});
 checkout.addEventListener('click',beginCheckout);
area.addEventListener('click',async event=>{
 const button=event.target.closest('button');
 if(!button||button.disabled)return;
 const key=button.closest('[data-key]')?.dataset.key;
 const item=cart.getCart().find(row=>row.key===key);
 if(!item)return;
 button.disabled=true;
 try{
  if(button.hasAttribute('data-cart-minus'))await cart.updateQuantity(key,Math.max(1,item.quantity-1));
  if(button.hasAttribute('data-cart-plus'))await cart.updateQuantity(key,item.quantity+1);
  if(button.hasAttribute('data-cart-remove'))await cart.removeFromCart(key);
 }catch(error){toast({title:'Không thể cập nhật giỏ',description:error.message,variant:'destructive'});}
 finally{button.disabled=false;}
});
try{await cart.ensureCartReady();}catch(error){toast({title:'Không thể đồng bộ giỏ',description:error.message,variant:'destructive'});}
 await render();
 if(new URLSearchParams(location.search).get('checkout')==='1'&&getCurrentMember()&&cart.getCart().length)queueMicrotask(beginCheckout);
}
