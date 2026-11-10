import * as cart from '../services/cartService.js';
import {createOrder,validateRequestedAt,calculateOrder} from '../services/orderService.js';
import {getLocations} from '../services/shippingService.js';
import {initAddressAutocomplete} from './address-autocomplete.js';
import {initDeliveryMap} from './delivery-map.js';
import {formatVND,formatDate} from '../core/format.js';
import {isSupabaseMode} from '../core/backend.js';
import {getBalance} from '../services/loyaltyService.js';
import {maxRedeemPoints,VND_PER_REDEEM_POINT} from '../services/loyaltyMath.js';
import {startVnpayPayment,getVnpayAvailability} from '../services/vnpayService.js';
import {verifyDeliveryAddress,suggestDeliveryAddresses} from '../services/deliveryVerificationService.js';
const BOBOT_SIGNED_ADDRESS_SELECTION_V1=true;

let initialized=false;

function hcmToday(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

export async function initCheckoutForm(){
 if(initialized)return document.querySelector('#checkout-dialog');
 initialized=true;
 const wrapper=document.createElement('div');
 wrapper.innerHTML=`<dialog id="checkout-dialog" class="checkout-dialog" aria-labelledby="checkout-title">
  <form id="checkout-form" novalidate>
   <header><h2 id="checkout-title">Thông Tin Đặt Bánh</h2><button type="button" data-close aria-label="Đóng">✕</button></header>
   <div class="checkout-form__body">
    <label>Họ và tên <input required name="customerName" autocomplete="name"></label>
    <label>Số điện thoại <input required name="customerPhone" inputmode="tel" autocomplete="tel"></label>
    <fieldset><legend>Hình thức nhận bánh</legend><label><input type="radio" name="fulfillmentType" value="delivery" checked> Giao hàng</label><label><input type="radio" name="fulfillmentType" value="pickup"> Nhận tại cửa hàng</label></fieldset>
    <div id="checkout-shipping"><label>Địa chỉ giao hàng <input name="deliveryAddress" id="delivery-address" autocomplete="street-address" placeholder="Nhập số nhà, đường phố, quận, thành phố..."></label><div class="checkout-two"><label>Quận/huyện <select id="checkout-district" name="district"><option value="">Chọn quận</option></select></label><label>Phường/xã <select id="checkout-ward" name="ward"><option value="">Chọn phường</option></select></label></div><label>Ghim vị trí giao hàng trên bản đồ</label><div id="checkout-map" class="checkout-map"></div><div class="checkout-delivery-actions"><button type="button" id="checkout-unpin">Bỏ ghim vị trí</button><button type="button" id="checkout-verify" hidden>Xác minh địa chỉ và ghim</button></div><p class="checkout-geocoder-notice">Chỉ khi bấm xác minh, địa chỉ sẽ được gửi tới Nominatim của OpenStreetMap để tìm vị trí. Không nhập tên hoặc số điện thoại vào địa chỉ. Dữ liệu © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</p><p id="checkout-distance" aria-live="polite">Chọn vị trí để xác định phí giao hàng.</p><p id="checkout-verification" aria-live="polite" hidden>Chưa xác minh địa chỉ.</p></div>
    <div class="checkout-two"><label>Ngày nhận bánh <input required type="date" name="deliveryDate" id="checkout-date"></label><label>Giờ nhận bánh <input required type="time" name="deliveryTime" id="checkout-time"></label></div>
    <p id="checkout-estimated" aria-live="polite">Chọn ngày và giờ nhận thực tế. Bánh tùy chỉnh cần đặt trước ít nhất 24 giờ.</p>
    <label>Ghi chú <textarea name="notes" rows="3"></textarea></label>
    <fieldset><legend>Thanh toán mô phỏng</legend><label><input type="radio" name="paymentMethod" value="bank_transfer_demo" checked> Chuyển khoản demo — chờ xác nhận mô phỏng</label></fieldset>
    <section class="checkout-summary" aria-label="Chi tiết thanh toán"><p>Tạm tính <strong id="checkout-subtotal">0 ₫</strong></p><p id="checkout-promotion" hidden>Khuyến mãi tự động <strong id="checkout-discount">0 ₫</strong></p><p>Phí giao hàng <strong id="checkout-fee">Chưa xác định</strong></p><p>Tổng cộng <strong id="checkout-total">Chưa xác định</strong></p></section>
    <p id="checkout-error" role="alert"></p>
   </div>
   <footer><button class="button button--primary" type="submit" id="checkout-submit">Xác Nhận Đặt Bánh</button></footer>
  </form>
  <section id="checkout-success" hidden><h2>Đã tạo đơn demo</h2><p>Mã đơn hàng: <strong id="checkout-order-code"></strong></p><p id="checkout-payment-message"></p><button type="button" data-close>Đóng</button></section>
 </dialog>`;
 const pointsLabel=document.createElement('label');
 pointsLabel.id='checkout-points-wrap';
 pointsLabel.hidden=true;
 pointsLabel.innerHTML='Sử dụng điểm <input id="checkout-points" name="pointsUsed" type="number" inputmode="numeric" min="0" step="1" value="0" max="0"><small id="checkout-points-available"></small>';
 const pointsLine=document.createElement('p');
 pointsLine.id='checkout-points-discount-row';
 pointsLine.hidden=true;
 pointsLine.innerHTML='Giảm bằng điểm <strong id="checkout-points-discount">0 ₫</strong>';
 wrapper.querySelector('.checkout-summary').before(pointsLabel);
 wrapper.querySelector('.checkout-summary').append(pointsLine);
 document.body.append(wrapper);
 const dialog=wrapper.querySelector('dialog'),form=dialog.querySelector('form'),$=selector=>dialog.querySelector(selector);
 let map,selectedSelectionToken=null,selectedPlaceId=null,selectedLat=null,selectedLng=null,deliveryProof=null,refreshVersion=0,submitting=false,requestId=crypto.randomUUID();
 const date=$('#checkout-date'),time=$('#checkout-time');date.min=hcmToday();
 if(isSupabaseMode()){
  const option=document.createElement('label');
  const radio=document.createElement('input');
  radio.type='radio';radio.name='paymentMethod';radio.value='vnpay';
  radio.disabled=true;
  const gatewayNote=document.createElement('span');gatewayNote.textContent=' (đang kiểm tra cấu hình)';
  option.append(radio,document.createTextNode(' VNPAY sandbox — thanh toán qua cổng thử nghiệm'),gatewayNote);
  form.querySelector('input[name="paymentMethod"][value="bank_transfer_demo"]').closest('label').after(option);
  form.querySelector('input[name="paymentMethod"]').closest('fieldset').querySelector('legend').textContent='Phương thức thanh toán';
  getVnpayAvailability().then(state=>{radio.disabled=!state.available;gatewayNote.textContent=state.available?'':' (chưa cấu hình)';})
   .catch(()=>{radio.disabled=true;gatewayNote.textContent=' (chưa cấu hình)';});
  $('#checkout-points-wrap').hidden=false;
  form.querySelector('input[name="fulfillmentType"][value="pickup"]').checked=true;
  $('#checkout-shipping').hidden=true;
  $('#checkout-verify').hidden=false;
  $('#checkout-verification').hidden=false;
  $('#checkout-district').closest('.checkout-two').style.display='none';
  $('#checkout-success h2').textContent='Đã tạo đơn hàng';
  $('#checkout-estimated').textContent='Pickup 10:00–20:00; giao hàng 10:00–19:00, đặt giao trong ngày trước 17:00. Bánh thường trước ít nhất 2 giờ, bánh tùy chỉnh trước 24 giờ.';
 }
 const delivery=()=>form.elements.fulfillmentType.value==='delivery';
 const hasCustomCake=()=>cart.getCart().some(item=>!!item.customCakeId);

 if(!isSupabaseMode())try{
  const locations=await getLocations(),district=$('#checkout-district'),ward=$('#checkout-ward');
  locations.districts.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;district.append(option);});
  district.addEventListener('change',()=>{ward.innerHTML='<option value="">Chọn phường</option>';const selected=locations.districts.find(item=>item.id===district.value);selected?.wards.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;ward.append(option);});refresh();});
  ward.addEventListener('change',()=>{const selected=locations.districts.find(item=>item.id===district.value)?.wards.find(item=>item.id===ward.value);if(!selected)return;selectedLat=selected.lat;selectedLng=selected.lng;map?.setLocation(selectedLat,selectedLng,false);refresh();});
 }catch(error){$('#checkout-distance').textContent='Chưa tải được cấu hình địa giới: '+error.message;}
 if(!isSupabaseMode())initAddressAutocomplete($('#delivery-address'),{onSelect:place=>{selectedLat=Number(place.lat);selectedLng=Number(place.lon);map?.setLocation(selectedLat,selectedLng,false);refresh();}});


 if(isSupabaseMode()){
  const input=$('#delivery-address');
  input.setAttribute('autocomplete','off');

  const notice=$('.checkout-geocoder-notice');
  if(notice){
   notice.textContent='Nh?p s? nh? v? t?n ???ng, ch?n ??a ch? g?i ? ?? t? ghim v? x?c minh v? tr? giao h?ng.';
  }

  initAddressAutocomplete(input,{
   search:suggestDeliveryAddresses,
   onSelect:async place=>{
    const lat=Number(place.lat);
    const lng=Number(place.lon);

    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;

    selectedLat=lat;
    selectedLng=lng;
    invalidateDelivery();

    await ensureMap();

    if(!map){
     $('#checkout-verification').textContent='Kh?ng m? ???c b?n ?? ?? ghim v? tr?.';
     return;
    }

    map.setLocation(lat,lng,false);
    selectedPlaceId=String(place.place_id||'');
    selectedSelectionToken=String(place.selection_token||'');
    $('#checkout-verify').click();
   }
  });
 }

 async function refresh(){
  const version=++refreshVersion;
  $('#checkout-shipping').hidden=!delivery();
  if(isSupabaseMode()){
   const BOBOT_QUOTE_FIX_ASCII_V3=true;
   const shipping=delivery();
   const verified=shipping&&Boolean(deliveryProof?.proof_id)&&Date.parse(deliveryProof.expires_at)>Date.now();

   $('#checkout-subtotal').textContent='Ch\u01b0a c\u00f3 b\u00e1o gi\u00e1';
   $('#checkout-fee').textContent=shipping?(verified?'\u0110\u00e3 x\u00e1c minh':'Ch\u01b0a x\u00e1c minh'):'0 \u20ab';
   $('#checkout-total').textContent='Ch\u1ecdn ng\u00e0y v\u00e0 gi\u1edd nh\u1eadn';
   $('#checkout-error').textContent='';

   if(shipping&&!verified){
    if(deliveryProof){
     deliveryProof=null;
     $('#checkout-verification').textContent='X\u00e1c minh \u0111\u00e3 h\u1ebft h\u1ea1n. Vui l\u00f2ng x\u00e1c minh l\u1ea1i.';
    }
    $('#checkout-total').textContent='C\u1ea7n x\u00e1c minh \u0111\u1ecba ch\u1ec9';
    return;
   }

   if(!date.value||!time.value){
    $('#checkout-fee').textContent=shipping?'Ch\u1ecdn ng\u00e0y v\u00e0 gi\u1edd \u0111\u1ec3 t\u00ednh ph\u00ed':'0 \u20ab';
    return;
   }

   $('#checkout-fee').textContent=shipping?'\u0110ang t\u00ednh ph\u00ed...':'0 \u20ab';
   $('#checkout-total').textContent='\u0110ang t\u00ednh b\u00e1o gi\u00e1...';

   const renderQuote=quote=>{
    $('#checkout-subtotal').textContent=formatVND(quote.subtotal);
    $('#checkout-promotion').hidden=!quote.discountAmount;
    $('#checkout-discount').textContent='\u2212'+formatVND(quote.discountAmount);
    $('#checkout-points-discount-row').hidden=!quote.pointsUsed;
    $('#checkout-points-discount').textContent='\u2212'+formatVND(quote.pointsDiscountAmount||0);
    $('#checkout-fee').textContent=formatVND(shipping?quote.shippingFee:0);
    $('#checkout-total').textContent=formatVND(quote.totalAmount);

    if(shipping&&quote.shippingDistance!=null&&Number.isFinite(Number(quote.shippingDistance))){
     $('#checkout-distance').textContent='Kho\u1ea3ng c\u00e1ch x\u00e1c minh: '+Number(quote.shippingDistance).toFixed(2)+' km';
    }
   };

   try{
    const input={
     items:cart.getCart(),
     fulfillmentType:shipping?'delivery':'pickup',
     deliveryDate:date.value,
     deliveryTime:time.value,
     deliveryAddress:$('#delivery-address').value,
     deliveryProofId:deliveryProof?.proof_id,
     requestId
    };

    const base=await calculateOrder({...input,pointsUsed:0});
    if(version!==refreshVersion)return;

    if(shipping&&(base.shippingFee==null||!Number.isFinite(Number(base.shippingFee)))){
     throw Error('Backend ch\u01b0a tr\u1ea3 ph\u00ed giao h\u00e0ng h\u1ee3p l\u1ec7.');
    }

    renderQuote(base);

    let balance;
    try{
     balance=await getBalance();
    }catch(balanceError){
     if(version!==refreshVersion)return;
     const pointsInput=$('#checkout-points');
     pointsInput.value='0';
     pointsInput.max='0';
     $('#checkout-points-available').textContent='Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c \u0111i\u1ec3m th\u01b0\u1edfng. B\u00e1o gi\u00e1 ch\u01b0a d\u00f9ng \u0111i\u1ec3m.';
     $('#checkout-error').textContent=balanceError.message;
     return;
    }

    if(version!==refreshVersion)return;

    const available=Math.max(0,Number(balance?.points)||0);
    const max=maxRedeemPoints(base.subtotal-base.discountAmount,available);
    const pointsInput=$('#checkout-points');

    pointsInput.max=String(Math.max(0,max));

    if(Number(pointsInput.value)>max){
     pointsInput.value=String(Math.max(0,max));
    }

    const used=Number(pointsInput.value||0);

    $('#checkout-points-available').textContent='Kh\u1ea3 d\u1ee5ng '+available+' \u0111i\u1ec3m; t\u1ed1i \u0111a '+max+' \u0111i\u1ec3m cho \u0111\u01a1n n\u00e0y. 1 \u0111i\u1ec3m = '+VND_PER_REDEEM_POINT+' \u20ab'+(balance?.point_debt?'; n\u1ee3 \u0111i\u1ec3m '+balance.point_debt:'')+'.';

    const quote=used
     ?await calculateOrder({...input,pointsUsed:used})
     :base;

    if(version!==refreshVersion)return;
    renderQuote(quote);
   }catch(error){
    if(version!==refreshVersion)return;
    $('#checkout-fee').textContent=shipping?'Ch\u01b0a t\u00ednh \u0111\u01b0\u1ee3c':'0 \u20ab';
    $('#checkout-total').textContent='Ch\u01b0a th\u1ec3 b\u00e1o gi\u00e1';
    $('#checkout-error').textContent=error.message;
   }

   return;
  }
  if(date.value&&time.value){
   try{const selected=validateRequestedAt(date.value,time.value,{hasCustomCake:hasCustomCake()});$('#checkout-estimated').textContent='Thời điểm nhận đã chọn: '+formatDate(selected,{dateStyle:'short',timeStyle:'short'});}
   catch(error){$('#checkout-estimated').textContent=error.message;}
  }
  try{
   const base=await calculateOrder({items:cart.getCart(),fulfillmentType:'pickup'});
   if(version!==refreshVersion)return;
   $('#checkout-subtotal').textContent=formatVND(base.subtotal);
   $('#checkout-promotion').hidden=base.discountAmount===0;
   $('#checkout-discount').textContent='−'+formatVND(base.discountAmount);
   if(!delivery()){$('#checkout-fee').textContent=formatVND(0);$('#checkout-total').textContent=formatVND(base.totalAmount);return;}
   if(selectedLat==null||selectedLng==null){$('#checkout-fee').textContent='Chưa xác định';$('#checkout-total').textContent='Chưa xác định';$('#checkout-distance').textContent='Chọn vị trí để xác định phí giao hàng.';return;}
   const quote=await calculateOrder({items:cart.getCart(),fulfillmentType:'delivery',mapLat:selectedLat,mapLng:selectedLng});
   if(version!==refreshVersion)return;
   $('#checkout-fee').textContent=formatVND(quote.shippingFee);
   $('#checkout-total').textContent=formatVND(quote.totalAmount);
   $('#checkout-distance').textContent=`Khoảng cách: ${quote.shippingDistance.toFixed(2)} km`;
  }catch(error){if(version!==refreshVersion)return;$('#checkout-total').textContent='Chưa thể báo giá';$('#checkout-distance').textContent=error.message;}
 }

 form.addEventListener('change',refresh);date.addEventListener('input',refresh);time.addEventListener('input',refresh);
 $('#checkout-points').addEventListener('input',refresh);
 function invalidateDelivery(){selectedSelectionToken=null;selectedPlaceId=null;deliveryProof=null;if(isSupabaseMode()){$('#checkout-verification').textContent='Địa chỉ hoặc ghim đã thay đổi. Cần xác minh lại.';refresh();}}
 if(isSupabaseMode()){
  $('#delivery-address').addEventListener('input',invalidateDelivery);
  $('#checkout-verify').addEventListener('click',async()=>{
   const button=$('#checkout-verify');button.disabled=true;
   $('#checkout-verification').textContent='Đang xác minh địa chỉ và ghim...';
   try{
    if(selectedLat==null||selectedLng==null)throw Error('Vui lòng ghim vị trí trên bản đồ.');
    const address=$('#delivery-address').value,lat=selectedLat,lng=selectedLng;
    const proof=await verifyDeliveryAddress({address,lat,lng,requestId,placeId:selectedPlaceId,selectionToken:selectedSelectionToken});
    if(address!==$('#delivery-address').value||lat!==selectedLat||lng!==selectedLng)throw Error('Địa chỉ hoặc ghim đã thay đổi trong lúc xác minh. Vui lòng thử lại.');
    deliveryProof=proof;
    $('#checkout-verification').textContent=`Đã xác minh đến ${new Date(deliveryProof.expires_at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}.`;
    await refresh();
   }catch(error){deliveryProof=null;$('#checkout-verification').textContent=error.message;await refresh();}
   finally{button.disabled=false;}
  });
 }
 form.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 $('#checkout-success [data-close]').addEventListener('click',()=>dialog.close());
 $('#checkout-unpin').addEventListener('click',()=>{selectedLat=null;selectedLng=null;map?.clear();invalidateDelivery();});
 window.addEventListener('bobot:checkout-open',()=>requestAnimationFrame(()=>map?.map?.invalidateSize()));
 async function ensureMap(){if(map)return;try{const origin=(await getLocations()).bakery;if(!Number.isFinite(origin?.lat)||!Number.isFinite(origin?.lng))throw Error('Thiếu tọa độ DEMO của cửa hàng.');map=await initDeliveryMap($('#checkout-map'),{lat:origin.lat,lng:origin.lng,onSelect:(lat,lng)=>{selectedLat=lat;selectedLng=lng;invalidateDelivery();}});map.map.invalidateSize();}catch(error){$('#checkout-map').textContent='Bản đồ tạm thời không khả dụng: '+error.message;}}
 if(isSupabaseMode())form.querySelector('input[name="fulfillmentType"][value="delivery"]').addEventListener('change',ensureMap);
 else await ensureMap();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;
  const error=$('#checkout-error'),button=$('#checkout-submit');error.textContent='';
  if(!form.reportValidity())return;
  submitting=true;button.disabled=true;
  try{
   if(delivery()&&(selectedLat==null||selectedLng==null||isSupabaseMode()&&!deliveryProof))throw Error('Vui lòng xác minh địa chỉ và ghim trước khi đặt.');
   const data=Object.fromEntries(new FormData(form).entries());
   validateRequestedAt(data.deliveryDate,data.deliveryTime,{hasCustomCake:hasCustomCake(),minRegularHours:isSupabaseMode()?2:0});
   const result=await createOrder({...data,requestId,deliveryProofId:deliveryProof?.proof_id,mapLat:selectedLat,mapLng:selectedLng});
   if(isSupabaseMode()&&data.paymentMethod==='vnpay'){
    const session=await startVnpayPayment(result.orderId);
    if(!session?.url||!session.url.startsWith('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?'))throw Error('Chưa tạo được phiên VNPAY sandbox. Đơn đã được lưu, giỏ vẫn được giữ; thử lại với cùng yêu cầu.');
    cart.clearCart();
    requestId=crypto.randomUUID();
    location.assign(session.url);
    return;
   }
   $('#checkout-order-code').textContent=result.orderCode;
   $('#checkout-payment-message').textContent=data.paymentMethod==='bank_transfer_demo'?'Đơn chuyển khoản demo đang chờ người có quyền xác nhận mô phỏng. Chưa xác nhận đã nhận tiền ngân hàng.':'Đơn đang chờ xác nhận thanh toán.';
   form.hidden=true;$('#checkout-success').hidden=false;
   requestId=crypto.randomUUID();
   deliveryProof=null;
  }catch(failure){if(isSupabaseMode())await refresh();error.textContent=failure.message;}
  finally{submitting=false;button.disabled=false;}
 });
 dialog.addEventListener('close',()=>{form.hidden=false;$('#checkout-success').hidden=true;});
 await refresh();return dialog;
}
