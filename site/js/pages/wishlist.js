import {requireLogin} from '../core/guard.js';
import {list,toggle} from '../services/wishlistService.js';
import {addToCart} from '../services/cartService.js';
import {productHref,isCustomCake} from '../components/product-card.js';
import {formatVND} from '../core/format.js';
import {el} from '../core/dom.js';
import {toast} from '../core/toast.js';

const FALLBACK='https://static.wixstatic.com/media/fb1c19_1620963c479f4b578979bc7d7dac891b~mv2.png';
const TRASH='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"/></svg>';
const BAG='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h16l-1 12H5L4 8Zm4 0V6a4 4 0 0 1 8 0v2"/></svg>';
const target=document.getElementById('wishlist-result');
const hasPrice=product=>product.price!==null&&product.price!==undefined&&product.price!==''&&Number.isFinite(Number(product.price));

function empty(){
  const panel=el('div',{className:'wishlist-empty'});
  panel.append(el('span',{className:'wishlist-empty__heart',text:'♡'}),el('h2',{text:'Chưa Có Món Bánh Nào'}),el('p',{text:'Bạn chưa lưu món bánh nào vào danh sách yêu thích. Hãy khám phá thực đơn ngay nhé!'}),el('a',{href:'menu.html',text:'Khám Phá Thực Đơn'}));
  target.replaceChildren(panel);
}

function card(product,index){
  const name=product.itemName||product.name||'Bánh Bơ & Bột';
  const article=el('article',{className:'wishlist-card'});
  article.style.setProperty('--wish-delay',`${Math.min(index,6)*.05}s`);
  const media=el('div',{className:'wishlist-card__media'});
  const link=el('a',{href:productHref(product)});
  const image=el('img',{src:product.image||FALLBACK,alt:name,loading:'lazy',decoding:'async'});
  image.addEventListener('error',()=>{if(image.getAttribute('src')!==FALLBACK){image.src=FALLBACK;return;}image.hidden=true;});
  link.append(image);
  const remove=el('button',{type:'button',className:'wishlist-card__remove','aria-label':`Xóa ${name} khỏi yêu thích`,title:'Xóa khỏi yêu thích'});
  remove.innerHTML=TRASH;
  remove.addEventListener('click',async()=>{
    if(remove.disabled)return;
    remove.disabled=true;
    try{await toggle(product.id);toast({title:'Đã xóa',description:'Đã xóa sản phẩm khỏi danh sách yêu thích.'});}
    catch(error){toast({title:'Không thể xóa',description:error.message,variant:'destructive'});remove.disabled=false;}
  });
  media.append(link,remove);
  const copy=el('div',{className:'wishlist-card__copy'});
  copy.append(el('a',{href:productHref(product)},el('h2',{text:name})),el('p',{className:'wishlist-card__description',text:product.description||''}));
  const bottom=el('div',{className:'wishlist-card__bottom'});
  bottom.append(el('span',{className:'wishlist-card__price',text:isCustomCake(product)?'Giá theo tùy chọn':hasPrice(product)?formatVND(product.price):'Chưa xác nhận'}));
  if(isCustomCake(product))bottom.append(el('a',{className:'wishlist-card__add',href:'customize.html',text:'Thiết Kế'}));
  else{
    const add=el('button',{type:'button',className:'wishlist-card__add'});
    add.innerHTML=BAG+'<span>Thêm Giỏ</span>';
    add.addEventListener('click',async()=>{
      if(add.disabled)return;
      add.disabled=true;
      try{await addToCart({collectionId:'bakeryproducts',itemId:product.id,quantity:1});toast({title:'Đã thêm vào giỏ',description:`Đã thêm ${name} vào giỏ hàng.`});}
      catch(error){toast({title:'Không thể thêm vào giỏ',description:error.message,variant:'destructive'});}
      finally{add.disabled=false;}
    });
    bottom.append(add);
  }
  copy.append(bottom);
  article.append(media,copy);
  return article;
}

async function render(){
  try{
    const result=await list();
    if(result.items.length)target.replaceChildren(...result.items.map(card));
    else empty();
  }catch(error){target.replaceChildren(el('p',{text:'Không tải được danh sách yêu thích: '+error.message}));}
}

if(requireLogin())render();
window.addEventListener('bobot:wishlist-updated',render);
