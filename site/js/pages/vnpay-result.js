import {getVnpayStatus,reconcileVnpayPayment} from '../services/vnpayService.js';

const output=document.querySelector('#vnpay-result-status');
const button=document.querySelector('#vnpay-result-retry');
const txnRef=new URL(location.href).searchParams.get('vnp_TxnRef');
async function refresh(){
 button.disabled=true;
 output.textContent='Đang kiểm tra trạng thái đã xác minh trên backend...';
 try{
  if(!txnRef)throw Error('Thiếu mã tham chiếu VNPAY.');
  let result=await getVnpayStatus({txnRef});
  let queryError='';
  if(result.paymentStatus==='pending'&&result.gatewayResult!=='reconciliation_required'){
   output.textContent='Đang đối soát giao dịch với VNPAY Sandbox qua backend...';
   try{await reconcileVnpayPayment(result.orderId);result=await getVnpayStatus({orderId:result.orderId});}
   catch(error){
 queryError=error.message.includes('VNPAY_QUERY_RATE_LIMIT')
  ?' VNPAY đang giới hạn truy vấn lặp. Vui lòng thử lại sau 5 phút.'
  :' Chưa đối soát được. Vui lòng kiểm tra lại hoặc liên hệ cửa hàng.';
}
  }
  if(result.gatewayResult==='reconciliation_required')output.textContent='Giao dịch cần đối soát thủ công. Chưa xác nhận đã thanh toán.';
  else if(result.paymentStatus==='paid')output.textContent='Backend đã xác nhận giao dịch VNPAY sandbox thành công.';
  else if(result.paymentStatus==='failed')output.textContent='Giao dịch VNPAY sandbox thất bại. Đơn hàng vẫn được lưu để xử lý.';
  else output.textContent='Giao dịch đang chờ IPN hoặc đối soát. Chưa xác nhận đã nhận tiền.'+queryError;
 }catch(error){output.textContent='Không thể kiểm tra trạng thái: '+error.message+' Vui lòng đăng nhập và xem đơn trong hồ sơ.';}
 finally{button.disabled=false;}
}
button.addEventListener('click',refresh);
refresh();
