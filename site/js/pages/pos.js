import {getCurrentMember} from '../services/authService.js';
import {getPosCatalog,quotePosSale,recordPosSale,completePosSale} from '../services/posService.js';
import {formatVND} from '../core/format.js';

const $=selector=>document.querySelector(selector);
const node=(tag,text,className)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(className)result.className=className;return result;};
const member=getCurrentMember();
const allowed=['staff','admin'].includes(member?.role)&&member?.status!=='blocked';
let products=[],cart=new Map(),quote=null,quoteVersion=0,pending=null,busy=false,createdOrderId=null;

if(!allowed)$('#pos-permission').textContent='Bạn cần đăng nhập bằng tài khoản Staff hoặc Admin để dùng POS.';
else{
 $('#pos-app').hidden=false;
 if(member.role==='admin')$('[data-admin-only]').hidden=false;
 loadCatalog();
}

function selectedItems(){return [...cart.values()].map(row=>({product_id:row.id,quantity:row.quantity}));}
function setError(message){$('#pos-error').textContent=message||'';}
function resetQuote(){quote=null;$('#pos-subtotal').textContent='—';$('#pos-discount').textContent='—';$('#pos-total').textContent='—';$('#pos-submit').disabled=true;}

async function loadCatalog(){
 try{products=await getPosCatalog();renderCategories();renderProducts();renderCart();}
 catch(error){$('#pos-products').textContent='Không tải được catalog: '+error.message;setError(error.message);}
}

function renderCategories(){
 const select=$('#pos-category'),value=select.value;
 select.replaceChildren(node('option','Tất cả'));
 select.firstChild.value='';
 const names=[...new Set(products.map(row=>row.categories?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
 for(const name of names){const option=node('option',name);option.value=name;select.append(option);}
 select.value=value;
}

function renderProducts(){
 const search=$('#pos-search').value.trim().toLocaleLowerCase('vi'),category=$('#pos-category').value;
 const matches=products.filter(row=>(!category||row.categories?.name===category)&&
  [row.name,row.source_id,row.id].some(value=>String(value||'').toLocaleLowerCase('vi').includes(search)));
 const root=$('#pos-products');root.replaceChildren();
 if(!matches.length){root.append(node('p','Không có sản phẩm phù hợp.'));return;}
 for(const row of matches){
  const card=node('article',undefined,'pos-product');
  card.append(node('strong',row.name),node('small',row.categories?.name||'Chưa có danh mục'),node('small','Mã: '+(row.source_id||row.id)),node('span',row.base_price===null?'Chưa xác nhận giá':formatVND(row.base_price)),node('small','Tồn: '+row.stock_quantity));
  const add=node('button','Thêm vào giỏ','ops-secondary');add.type='button';
  add.disabled=busy||!!pending||row.is_customizable||row.base_price===null||row.stock_quantity<1||cart.get(row.id)?.quantity>=row.stock_quantity;
  if(row.is_customizable)add.title='POS counter chỉ bán bánh có sẵn trong Sprint này.';
  add.addEventListener('click',()=>{if(pending)return;const previous=cart.get(row.id)?.quantity||0;cart.set(row.id,{...row,quantity:previous+1});renderProducts();renderCart();refreshQuote();});
  card.append(add);root.append(card);
 }
}

function renderCart(){
 const root=$('#pos-cart');root.replaceChildren();
 if(!cart.size){root.append(node('p','Chưa có sản phẩm.'));return;}
 for(const row of cart.values()){
  const line=node('div',undefined,'pos-cart-row'),label=node('div');
  label.append(node('strong',row.name),node('small',row.base_price===null?'Chưa xác nhận giá':formatVND(row.base_price)));
  const quantity=node('input');quantity.type='number';quantity.min='1';quantity.max=String(row.stock_quantity);quantity.value=String(row.quantity);quantity.setAttribute('aria-label','Số lượng '+row.name);quantity.disabled=!!pending||busy;
  quantity.addEventListener('change',()=>{const next=Number(quantity.value);if(!Number.isSafeInteger(next)||next<1||next>row.stock_quantity){quantity.value=String(row.quantity);return;}row.quantity=next;renderProducts();refreshQuote();});
  const remove=node('button','Xóa');remove.type='button';remove.disabled=!!pending||busy;
  remove.addEventListener('click',()=>{cart.delete(row.id);renderProducts();renderCart();refreshQuote();});
  line.append(label,quantity,remove);root.append(line);
 }
}

async function refreshQuote(){
 const version=++quoteVersion;resetQuote();setError('');
 if(!cart.size)return;
 try{
  const result=await quotePosSale(selectedItems());
  if(version!==quoteVersion)return;
  quote=result;
  $('#pos-subtotal').textContent=formatVND(result.subtotal);
  $('#pos-discount').textContent='−'+formatVND(result.discount_amount);
  $('#pos-total').textContent=formatVND(result.total_amount);
  $('#pos-submit').disabled=busy;
 }catch(error){if(version===quoteVersion)setError('Không thể báo giá backend: '+error.message);}
}

$('#pos-search').addEventListener('input',renderProducts);
$('#pos-category').addEventListener('change',renderProducts);
$('#pos-release').addEventListener('click',()=>{
 if(!pending||!confirm('Yêu cầu trước có thể đã được ghi nhận. Hãy kiểm tra trang Xử lý đơn trước khi tạo yêu cầu mới.'))return;
 pending=null;$('#pos-release').hidden=true;$('#pos-submit').textContent='Tạo đơn POS demo';renderCart();renderProducts();refreshQuote();
});
$('#pos-submit').addEventListener('click',async()=>{
 if(busy||(!quote&&!pending))return;
 if(!pending)pending={items:selectedItems(),request_id:crypto.randomUUID()};
 busy=true;$('#pos-submit').disabled=true;$('#pos-release').hidden=true;setError('');
 try{
  const result=await recordPosSale(pending);
  const order=result.order,charge=order.payments?.find(row=>row.kind==='charge');
  createdOrderId=order.order_status==='pending'?order.id:null;
  $('#pos-complete').hidden=!createdOrderId;
  pending=null;cart.clear();renderCart();resetQuote();
  $('#pos-result').textContent=`${order.order_code} · ${formatVND(order.total_amount)} · ${charge?.payment_method==='cash_demo'?'Tiền mặt demo':'Phương thức không xác định'} · ${order.payment_status==='paid'?'Đã ghi nhận thanh toán mô phỏng':'Chưa xác nhận thanh toán'} · ${order.order_status==='completed'?'Hoàn tất':order.order_status}${result.replayed?' · yêu cầu đã được ghi nhận trước đó':''}`;
  await loadCatalog();
 }catch(error){setError('Chưa xác nhận kết quả giao dịch. Thử lại cùng mã yêu cầu; không tạo yêu cầu mới khi chưa kiểm tra đơn: '+error.message);$('#pos-release').hidden=false;}
 finally{busy=false;renderProducts();renderCart();$('#pos-submit').disabled=!pending&&!quote;$('#pos-submit').textContent=pending?'Thử lại cùng yêu cầu':'Tạo đơn POS demo';}
});

$('#pos-complete').addEventListener('click',async()=>{
 if(!createdOrderId||busy||!window.confirm('Chỉ xác nhận khi đã thu tiền mặt demo và đã giao bánh cho khách. Tiếp tục?'))return;
 busy=true;$('#pos-complete').disabled=true;setError('');
 try{
  const result=await completePosSale(createdOrderId);
  $('#pos-result').textContent+=` · ${result.order_status==='completed'&&result.payment_status==='paid'?'Đã hoàn tất, thanh toán demo được xác nhận':'Cần kiểm tra lại trạng thái đơn'}`;
  createdOrderId=null;$('#pos-complete').hidden=true;
 }catch(error){setError('Chưa xác nhận được thu tiền/giao bánh trên backend. Kiểm tra trạng thái đơn trước khi thử lại: '+error.message);}
 finally{busy=false;$('#pos-complete').disabled=false;}
});
