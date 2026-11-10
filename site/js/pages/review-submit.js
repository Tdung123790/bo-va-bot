import {getCurrentMember} from '../services/authService.js';
import {isSupabaseMode} from '../core/backend.js';
import {getMyReviews,getReviewableItems,submitReview} from '../services/reviewService.js';

const area=document.querySelector('#review-submit-section');
const status=document.querySelector('#review-submit-status');
const form=document.querySelector('#review-submit-form');
const select=document.querySelector('#review-order-item');
const own=document.querySelector('#review-own-list');

async function loadMine(){
  const rows=await getMyReviews();
  const labels={pending:'Đang chờ duyệt',published:'Đã công khai',hidden:'Đã ẩn'};
  own.replaceChildren();
  if(!rows.length){own.textContent='Bạn chưa gửi đánh giá nào.';return;}
  for(const row of rows){
    const item=document.createElement('article');
    const heading=document.createElement('h4');
    heading.textContent=`${row.product_name||'Sản phẩm'} · ${row.order_code||'Đơn hàng'} · ${row.rating} sao`;
    const state=document.createElement('p');
    state.textContent=labels[row.status]||row.status;
    const content=document.createElement('p');
    content.textContent=row.content||'';
    item.append(heading,state,content);
    own.append(item);
  }
}

async function loadOptions(){
  const member=getCurrentMember();
  if(!isSupabaseMode()||member?.role!=='customer'){
    area.hidden=true;
    return;
  }
  area.hidden=false;
  const rows=await getReviewableItems();
  select.replaceChildren(...rows.map(item=>new Option(`${item.order_code} — ${item.product_name}`,item.order_item_id)));
  form.hidden=!rows.length;
  status.textContent=rows.length?'Chỉ được đánh giá bánh thuộc đơn hàng đã hoàn tất.':'Chưa có sản phẩm đủ điều kiện đánh giá.';
  await loadMine();
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  status.textContent='Đang gửi đánh giá...';
  try{
    await submitReview({
      orderItemId:select.value,
      rating:Number(form.elements.rating.value),
      content:form.elements.content.value
    });
    await loadOptions();
    form.reset();
    status.textContent='Đã gửi đánh giá. Đánh giá sẽ xuất hiện sau khi được duyệt.';
  }catch(error){
    status.textContent='Không gửi được đánh giá: '+error.message;
  }finally{button.disabled=false;}
});

loadOptions().catch(error=>{area.hidden=false;form.hidden=true;status.textContent='Chưa tải được quyền đánh giá: '+error.message;});
