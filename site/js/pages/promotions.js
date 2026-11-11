import {getAll} from '../services/promotionService.js';
import {formatDateRange,promoImage,usePromoImageFallback} from './promotions-utils.js';
import {el} from '../core/dom.js';

const TAG='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>';
const CALENDAR='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>';

function renderPromotion(p,index){
  const card=el('article',{className:'promo-card'});
  card.style.setProperty('--promo-delay',`${Math.min(index,5)*.1}s`);
  const link=el('a',{href:'promotion-detail.html?id='+encodeURIComponent(p.id),className:'promo-card__link','aria-label':p.title||'Xem chi tiết ưu đãi'});
  const media=el('div',{className:'promo-card__media'});
  const img=el('img',{src:promoImage(p),alt:p.title||'Ảnh ưu đãi',loading:'lazy',decoding:'async'});
  usePromoImageFallback(img);
  const tag=el('span',{className:'promo-card__tag'});
  tag.innerHTML=TAG;
  const labels={active:'Đang áp dụng',ended:'Đã kết thúc',upcoming:'Sắp diễn ra',unavailable:'Chưa áp dụng'};
  tag.append(el('span',{text:labels[p.availability]||'Thông tin chương trình'}));
  media.append(img,tag);
  const copy=el('div',{className:'promo-card__copy'});
  if(p.title)copy.append(el('h2',{text:p.title}));
  if(p.description)copy.append(el('p',{className:'promo-card__description',text:p.description}));
  if(p.discountDetails)copy.append(el('p',{className:'promo-card__discount',text:p.discountDetails}));
  const range=formatDateRange(p.startDate,p.endDate);
  if(range){const date=el('p',{className:'promo-card__date'});date.innerHTML=CALENDAR;date.append(el('span',{text:range}));copy.append(date);}
  link.append(media,copy);
  card.append(link);
  return card;
}

export async function initPromotions(){
  const root=document.querySelector('#promotions-list');
  try{
    const result=await getAll([],{limit:1000});
    if(result.items.length)root.replaceChildren(...result.items.map(renderPromotion));
    else root.replaceChildren(el('p',{text:'Chưa có chương trình khuyến mãi có nội dung hợp lệ.'}));
  }catch(error){
    console.error(error);
    root.replaceChildren(el('p',{text:'Không thể tải khuyến mãi. Vui lòng thử lại.'}));
  }
}

initPromotions();
