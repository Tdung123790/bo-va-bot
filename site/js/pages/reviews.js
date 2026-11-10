import {getAll} from '../services/reviewService.js';
import {el} from '../core/dom.js';

const STAR='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>';
const QUOTE='<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 21c3 0 7-3 7-7V5H2v9h4c0 3-1 5-3 7ZM15 21c3 0 7-3 7-7V5h-8v9h4c0 3-1 5-3 7Z"/></svg>';
const perPage=24;
let rows=[];
let page=0;

function stars(rating){
  const score=Math.max(0,Math.min(5,Number(rating)||0));
  const container=el('span',{className:'review-card__stars','aria-label':`${score} trên 5 sao`});
  for(let i=0;i<5;i++){
    const star=el('span',{className:i<score?'review-card__star is-filled':'review-card__star'});
    star.innerHTML=STAR;
    container.append(star);
  }
  return container;
}

function renderReview(review,index){
  const card=el('article',{className:'review-card'});
  card.style.setProperty('--review-delay',`${Math.min(index,6)*.05}s`);
  const name=review.customer_name||review.customerName||review.display_name||(review.source==='legacy'&&review.legacyCustomerId?`Khách hàng #${review.legacyCustomerId}`:'Khách hàng');
  const avatar=el('span',{className:'review-card__avatar'});
  const image=review.image_url||review.customerImage||review.image;
  if(image){
    const photo=el('img',{src:image,alt:'',loading:'lazy'});
    photo.addEventListener('error',()=>{photo.remove();avatar.textContent=name.charAt(0)||'?';});
    avatar.append(photo);
  }else avatar.textContent=name.charAt(0)||'?';
  const identity=el('div',{className:'review-card__identity'},[el('h3',{text:name}),stars(review.rating)]);
  const top=el('div',{className:'review-card__top'},[avatar,identity]);
  const quote=el('span',{className:'review-card__quote'});
  quote.innerHTML=QUOTE;
  top.append(quote);
  card.append(top);
  const title=review.review_title||review.reviewTitle;
  if(title)card.append(el('h4',{text:title}));
  card.append(el('p',{className:'review-card__text',text:review.content||review.reviewText||review.text||''}));
  const rawDate=review.created_at||review.reviewDate;
  if(rawDate){
    const date=new Date(rawDate);
    if(!Number.isNaN(+date))card.append(el('p',{className:'review-card__date',text:new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'short',year:'numeric'}).format(date)}));
  }
  return card;
}

function renderNext(){
  const root=document.querySelector('#reviews-list');
  const next=rows.slice(page*perPage,(page+1)*perPage);
  root.append(...next.map((row,index)=>renderReview(row,index)));
  page++;
  document.querySelector('#reviews-more').hidden=page*perPage>=rows.length;
}

async function init(){
  try{
    const result=await getAll([],{limit:1000});
    rows=result.items.filter(row=>!row.status||row.status==='published');
    const root=document.querySelector('#reviews-list');
    root.replaceChildren();
    if(!rows.length){root.append(el('p',{text:'Chưa có đánh giá. Hãy là người đầu tiên chia sẻ trải nghiệm với Bơ & Bột.'}));return;}
    const avg=rows.reduce((sum,row)=>sum+Number(row.rating),0)/rows.length;
    document.querySelector('#reviews-average').textContent=avg.toFixed(1);
    document.querySelector('#reviews-count').textContent=`Dựa trên ${rows.length} đánh giá`;
    const summaryStars=document.querySelector('#reviews-average-stars');
    summaryStars.replaceChildren(stars(Math.round(avg)));
    document.querySelector('#reviews-summary-section').hidden=false;
    renderNext();
  }catch(error){
    console.error(error);
    document.querySelector('#reviews-list').replaceChildren(el('p',{text:'Không thể tải đánh giá.'}));
  }
}

document.querySelector('#reviews-more').addEventListener('click',renderNext);
init();
