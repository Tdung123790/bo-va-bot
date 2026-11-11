import {requireAdmin} from '../core/guard.js';
import {getAdminOrders,updateOrderStatus,getHistory} from '../services/adminOrderService.js';
import {confirmDemoPayment,getPaymentHistory} from '../services/paymentService.js';
import {approveDemoRefund,rejectDemoRefund} from '../services/operationsService.js';
import {getNextStatus,normalizeOrderStatus,ORDER_STATUS_LABEL} from '../services/orderStatusService.js';
import {formatVND,formatDate,formatOrderItem} from '../core/format.js';
import {toast} from '../core/toast.js';
import {el} from '../core/dom.js';
import {isSupabaseMode} from '../core/backend.js';

const panel=document.querySelector('#admin-ui');
const permission=document.querySelector('#admin-permission');
const list=document.querySelector('#admin-list');
const search=document.querySelector('#admin-search');
const filter=document.querySelector('#admin-status');
const refresh=document.querySelector('#admin-refresh');
let orders=[];
const effectiveOrderStatus=order=>normalizeOrderStatus(order.order_status)==='cancelled'||normalizeOrderStatus(order.status)==='cancelled'?'cancelled':normalizeOrderStatus(order.order_status||order.status);

function itemNames(order){
  if(order.db_items?.length)return order.db_items.map(formatOrderItem).join(', ');
  if(order.items?.length)return order.items.map(item=>`${item.name||item.productName||'Bánh'} (x${item.quantity||1})`).join(', ');
  try{
    const parsed=JSON.parse(order.itemsList||'[]');
    return Array.isArray(parsed)&&parsed.length?parsed.map(item=>`${item.name||item.productName||'Bánh'} (x${item.quantity||1})`).join(', '):'Không có thông tin bánh';
  }catch{return 'Không có thông tin bánh';}
}

function cell(content,className=''){
  const td=el('td',{className});
  td.append(content instanceof Node?content:document.createTextNode(String(content??'')));
  return td;
}

function renderRow(order){
  const status=effectiveOrderStatus(order);
  const next=order.sales_channel==='online'?getNextStatus(status,order.fulfillmentType):null;
  const tr=el('tr');
  const code=order.order_code||order.title||order._id;
  tr.append(cell(code,'admin-code'));
  const customer=el('div',{},[el('strong',{text:order.customerName||order.ship_recipient||'Khách vãng lai'}),el('small',{text:order.customerPhone||order.ship_phone||'—'})]);
  tr.append(cell(customer));
  const names=itemNames(order);
  const detail=el('details',{className:'admin-items'},[el('summary',{text:names})]);
  const history=getHistory(order._id);
  if(order.notes)detail.append(el('p',{text:'Ghi chú: '+order.notes}));
  for(const entry of history)detail.append(el('p',{text:`${formatDate(entry.created_at)}: ${ORDER_STATUS_LABEL[entry.status]||entry.status}`}));
  for(const entry of getPaymentHistory(order._id))detail.append(el('p',{text:`${formatDate(entry.created_at)}: Xác nhận thanh toán mô phỏng (${entry.payment_method==='cod'?'COD':'chuyển khoản'})`}));
  for(const refund of order.payments||[])if(refund.kind==='refund')detail.append(el('p',{text:`Hoàn tiền demo: ${refund.status==='refunded'?'Đã thực hiện':refund.refund_rejected_at?'Admin từ chối: '+(refund.refund_rejection_reason||'Không đủ điều kiện'):refund.refund_approved_at?'Admin đã duyệt, chờ Staff thực hiện':'Chờ Admin duyệt'}${refund.refund_reason?' · '+refund.refund_reason:''}`}));
  tr.append(cell(detail,'admin-items-cell'));
  tr.append(cell(order.fulfillmentType==='delivery'?'Ship tận nơi':'Tự qua lấy'));
  tr.append(cell(order.deliveryAddress||order.ship_address||'Nhận tại cửa hàng','admin-address'));
  tr.append(cell(order.estimatedTime?formatDate(order.estimatedTime):'Giao ngay'));
  tr.append(cell(formatVND(order.total_amount??order.totalAmount),'admin-total'));
  tr.append(cell(el('span',{className:`admin-status admin-status--${status}`,text:ORDER_STATUS_LABEL[status]||status})));
  const paymentStatus=String(order.payment_status||'').toLowerCase();
  const paymentLabel=paymentStatus==='paid'?'Đã xác nhận demo':paymentStatus==='pending'?'Chờ xác nhận demo':paymentStatus==='unpaid'?'Chưa thanh toán':'Chưa có dữ liệu';
  tr.append(cell(el('span',{className:`admin-status admin-payment--${paymentStatus||'unknown'}`,text:paymentLabel})));
  const actions=el('div',{className:'admin-actions'});
  const action=next?el('button',{type:'button',className:'admin-action',text:ORDER_STATUS_LABEL[next]}):el('span',{text:'—'});
  if(next)action.addEventListener('click',async()=>{
    if(action.disabled)return;
    action.disabled=true;
    try{await updateOrderStatus({orderId:order._id,status:next});toast({title:'Đã cập nhật đơn hàng'});await load();}
    catch(error){toast({title:'Không thể cập nhật',description:error.message,variant:'destructive'});action.disabled=false;}
  });
  actions.append(action);
  if(status!=='cancelled'&&['bank_transfer_demo'].includes(order.payment_method)&&['unpaid','pending'].includes(paymentStatus)){
    const paymentButton=el('button',{type:'button',className:'admin-action admin-action--payment',text:order.payment_method==='cod'?'Xác nhận thu COD demo':'Xác nhận chuyển khoản demo'});
    paymentButton.addEventListener('click',async()=>{
      if(paymentButton.disabled)return;
      if(!window.confirm(order.payment_method==='cod'?'Xác nhận đã thu tiền COD demo cho đơn này?':'Xác nhận thủ công đã nhận tiền chuyển khoản demo? Không phải xác minh ngân hàng thật.'))return;
      paymentButton.disabled=true;
      try{await confirmDemoPayment({orderId:order._id});toast({title:'Đã xác nhận thanh toán mô phỏng',description:'Không xác minh giao dịch ngân hàng thật.'});await load();}
      catch(error){toast({title:'Không thể xác nhận',description:error.message,variant:'destructive'});paymentButton.disabled=false;}
    });
    actions.append(paymentButton);
  }
  const refund=order.payments?.find(payment=>payment.kind==='refund'&&payment.status==='pending');
  if(isSupabaseMode()&&refund&&!refund.refund_approved_at){
    const approve=el('button',{type:'button',className:'admin-action admin-action--payment',text:'Duyệt hoàn tiền demo'});
    approve.addEventListener('click',async()=>{
      if(approve.disabled||!window.confirm('Duyệt yêu cầu hoàn tiền demo? Staff sẽ xác nhận thực hiện sau.'))return;
      approve.disabled=true;
      try{await approveDemoRefund(refund.id);toast({title:'Đã duyệt yêu cầu hoàn tiền demo'});await load();}
      catch(error){toast({title:'Không thể duyệt hoàn tiền',description:error.message,variant:'destructive'});approve.disabled=false;}
    });
    actions.append(approve);
    const reject=el('button',{type:'button',className:'admin-action admin-action--payment',text:'Từ chối hoàn tiền demo'});
    reject.addEventListener('click',async()=>{
      if(reject.disabled)return;
      const reason=window.prompt('Nhập lý do từ chối hoàn tiền (ít nhất 5 ký tự):');
      if(reason===null)return;
      if(reason.trim().length<5){toast({title:'Lý do phải có ít nhất 5 ký tự',variant:'destructive'});return;}
      reject.disabled=true;
      try{await rejectDemoRefund(refund.id,reason.trim());toast({title:'Đã từ chối yêu cầu hoàn tiền demo'});await load();}
      catch(error){toast({title:'Không thể từ chối hoàn tiền',description:error.message,variant:'destructive'});reject.disabled=false;}
    });
    actions.append(reject);
  }
  tr.append(cell(actions));
  return tr;
}

function render(){
  const query=search.value.trim().toLowerCase();
  const selected=filter.value;
  const rows=orders.filter(order=>{
    const status=effectiveOrderStatus(order);
    const matchStatus=selected==='all'||status===selected;
    const searchable=[order.order_code,order.title,order.customerName,order.ship_recipient,order.customerPhone,order.ship_phone].some(value=>String(value||'').toLowerCase().includes(query));
    return matchStatus&&searchable;
  });
  if(!rows.length){list.replaceChildren(el('p',{className:'admin-empty',text:orders.length?'Không tìm thấy đơn hàng phù hợp.':'Hiện chưa có đơn đặt bánh nào.'}));return;}
  const table=el('table',{className:'admin-table'});
  const head=el('thead');
  const headerRow=el('tr');
  ['Mã Đơn','Khách Hàng','Chi Tiết Bánh','Hình Thức','Địa Chỉ Giao','Hẹn Giờ Giao','Tổng Tiền','Trạng Thái','Thanh Toán','Hành Động'].forEach(label=>headerRow.append(el('th',{text:label})));
  head.append(headerRow);
  const body=el('tbody');
  body.append(...rows.map(renderRow));
  table.append(head,body);
  const scroller=el('div',{className:'admin-table-scroll'});
  scroller.tabIndex=0;
  scroller.setAttribute('role','region');
  scroller.setAttribute('aria-label','Bảng đơn hàng, cuộn ngang để xem các cột');
  scroller.append(table);
  list.replaceChildren(scroller);
}

async function load(){
  refresh.disabled=true;
  try{const result=await getAdminOrders();orders=result.orders;render();permission.textContent='';}
  catch(error){permission.textContent='Không thể tải đơn hàng: '+error.message;list.replaceChildren();}
  finally{refresh.disabled=false;}
}

const member=requireAdmin();
if(member){
  panel.hidden=false;
  load();
  search.addEventListener('input',render);
  filter.addEventListener('change',render);
  refresh.addEventListener('click',load);
}else permission.textContent='Chỉ quản trị viên được phép xem trang này.';
