import {getById,getAll} from '../services/productService.js';
import {renderProductCards,isCustomCake} from '../components/product-card.js';
import {formatVND} from '../core/format.js';
import {el} from '../core/dom.js';
import {addToCart} from '../services/cartService.js';
import {trackEvent,toGaItem} from '../core/analytics.js';
import {toast} from '../core/toast.js';
import {getCurrentUser,loginUrl} from '../core/guard.js';
import {toggle as toggleWishlist,ids as wishlistIds} from '../services/wishlistService.js';
import {getRelatedProductIds} from '../services/recommendationService.js';
import {getAll as getReviews} from '../services/reviewService.js';

const IMAGE_FALLBACK='https://static.wixstatic.com/media/fb1c19_f53dddbb40214cbc9cbd321517ec21e5~mv2.png?originWidth=768&originHeight=768';
const HEART='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const hasPrice=product=>product.price!==null&&product.price!==undefined&&product.price!==''&&Number.isFinite(Number(product.price));

async function loadProductReviews(product){
  const section=document.querySelector('#product-reviews');
  const summary=document.querySelector('#product-reviews-summary');
  const list=document.querySelector('#product-reviews-list');
  section.hidden=false;
  summary.textContent='Đang tải đánh giá sản phẩm...';
  try{
    const result=await getReviews([],{limit:1000});
    const rows=result.items.filter(row=>row.source==='supabase'&&row.product_id===product.backendId);
    if(!rows.length){summary.textContent='Chưa có đánh giá được duyệt cho sản phẩm này.';list.replaceChildren();return;}
    const average=rows.reduce((sum,row)=>sum+Number(row.rating),0)/rows.length;
    summary.textContent=`${rows.length} đánh giá được duyệt · ${average.toFixed(1)}/5 sao`;
    list.replaceChildren(...rows.slice(0,3).map(row=>el('article',{},[
      el('strong',{text:`${row.rating}/5 sao`}),
      el('p',{text:row.content}),
      el('time',{text:new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(row.created_at))})
    ])));
  }catch(error){summary.textContent='Chưa tải được đánh giá sản phẩm.';list.replaceChildren();console.error(error);}
}

function empty(title='Sản Phẩm Không Tìm Thấy',detail='Sản phẩm bạn tìm kiếm không tồn tại hoặc đã bị xóa.'){
  const box=el('div',{className:'empty-state'},[el('h2',{text:title}),el('p',{text:detail}),el('a',{href:'menu.html',className:'pill-button',text:'← Quay Lại Thực Đơn'})]);
  document.querySelector('#product-content').replaceChildren(box);
}

function favoriteButtons(productId){
  const buttons=[];
  let busy=false;
  function update(){
    const active=Boolean(getCurrentUser()&&wishlistIds().includes(String(productId)));
    for(const button of buttons){
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active?'Xóa khỏi yêu thích':'Thêm vào yêu thích');
    }
  }
  async function toggle(){
    if(busy)return;
    if(!getCurrentUser()){location.assign(loginUrl('Vui lòng đăng nhập để lưu món bánh yêu thích nhé!'));return;}
    busy=true;
    buttons.forEach(button=>button.disabled=true);
    try{const result=await toggleWishlist(productId);update();toast({title:result.isFavorited?'Đã lưu yêu thích':'Đã xóa yêu thích'});}
    catch(error){toast({title:'Không thể cập nhật',description:error.message,variant:'destructive'});}
    finally{busy=false;buttons.forEach(button=>button.disabled=false);}
  }
  function create(className){
    const button=el('button',{type:'button',className,'aria-label':'Thêm vào yêu thích','aria-pressed':'false'});
    button.innerHTML=HEART;
    button.addEventListener('click',toggle);
    buttons.push(button);
    update();
    return button;
  }
  window.addEventListener('bobot:wishlist-updated',update);
  window.addEventListener('bobot:auth-change',update);
  return {create};
}

export async function initProduct(){
  const id=new URLSearchParams(location.search).get('id');
  if(!id){empty('Chưa chọn sản phẩm','Vui lòng chọn một món bánh từ thực đơn để xem chi tiết.');return;}
  let product;
  try{product=await getById(id);}
  catch(error){empty('Không thể tải sản phẩm','Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.');console.error(error);return;}
  if(!product){empty();return;}
  if(isCustomCake(product)){location.replace('customize.html');return;}

  const name=product.itemName||product.name||'Bánh Bơ & Bột';
  document.title=`${name} | Bơ & Bột`;
  trackEvent('view_item',{currency:'VND',value:product.price,items:[toGaItem(product)]});
  const favorite=favoriteButtons(product.id);
  let quantity=1;
  const container=el('div',{className:'detail-grid'});
  const media=el('div',{className:'detail-media'});
  const img=el('img',{src:product.image||IMAGE_FALLBACK,alt:name,loading:'eager'});
  img.addEventListener('error',()=>{
    if(img.getAttribute('src')!==IMAGE_FALLBACK){img.src=IMAGE_FALLBACK;return;}
    img.hidden=true;
  });
  media.append(img,favorite.create('detail-heart detail-heart--media'));
  if(product.isBestSeller)media.append(el('span',{className:'detail-badge',text:'★ Best Seller'}));

  const info=el('div',{className:'detail-info'});
  if(product.category)info.append(el('span',{className:'detail-category',text:product.category}));
  info.append(el('h1',{text:name}),el('p',{className:'detail-price',text:isCustomCake(product)?'Giá theo tùy chọn':hasPrice(product)?formatVND(product.price):'Chưa xác nhận'}),el('p',{className:'detail-description',text:product.description||''}),el('label',{text:'Số Lượng','for':'quantity-value'}));
  const counter=el('div',{className:'detail-quantity'});
  const minus=el('button',{type:'button',text:'−','aria-label':'Giảm số lượng'});
  const value=el('output',{id:'quantity-value',text:'1','aria-live':'polite'});
  const plus=el('button',{type:'button',text:'+','aria-label':'Tăng số lượng'});
  const max=Math.min(99,Number.isInteger(product.stockQuantity)?Math.max(0,product.stockQuantity):99);
  function setQty(next){quantity=Math.max(1,Math.min(max,next));value.textContent=String(quantity);minus.disabled=quantity<=1;plus.disabled=quantity>=max;}
  minus.addEventListener('click',()=>setQty(quantity-1));
  plus.addEventListener('click',()=>setQty(quantity+1));
  counter.append(minus,value,plus);
  setQty(1);
  info.append(counter);

  const actions=el('div',{className:'detail-actions'});
  const add=el('button',{type:'button',className:'detail-add',text:'Thêm Vào Giỏ'});
  const buy=el('button',{type:'button',className:'detail-buy',text:'Mua Ngay'});
  const heart=favorite.create('detail-heart detail-heart--action');
  async function addItem(buyNow=false){
    if(add.disabled||buy.disabled)return;
    add.disabled=true;buy.disabled=true;add.textContent='Đang Thêm Vào Giỏ...';
    try{
      await addToCart({collectionId:'bakeryproducts',itemId:product.id,quantity});
      trackEvent('add_to_cart',{currency:'VND',value:product.price*quantity,items:[toGaItem(product,quantity)]});
      toast({title:'Đã thêm vào giỏ',description:name,variant:'success'});
      if(buyNow)toast({title:'Giỏ hàng đã cập nhật',description:'Bạn có thể tiếp tục từ giỏ hàng.'});
    }catch(error){toast({title:'Không thể thêm sản phẩm',description:error.message,variant:'destructive'});}
    finally{add.disabled=max<1;buy.disabled=max<1;add.textContent='Thêm Vào Giỏ';}
  }
  add.addEventListener('click',()=>addItem());
  buy.addEventListener('click',()=>addItem(true));
  actions.append(add,heart,buy);
  info.append(actions);
  const details=el('div',{className:'detail-extra'},[
    el('h2',{text:'Chi Tiết Sản Phẩm'}),
    el('ul',{},[
      el('li',{text:'✨ Được làm tươi mỗi ngày với nguyên liệu cao cấp'}),
      el('li',{text:'👨‍🍳 Được làm thủ công bởi các thợ nướng chuyên gia của chúng tôi'}),
      el('li',{text:'⏰ Nên thưởng thức trong vòng 2-3 ngày'}),
      el('li',{text:'❄️ Bảo quản ở nơi mát, khô ráo'})
    ])
  ]);
  info.append(details);
  container.append(media,info);
  document.querySelector('#product-content').replaceChildren(container);
  loadProductReviews(product);
  if(max<1){add.disabled=true;buy.disabled=true;info.append(el('p',{text:'Sản phẩm hiện đã hết hàng.'}));}

  const relatedSection=document.querySelector('#related-section');
  const relatedGrid=document.querySelector('#related-grid');
  relatedSection.hidden=false;
  relatedGrid.replaceChildren(el('p',{text:'Đang tải sản phẩm liên quan...'}));
  try{
    const [rankedIds,result]=await Promise.all([getRelatedProductIds(String(product.id)),getAll([],{limit:1000})]);
    const available=new Map(result.items.filter(item=>item.status==='active'&&!isCustomCake(item)&&Number(item.stockQuantity)>0).map(item=>[String(item.id),item]));
    const related=rankedIds.map(id=>available.get(id)).filter(Boolean).slice(0,4);
    if(related.length)renderProductCards(relatedGrid,related);
    else relatedGrid.replaceChildren(el('p',{text:'Hiện chưa có sản phẩm liên quan đang bán.'}));
  }catch(error){relatedGrid.replaceChildren(el('p',{text:'Chưa tải được sản phẩm liên quan. Vui lòng thử lại sau.'}));console.error('Không thể tải sản phẩm liên quan',error);}
}
initProduct();
