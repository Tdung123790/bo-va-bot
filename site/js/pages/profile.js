import {requireLogin} from '../core/guard.js';
import {logout} from '../services/authService.js';
import {getMyOrders,cancelMyOrder} from '../services/adminOrderService.js';
import {getBalance,getTransactions} from '../services/loyaltyService.js';
import {getFlow,normalizeOrderStatus,ORDER_STATUS_LABEL} from '../services/orderStatusService.js';
import {formatVND,formatDate,formatOrderItem} from '../core/format.js';
import {el} from '../core/dom.js';
import {isSupabaseMode} from '../core/backend.js';

const member=requireLogin();

function itemsOf(order){
  if(order.db_items?.length)return order.db_items.map(formatOrderItem).join(', ');
  if(order.items?.length)return order.items.map(item=>`${item.name||item.productName||'Bánh'} (x${item.quantity||1})`).join(', ');
  try{
    const parsed=JSON.parse(order.itemsList||'[]');
    return Array.isArray(parsed)&&parsed.length?parsed.map(item=>`${item.name||item.productName||'Bánh'} (x${item.quantity||1})`).join(', '):'Không có thông tin bánh';
  }catch{return 'Không có thông tin bánh';}
}

function renderOrder(order){
  const card=el('article',{className:'profile-order'});
  const head=el('div',{className:'profile-order__head'});
  const title=el('div',{},[el('small',{text:'MÃ ĐƠN HÀNG'}),el('strong',{text:order.order_code||order.title||'Đơn hàng'})]);
  const date=el('div',{},[el('small',{text:'NGÀY ĐẶT'}),el('span',{text:order._createdDate||order.created_at?formatDate(order._createdDate||order.created_at):'Hôm nay'})]);
  head.append(title,date);
  const items=el('div',{className:'profile-order__items'},[el('strong',{text:'Giỏ bánh nướng tươi:'}),el('span',{text:itemsOf(order)})]);
  const status=normalizeOrderStatus(order.order_status||order.status);
  const steps=getFlow(order.fulfillmentType);
  const progress=el('ol',{className:'profile-order__progress'});
  const labels=order.fulfillmentType==='delivery'?['Nhận đơn','Lên lò','Shipper lấy','Đã nhận']:['Nhận đơn','Lên lò','Đã lấy bánh'];
  steps.forEach((step,index)=>{
    const className=step===status?'is-current':steps.indexOf(status)>index?'is-done':'';
    progress.append(el('li',{className},[el('span',{text:String(index+1)}),el('small',{text:labels[index]||ORDER_STATUS_LABEL[step]})]));
  });
  const cancelled=status==='cancelled'?el('p',{className:'profile-order__cancelled',text:'Đơn đã hủy'}):null;
  const bottom=el('div',{className:'profile-order__bottom'},[
    el('span',{text:`Hình thức: ${order.fulfillmentType==='delivery'?'🛵 Ship tận nhà':'🏪 Lấy tại tiệm'}`}),
    el('strong',{text:`Thành tiền: ${formatVND(order.total_amount??order.totalAmount)}`})
  ]);
  const paymentLabels={unpaid:'Chưa thanh toán',pending:'Chờ xác nhận thanh toán demo',paid:'Đã xác nhận thanh toán demo',refunded:'Đã hoàn tiền demo',failed:'Thanh toán thất bại'};
  if(order.payment_method==='vnpay')Object.assign(paymentLabels,{pending:'VNPAY sandbox đang chờ IPN/đối soát',paid:'VNPAY sandbox đã được backend xác nhận',refunded:'VNPAY sandbox đã xác nhận hoàn tiền',failed:'VNPAY sandbox thất bại'});
  bottom.append(el('span',{text:'Thanh toán: '+(paymentLabels[order.payment_status]||'Chưa có dữ liệu')}));
  card.append(head,items,progress,bottom);
  if(cancelled)card.append(cancelled);
  if(isSupabaseMode()&&order.sales_channel==='online'&&['pending','confirmed'].includes(status)){
    const cancel=el('button',{type:'button',className:'profile-order__cancel',text:'Hủy đơn'});
    cancel.addEventListener('click',async()=>{
      if(cancel.disabled||!window.confirm('Bạn xác nhận hủy đơn này?'))return;
      cancel.disabled=true;
      try{await cancelMyOrder(order._id);await refreshOrders();}
      catch(error){const message=el('p',{className:'profile-order__cancelled',text:'Không thể hủy đơn: '+error.message});card.append(message);cancel.disabled=false;}
    });
    card.append(cancel);
  }
  return card;
}

async function refreshOrders(){
 const container=document.querySelector('#my-orders');
 const result=await getMyOrders();
 if(result.orders.length)container.replaceChildren(...result.orders.map(renderOrder));
 else container.replaceChildren(el('div',{className:'profile-empty'},[el('p',{text:'Bạn chưa có đơn đặt bánh nào.'}),el('small',{text:'Hãy ra trang cửa hàng chọn cho mình những ổ bánh nướng tươi ngon nhất nhé!'})]));
}

async function init(){
  if(isSupabaseMode()&&['staff','admin'].includes(member.role)){
    document.querySelector('#profile-operations').hidden=false;
    if(member.role==='admin')document.querySelector('#profile-operations [data-admin-only]').hidden=false;
  }
  const name=member.displayName||'Thành viên';
  document.querySelector('#profile-avatar').textContent=name.trim().split(/\s+/).slice(-2).map(part=>part[0]?.toUpperCase()||'').join('')||'M';
  document.querySelector('#profile-name').textContent=name;
  document.querySelector('#profile-email').textContent=member.email||'Chưa cung cấp';
  document.querySelector('#profile-fullname').textContent=name;
  document.querySelector('#profile-status').textContent='Đã kích hoạt';
  document.querySelector('#profile-joined').textContent='Gia nhập: '+(member.createdAt?new Intl.DateTimeFormat('vi-VN',{month:'2-digit',year:'numeric'}).format(new Date(member.createdAt)):'Chưa rõ');
  const balance=await getBalance();
  document.querySelector('#loyalty-view').textContent=`${balance.points} điểm • Hạng ${balance.tier} • Tổng tích ${balance.total_earned} điểm`;
  const transactionRows=await getTransactions();
  const transactions=(isSupabaseMode()?transactionRows:transactionRows.slice().reverse()).slice(0,10);
  document.querySelector('#loyalty-transactions').append(...transactions.map(item=>el('p',{text:`${formatDate(item.created_at)}: ${item.points>0?'+':''}${item.points} điểm — ${item.description}`})));
  try{
    await refreshOrders();
  }catch(error){document.querySelector('#my-orders').replaceChildren(el('p',{text:'Không thể tải đơn hàng: '+error.message}));}
}

document.querySelector('#profile-logout').addEventListener('click',async()=>{await logout();location.assign('index.html');});
if(member)init().catch(error=>{document.querySelector('#my-orders').replaceChildren(el('p',{text:'Không thể tải hồ sơ: '+error.message}));});
