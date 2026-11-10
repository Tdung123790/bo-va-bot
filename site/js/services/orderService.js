import {getJSON,setJSON} from '../core/storage.js';
import {getCart,clearCart} from './cartService.js';
import {getById} from './productService.js';
import {getAutomaticPromotion} from './promotionService.js';
import {quoteShipping} from './shippingService.js';
import {getCurrentMember} from './authService.js';
import {getOptions,getById as getCustomCakeById} from './customCakeService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
export const ORDER_KEY='bobot:v1:orders';
export const ORDER_ITEMS_KEY='bobot:v1:orderItems';
export function normalizePhone(value){let phone=String(value||'').replace(/[\s.\-]/g,'');if(phone.startsWith('+84'))phone='0'+phone.slice(3);else if(phone.startsWith('84'))phone='0'+phone.slice(2);return /^0\d{9}$/.test(phone)?phone:null;}
export function getOrders(){const x=getJSON(ORDER_KEY,[]);return Array.isArray(x)?x:[];}
export function getOrderItems(){const x=getJSON(ORDER_ITEMS_KEY,[]);return Array.isArray(x)?x:[];}
export function getOrderByCode(code){return getOrders().find(x=>x.order_code===code||x.orderCode===code)||null;}
export function validateRequestedAt(date,time,{hasCustomCake=false,minRegularHours=0,now=new Date()}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time||'')))throw Error('Vui lòng chọn ngày và giờ nhận bánh hợp lệ');
 const requested=new Date(`${date}T${time}:00+07:00`);
 if(!Number.isFinite(+requested))throw Error('Ngày giờ nhận bánh không hợp lệ');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(requested);
 const local=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 if(`${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}`!==`${date}T${time}`)throw Error('Ngày giờ nhận bánh không hợp lệ');
 if(+requested<=+now)throw Error('Không thể chọn thời điểm nhận bánh trong quá khứ');
 if(hasCustomCake&&+requested-+now<24*60*60*1000)throw Error('Bánh tùy chỉnh cần đặt trước ít nhất 24 giờ');
 if(!hasCustomCake&&minRegularHours>0&&+requested-+now<minRegularHours*60*60*1000)throw Error('Bánh thường cần đặt trước ít nhất 2 giờ');
 return requested;
}
// Export cũ giữ cho tích hợp lịch sử; không còn tự đặt giờ 14:00.
export function estimatedTimeForDate(value,now=new Date(),time=''){
 try{return validateRequestedAt(value,time,{now});}catch{return null;}
}
export async function calculateOrder(input){
 if(isSupabaseMode())return backendQuote(input);
 const source=Array.isArray(input.items)?input.items:getCart();if(!source.length)throw Error('Giỏ hàng trống');
 let subtotal=0;const lines=[];
 for(const row of source){
  const id=String(row.productId||row.itemId||'');const product=await getById(id);const quantity=Number(row.quantity);
  if(!product||product.status==='inactive')throw Error('Sản phẩm không còn tồn tại: '+id);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Số lượng không hợp lệ');
  if(!product.isCustomizable&&Number.isFinite(product.stockQuantity)&&quantity>product.stockQuantity)throw Error('Không đủ tồn kho: '+product.name);
  if(product.isCustomizable&&!row.customCakeId)throw Error('Thiếu cấu hình bánh tùy chỉnh');
  let unitPrice=Number(product.price),customization=null;
  if(product.isCustomizable){
   const cake=getCustomCakeById(row.customCakeId);
   if(!cake)throw Error('Không tìm thấy cấu hình bánh tùy chỉnh');
   const response=await fetch('data/cake-options.json');if(!response.ok)throw Error('Không tải được cấu hình giá bánh');
   const opt=await response.json();const find=(set,id)=>set.find(x=>String(x.id)===String(id));
   const size=find(opt.sizes,cake.sizeId),flavor=find(opt.flavors,cake.flavorId),cream=find(opt.creams,cake.creamId);
   const font=find(opt.fonts,cake.fontId),color=find(opt.textColors,cake.colorId);
   if(!size||!flavor||!cream||!font||!color)throw Error('Cấu hình bánh không hợp lệ');
   unitPrice=Number(size.price)+Number(flavor.priceModifier||0)+Number(cream.priceModifier||0);
   customization={customCakeId:cake.id,sizeId:cake.sizeId,flavorId:cake.flavorId,creamId:cake.creamId,fontId:cake.fontId,colorId:cake.colorId,text:String(cake.text||''),estimatedPrice:unitPrice};
  }else if(product.price==null||product.price===''||!Number.isSafeInteger(unitPrice)||unitPrice<=0){throw Error('Chưa xác nhận giá: '+product.name);}
  if(!Number.isSafeInteger(unitPrice)||unitPrice<0)throw Error('Giá sản phẩm không hợp lệ');
  const lineTotal=unitPrice*quantity;subtotal+=lineTotal;
  lines.push({product_id:id,product_name_snapshot:product.name,category_id:product.categoryId||null,unit_price:unitPrice,quantity,subtotal:lineTotal,customization_data:customization});
 }
 const promotion=await getAutomaticPromotion(lines.map(line=>({productId:line.product_id,categoryId:line.category_id,unitPrice:line.unit_price,quantity:line.quantity})));
 const discount=promotion.discount,delivery=input.fulfillmentType==='delivery';let shippingFee=0,shippingDistance=null;
 if(delivery){
  if(input.mapLat==null||input.mapLng==null)throw Error('Vui lòng chọn vị trí giao hàng để xác định phí');
  const quote=await quoteShipping(input.mapLat,input.mapLng);
  if(!quote.supported)throw Error('Địa chỉ nằm ngoài phạm vi giao hàng đã cấu hình');
  shippingFee=quote.fee;shippingDistance=quote.distanceKm;
 }
 return {items:lines,subtotal,discountAmount:discount,shippingFee,totalAmount:Math.max(0,subtotal-discount+shippingFee),promotionId:promotion.promotionId,shippingDistance};
}
const createInFlight=new Map();
async function createOnlineOrder(body){
 const member=getCurrentMember();
 if(!member?.contactId||member.role!=='customer')throw Error('Vui lòng đăng nhập bằng tài khoản khách hàng trước khi đặt online');
 const requestId=String(body.requestId||'').trim();
 if(requestId){
  const existing=getOrders().find(order=>order.client_request_id===requestId&&order.customer_id===member.contactId);
  if(existing)return {success:true,orderId:existing._id,orderCode:existing.order_code,totalAmount:existing.total_amount,order:existing,items:existing.items||[]};
 }
 const customerName=String(body.customerName||body.name||'').trim(),phone=normalizePhone(body.customerPhone||body.phone);
 if(!customerName)throw Error('Vui lòng nhập tên người nhận');if(!phone)throw Error('Số điện thoại không hợp lệ (10 chữ số)');
 const fulfillmentType=body.fulfillmentType==='pickup'?'pickup':'delivery';
 if(fulfillmentType==='delivery'&&!String(body.deliveryAddress||body.address||'').trim())throw Error('Vui lòng nhập địa chỉ giao hàng');
 const paymentMethod=String(body.paymentMethod||body.payment_method||'');
 if(!['bank_transfer_demo'].includes(paymentMethod))throw Error('Vui lòng chọn phương thức thanh toán demo');
 const date=String(body.deliveryDate||''),time=String(body.deliveryTime||'');
 const amounts=await calculateOrder({...body,fulfillmentType});
 const requestedAt=validateRequestedAt(date,time,{hasCustomCake:amounts.items.some(item=>!!item.customization_data)});
 if(getCurrentMember()?.contactId!==member.contactId)throw Error('Phiên đăng nhập đã thay đổi; vui lòng thử lại');
 const previous=getOrders(),used=new Set(previous.map(order=>order.order_code));let orderCode;
 for(let i=0;i<9000;i++){const n=1000+Math.floor(Math.random()*9000);const code=`ORD-${new Date().getFullYear()}-${n}`;if(!used.has(code)){orderCode=code;break;}}
 if(!orderCode)throw Error('Không thể cấp mã đơn hàng, vui lòng thử lại');
 const id=crypto.randomUUID(),createdAt=new Date().toISOString(),requestedIso=requestedAt.toISOString();
 const address=fulfillmentType==='pickup'?'Nhận tại cửa hàng':String(body.deliveryAddress||body.address);
 const record={
  _id:id,id,title:orderCode,order_code:orderCode,orderCode,client_request_id:requestId||null,
  customer_id:member.contactId,customerName,ship_recipient:customerName,customerPhone:phone,ship_phone:phone,
  fulfillmentType,deliveryAddress:address,ship_address:address,ship_ward:body.ward||'',ship_district:body.district||'',ship_city:'Thành phố Hồ Chí Minh',
  deliveryDate:date,deliveryTime:time,requested_at:requestedIso,estimatedTime:requestedIso,notes:String(body.notes||''),
  couponCode:'',voucher_code:'',promotion_id:amounts.promotionId,subtotal:amounts.subtotal,
  discount_amount:amounts.discountAmount,discountAmount:amounts.discountAmount,shipping_fee:amounts.shippingFee,shippingFee:amounts.shippingFee,
  total_amount:amounts.totalAmount,totalAmount:amounts.totalAmount,order_status:'pending',status:'pending',
  payment_method:paymentMethod,payment_status:paymentMethod==='bank_transfer_demo'?'pending':'unpaid',created_at:createdAt,
  itemsList:JSON.stringify(amounts.items),items:amounts.items
 };
 const lineRows=amounts.items.map((item,index)=>({_id:crypto.randomUUID(),order_id:id,order_item_id:`${id}:${index+1}`,...item}));
 // localStorage không có giao dịch nhiều key: order tự giữ snapshot đầy đủ, orderItems là read model.
 if(!setJSON(ORDER_KEY,[...previous,record]))throw Error('Không thể lưu đơn hàng');
 setJSON(ORDER_ITEMS_KEY,[...getOrderItems(),...lineRows]);clearCart();
 return {success:true,orderId:id,orderCode,totalAmount:record.totalAmount,order:record,items:lineRows};
}
export async function createOrder(body={}){
 if(isSupabaseMode())return backendCreateOrder(body);
 const requestId=String(body.requestId||'').trim();
 const member=getCurrentMember();
 const key=member?.contactId&&requestId?JSON.stringify([member.contactId,requestId]):null;
 if(key&&createInFlight.has(key))return createInFlight.get(key);
 const task=createOnlineOrder(body);
 if(!key)return task;
 createInFlight.set(key,task);
 try{return await task;}finally{if(createInFlight.get(key)===task)createInFlight.delete(key);}
}
async function backendRequest(body){
 const source=Array.isArray(body.items)?body.items:getCart();
 if(!source.length)throw Error('Giỏ hàng trống');
 const fulfillment=body.fulfillmentType||'pickup';
 if(fulfillment==='delivery'&&(!body.deliveryProofId||!body.requestId||!String(body.deliveryAddress||'').trim()))throw Error('Vui lòng xác minh địa chỉ giao hàng trước khi xem báo giá.');
 const requested=validateRequestedAt(body.deliveryDate,body.deliveryTime,{hasCustomCake:source.some(row=>!!row.customCakeId),minRegularHours:2});
 const items=[];
 for(const row of source){
  const product=await getById(row.productId||row.itemId);
  if(!product?.backendId)throw Error('Sản phẩm trong giỏ chưa có mapping trên backend: '+(row.productId||row.itemId));
  const line={product_id:product.backendId,quantity:Number(row.quantity)};
  if(row.variantId){
   const client=await getSupabaseClient();
   const base=client.from('product_variants').select('id').eq('product_id',product.backendId);
   const lookup=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(row.variantId))?base.or(`id.eq.${row.variantId},source_id.eq.${row.variantId}`):base.eq('source_id',String(row.variantId));
   const {data,error}=await lookup.maybeSingle();
   if(error||!data)throw backendError(error||Error('Biến thể chưa được mapping trên backend.'));
   line.variant_id=data.id;
  }
  if(product.isCustomizable){
   const cake=getCustomCakeById(row.customCakeId);
   if(!cake)throw Error('Không tìm thấy bản nháp bánh tùy chỉnh.');
   const options=await getOptions();
   const fields={size:'sizeId',flavor:'flavorId',cream:'creamId',font:'fontId',color:'colorId'};
   const buckets={size:'sizes',flavor:'flavors',cream:'creams',font:'fonts',color:'textColors'};
   line.customization={text:cake.text||''};
   for(const [role,field] of Object.entries(fields)){
    const option=options[buckets[role]].find(value=>value.id===cake[field]||value.sourceKey===cake[field]);
    if(!option)throw Error('Tùy chọn bánh chưa được mapping trên backend: '+role);
    line.customization[role+'_id']=option.id;
   }
  }
  items.push(line);
 }
 const points=Number(body.pointsUsed??0);
 if(!Number.isSafeInteger(points)||points<0)throw Error('Số điểm sử dụng phải là số nguyên không âm.');
 const request={items,fulfillment_type:fulfillment,requested_at:requested.toISOString(),points_used:points};
 if(fulfillment==='delivery'){
  request.delivery_proof_id=body.deliveryProofId;
  request.request_id=body.requestId;
  request.ship_address=String(body.deliveryAddress).trim();
 }
 return request;
}
async function backendQuote(body){
 const request=await backendRequest(body);
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('quote_order',{p_request:request});
 if(error)throw backendError(error);
 return {items:data.items,subtotal:data.subtotal,discountAmount:data.discount_amount,pointsDiscountAmount:data.points_discount_amount,shippingFee:data.shipping_fee,shippingDistance:data.shipping_distance_km,totalAmount:data.total_amount,promotionId:data.promotion_id,pointsUsed:data.points_used};
}
async function backendCreateOrder(body){
 const member=getCurrentMember();
 if(!member||member.role!=='customer')throw Error('Vui lòng đăng nhập bằng tài khoản Customer trước khi đặt online.');
 const requestId=String(body.requestId||'').trim();
 if(!requestId)throw Error('Thiếu mã yêu cầu đặt hàng.');
 const name=String(body.customerName||'').trim(),phone=normalizePhone(body.customerPhone);
 if(!name||!phone)throw Error('Vui lòng nhập tên và số điện thoại người nhận hợp lệ.');
 const method=String(body.paymentMethod||'');
 if(!['bank_transfer_demo','vnpay'].includes(method))throw Error('Phương thức thanh toán không hợp lệ.');
 const request={...await backendRequest(body),request_id:requestId,payment_method:method,recipient_name:name,recipient_phone:phone,notes:String(body.notes||'')};
 const client=await getSupabaseClient();
 const {data,error}=await client.rpc('create_online_order',{p_request:request});
 if(error)throw backendError(error);
 if(method!=='vnpay')clearCart();
 return {success:true,orderId:data.order_id,orderCode:data.order_code,totalAmount:data.total_amount,order:data};
}
export const orderService={createOrder,calculateOrder,getOrders,getOrderItems,getOrderByCode,normalizePhone,estimatedTimeForDate,validateRequestedAt};
