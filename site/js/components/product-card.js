import {el} from '../core/dom.js';
import {formatVND} from '../core/format.js';
import {addToCart} from '../services/cartService.js';
import {trackEvent,toGaItem} from '../core/analytics.js';
import {toast} from '../core/toast.js';
import {getCurrentUser} from '../core/guard.js';
import {toggle,ids} from '../services/wishlistService.js';
import {loginUrl} from '../core/guard.js';
const HEART='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
// Same missing-image asset used by the original Wix MenuPage.
const WIX_IMAGE_FALLBACK='https://static.wixstatic.com/media/fb1c19_1620963c479f4b578979bc7d7dac891b~mv2.png';
const WIX_HOME_IMAGE_FALLBACK='https://static.wixstatic.com/media/fb1c19_0c087c0422ee43c9bbb8edf09d38b3f2~mv2.png?originWidth=576&originHeight=704';
const displayName=product=>product.itemName?.trim()?product.itemName:product.name?.trim()?product.name:'Bánh Bơ & Bột';
const imageSource=product=>product.image?.trim()||(product.imageOriginal?.startsWith('data:image/')?product.imageOriginal:WIX_IMAGE_FALLBACK);
const hasPrice=product=>product.price!==null&&product.price!==undefined&&product.price!==''&&Number.isFinite(Number(product.price));
export const isCustomCake=p=>Boolean(p.isCustomizable||/tùy chỉnh|custom/i.test(p.name||''));
export const productHref=p=>isCustomCake(p)?'customize.html':`product.html?id=${encodeURIComponent(p.id)}`;
function favoriteButton(id){const button=el('button',{type:'button',className:'product-card__favorite','aria-label':'Thêm vào danh sách yêu thích','aria-pressed':'false'});button.innerHTML=HEART;const refresh=()=>{const active=Boolean(getCurrentUser()&&ids().includes(String(id)));button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Xóa khỏi yêu thích':'Thêm vào yêu thích');};refresh();button.addEventListener('click',async()=>{if(!getCurrentUser()){location.assign(loginUrl('Vui lòng đăng nhập để lưu món bánh yêu thích nhé!'));return;}try{const result=await toggle(id);refresh();toast({title:result.isFavorited?'Đã lưu yêu thích':'Đã xóa yêu thích'});}catch(error){toast({title:'Không thể cập nhật',description:error.message,variant:'destructive'});}});window.addEventListener('bobot:wishlist-updated',refresh);window.addEventListener('bobot:auth-change',refresh);return button;}
export function renderProductCard(product,{home=false,menu=false}={}){
  const name=displayName(product);
  const custom=isCustomCake(product);
  const card=el('article',{className:menu?'product-card product-card--menu':home?'product-card product-card--home reveal':'product-card'});
  const media=el('div',{className:'product-card__media'});
  const link=el('a',{href:productHref(product),className:'product-card__link'});
  const img=el('img',{className:'product-card__image',src:imageSource(product),alt:name,loading:'lazy',decoding:'async'});
  const fallback=home?WIX_HOME_IMAGE_FALLBACK:WIX_IMAGE_FALLBACK;
  img.addEventListener('error',()=>{
    if(!img.dataset.fallback&&img.getAttribute('src')!==fallback){
      img.dataset.fallback='1';
      img.src=fallback;
      return;
    }
    img.hidden=true;
  });
  link.append(img);
  media.append(link);
  if(!home)media.append(favoriteButton(product.id));
  if(!home&&(product.isBestSeller||custom)){
    const badge=el('span',{className:`product-card__badge${menu&&custom?' product-card__badge--custom':''}`});
    if(menu&&custom)badge.textContent='✨ Tự Thiết Kế';
    else if(menu){
      badge.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>';
      badge.append(el('span',{text:'Bán Chạy'}));
    }else badge.textContent=custom?'✦ Tự Thiết Kế':'★ Bán Chạy';
    media.append(badge);
  }
  const body=el('div',{className:'product-card__body'});
  const titleLink=el('a',{className:'product-card__link',href:productHref(product)},el('h3',{className:'product-card__title',text:name}));
  body.append(titleLink,el('p',{className:'product-card__description',text:product.description||''}));
  const bottom=el('div',{className:'product-card__bottom'});
  bottom.append(el('span',{className:`product-card__price${menu&&custom?' product-card__price--custom':''}`,text:custom?'Giá theo tùy chọn':hasPrice(product)?formatVND(product.price):'Chưa xác nhận'}));
  if(custom)bottom.append(el('a',{href:'customize.html',className:`product-card__button${menu?' product-card__button--custom':''}`,text:'Thiết Kế Ngay'}));
  else{
    const idleLabel=home?'Thêm Vào Giỏ':'Thêm';
    const button=el('button',{type:'button',className:'product-card__button',text:idleLabel});
    button.addEventListener('click',async()=>{
      if(button.disabled)return;
      button.disabled=true;
      if(menu){button.textContent='Đang thêm...';button.setAttribute('aria-busy','true');}
      try{
        await addToCart({collectionId:'bakeryproducts',itemId:product.id,quantity:1});
        trackEvent('add_to_cart',{currency:'VND',value:product.price,items:[toGaItem(product,1)]});
        toast({title:'Đã thêm vào giỏ',description:name});
      }catch(error){toast({title:'Không thể thêm vào giỏ',description:error.message,variant:'destructive'});}
      finally{button.disabled=false;if(menu){button.textContent=idleLabel;button.removeAttribute('aria-busy');}}
    });
    bottom.append(button);
  }
  body.append(bottom);
  card.append(media,body);
  return card;
}
export function renderProductCards(container,products,options={}){
  container.replaceChildren(...products.map((product,index)=>{
    const card=renderProductCard(product,options);
    if(options.home)card.style.setProperty('--home-delay',`${index%4*.1}s`);
    return card;
  }));
}
