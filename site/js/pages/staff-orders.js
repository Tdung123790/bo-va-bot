import {getCurrentMember} from '../services/authService.js';
import {getOperationalOrders,transitionOperationalOrder,cancelOperationalOrder,confirmOperationalPayment,completePosSale,recordDeliveryFailure,requestDemoRefund,approveDemoRefund,executeDemoRefund,resolveCancellationRequest} from '../services/operationsService.js';
import {getNextStatus,ORDER_STATUS_LABEL} from '../services/orderStatusService.js';
import {formatVND,formatDate,formatOrderItem} from '../core/format.js';

const $=selector=>document.querySelector(selector);
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
const user=getCurrentMember();
let orders=[];
if(!['staff','admin'].includes(user?.role)||user?.status==='blocked')$('#staff-permission').textContent='Chỉ Staff hoặc Admin đang hoạt động được xem và xử lý đơn.';
else{
 $('#staff-app').hidden=false;
 if(user.role==='admin')$('[data-admin-only]').hidden=false;
 load();
}

async function load(){
 $('#staff-refresh').disabled=true;$('#staff-error').textContent='';
 try{orders=await getOperationalOrders();render();}
 catch(error){$('#staff-error').textContent='Không thể tải đơn: '+error.message;$('#staff-list').replaceChildren();}
 finally{$('#staff-refresh').disabled=false;}
}

function render(){
 const channel=$('#staff-channel').value,status=$('#staff-status').value;
 const matches=orders.filter(order=>(channel==='all'||order.sales_channel===channel)&&(status==='all'||order.order_status===status));
 const root=$('#staff-list');root.replaceChildren();
 if(!matches.length){root.append(node('p',orders.length?'Không có đơn phù hợp.':'Chưa có đơn hàng.'));return;}
 for(const order of matches)root.append(renderOrder(order));
}

function renderOrder(order){
 const article=node('article',undefined,'staff-order');
 const head=node('div',undefined,'staff-order-head'),title=node('div');
 title.append(node('h2',order.order_code),node('p',`${order.sales_channel==='offline'?'Tại quầy':'Online'} · ${order.fulfillment_type} · ${formatDate(order.created_at)}`));
 const amount=node('div');amount.append(node('strong',formatVND(order.total_amount)),node('p',`Đơn: ${ORDER_STATUS_LABEL[order.order_status]||order.order_status} · Thanh toán: ${order.payment_status}`));
 head.append(title,amount);article.append(head);
 if(order.requested_at&&new Date(order.requested_at)<new Date()&&!['completed','cancelled'].includes(order.order_status))article.append(node('p','Cảnh báo: đơn đã quá giờ hẹn nhận/giao.','staff-warning'));
 if(order.delivery_failed_at)article.append(node('p',`Giao thất bại: ${order.delivery_failure_reason||'Cần xử lý lại'}`,'staff-warning'));
 if(order.ship_recipient)article.append(node('p',`Khách nhận: ${order.ship_recipient} · ${order.ship_phone||'—'}`));
 const details=node('details'),summary=node('summary','Chi tiết bánh và lịch sử'),items=node('ul');
 for(const item of [...(order.order_items||[])].sort((a,b)=>a.line_no-b.line_no))items.append(node('li',`${formatOrderItem(item)} · ${formatVND(item.subtotal)}`));
 details.append(summary,items);
 const history=node('ul');
 for(const item of [...(order.order_status_history||[])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))))history.append(node('li',`${formatDate(item.created_at)} · ${ORDER_STATUS_LABEL[item.to_status]||item.to_status} · ${item.actor_type}${item.note?' · '+item.note:''}`));
 for(const payment of [...(order.payments||[])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))))history.append(node('li',`${formatDate(payment.created_at)} · ${payment.payment_method} · ${payment.status} · ${formatVND(payment.amount)}`));
 details.append(history);article.append(details);
 const actions=node('div',undefined,'staff-actions');
 const latestCancel={id:order.cancel_request_id,status:order.cancel_request_status,reason:order.cancel_request_reason};
 const next=order.sales_channel==='online'&&latestCancel?.status!=='pending'?getNextStatus(order.order_status,order.fulfillment_type):null;
 const note=node('input');note.className='staff-reason';note.placeholder='Lý do/ghi chú xử lý';note.setAttribute('aria-label','Lý do hoặc ghi chú cho đơn '+order.order_code);
 if(next){
  const transition=node('button',ORDER_STATUS_LABEL[next]||next,'ops-primary');transition.type='button';
  transition.addEventListener('click',()=>perform(article,()=>transitionOperationalOrder(order.id,next,note.value.trim())));
  actions.append(transition);
 }
 if(order.sales_channel==='offline'&&order.order_status==='pending'){
  const finish=node('button','Thu tiền và giao bánh POS demo','ops-primary');finish.type='button';
  finish.addEventListener('click',()=>{if(!window.confirm('Bạn xác nhận đã thu tiền mặt demo và đã giao bánh cho khách?'))return;perform(article,()=>completePosSale(order.id));});
  actions.append(finish);
 }
 if(order.fulfillment_type==='delivery'&&order.order_status==='shipping'){
  const failed=node('button','Ghi nhận giao thất bại','ops-secondary');failed.type='button';
  failed.addEventListener('click',()=>{if(note.value.trim().length<5){note.setCustomValidity('Nhập lý do giao thất bại ít nhất 5 ký tự.');note.reportValidity();note.setCustomValidity('');return;}perform(article,()=>recordDeliveryFailure(order.id,note.value.trim()));});
  actions.append(failed);
 }
 if(['pending','confirmed'].includes(order.order_status)){
  const cancel=node('button','Hủy đơn','ops-secondary');cancel.type='button';
  cancel.addEventListener('click',()=>{if(!note.value.trim()){note.setCustomValidity('Nhập lý do hủy.');note.reportValidity();note.setCustomValidity('');return;}perform(article,()=>cancelOperationalOrder(order.id,note.value.trim()));});
  actions.append(cancel);
 }
 const cancelRequest=latestCancel;
 if(cancelRequest?.status==='pending'){
  article.append(node('p','Khách yêu cầu hủy đơn: '+cancelRequest.reason,'staff-warning'));
  if(user.role==='staff'){
   const approve=node('button','Chấp thuận hủy','ops-secondary');approve.type='button';
   approve.addEventListener('click',()=>{
    if(note.value.trim().length<5){window.alert('Nhập lý do quyết định tối thiểu 5 ký tự.');return;}
    const restock=window.confirm('Chỉ hoàn tồn nếu đã kiểm tra hàng còn đủ điều kiện bán. OK = hoàn tồn, Cancel = KHÔNG hoàn tồn.');
    if(!window.confirm('Xác nhận chấp thuận hủy đơn?'))return;
    perform(article,()=>resolveCancellationRequest(cancelRequest.id,true,note.value.trim(),restock));
   });actions.append(approve);
   const reject=node('button','Từ chối hủy','ops-secondary');reject.type='button';
   reject.addEventListener('click',()=>{
    if(note.value.trim().length<5){window.alert('Nhập lý do từ chối tối thiểu 5 ký tự.');return;}
    perform(article,()=>resolveCancellationRequest(cancelRequest.id,false,note.value.trim(),false));
   });actions.append(reject);
  }
 }
 const charge=order.payments?.find(row=>row.kind==='charge');
 if(order.order_status!=='cancelled'&&charge&&['bank_transfer_demo'].includes(charge.payment_method)&&['unpaid','pending'].includes(charge.status)){
  const payment=node('button','Xác nhận thanh toán demo','ops-secondary');payment.type='button';
  payment.addEventListener('click',()=>{if(!window.confirm(charge.payment_method==='cod'?'Xác nhận đã thu tiền COD demo?':'Xác nhận thủ công đã nhận tiền chuyển khoản demo? Không phải xác minh ngân hàng thật.'))return;perform(article,()=>confirmOperationalPayment(order.id));});
  actions.append(payment);
 }
 const refund=order.payments?.find(row=>row.kind==='refund');
 if(charge?.status==='paid'&&['completed','cancelled'].includes(order.order_status)&&!refund&&user.role==='staff'){
  const requestId=crypto.randomUUID(),request=node('button','Yêu cầu hoàn tiền demo','ops-secondary');request.type='button';
  request.addEventListener('click',()=>{if(note.value.trim().length<5){note.setCustomValidity('Nhập lý do hoàn tiền ít nhất 5 ký tự.');note.reportValidity();note.setCustomValidity('');return;}perform(article,()=>requestDemoRefund(order.id,requestId,note.value.trim()));});
  actions.append(request);
 }
 if(refund?.status==='pending'&&user.role==='admin'&&!refund.refund_approved_at){
  const approve=node('button','Duyệt hoàn tiền demo','ops-secondary');approve.type='button';
  approve.addEventListener('click',()=>{if(!window.confirm('Duyệt yêu cầu hoàn tiền demo? Staff sẽ thực hiện bước xác nhận sau.'))return;perform(article,()=>approveDemoRefund(refund.id));});
  actions.append(approve);
 }
 if(refund?.status==='pending'&&user.role==='staff'&&refund.refund_approved_at){
  const execute=node('button','Ghi nhận hoàn tiền đã thực hiện','ops-secondary');execute.type='button';
  execute.addEventListener('click',()=>{const reference=window.prompt('Nhập mã giao dịch/biên nhận hoàn tiền đã thực hiện (ít nhất 6 ký tự). Không nhập thông tin cá nhân:');if(reference===null)return;if(reference.trim().length<6){window.alert('Cần mã biên nhận hoàn tiền hợp lệ.');return;}if(!window.confirm('Xác nhận đã thực sự hoàn tiền và có biên nhận?'))return;perform(article,()=>executeDemoRefund(refund.id,reference.trim()));});
  actions.append(execute);
 }
 if(refund){const state=refund.status==='refunded'?'Đã ghi nhận hoàn tiền':refund.status==='failed'?'Yêu cầu hoàn tiền không thành công':refund.refund_approved_at?'Admin đã duyệt — chờ Staff hoàn tiền':'Đang chờ Admin duyệt hoàn tiền';article.append(node('p',state+(refund.transaction_code?' · Biên nhận: '+refund.transaction_code:''),'staff-warning'));}
 if(actions.children.length){actions.prepend(note);article.append(actions);}
 return article;
}

async function perform(article,operation){
 if(article.dataset.busy)return;
 article.dataset.busy='true';
 article.querySelectorAll('button').forEach(button=>button.disabled=true);
 $('#staff-error').textContent='';
 try{await operation();await load();}
 catch(error){$('#staff-error').textContent='Không thể xử lý đơn: '+error.message;article.querySelectorAll('button').forEach(button=>button.disabled=false);}
 finally{delete article.dataset.busy;}
}

$('#staff-channel').addEventListener('change',render);
$('#staff-status').addEventListener('change',render);
$('#staff-refresh').addEventListener('click',load);
