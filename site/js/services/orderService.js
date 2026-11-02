import {getJSON,setJSON} from '../core/storage.js';
import {getCart,clearCart} from './cartService.js';
import {getById} from './productService.js';
import {validateCoupon} from './promotionService.js';
import {quoteShipping} from './shippingService.js';
import {getCurrentMember} from './authService.js';
export const ORDER_KEY='bobot:v1:orders';
export const ORDER_ITEMS_KEY='bobot:v1:orderItems';
export function normalizePhone(value){let phone=String(value||'').replace(/[\s.\-]/g,'');if(phone.startsWith('+84'))phone='0'+phone.slice(3);else if(phone.startsWith('84'))phone='0'+phone.slice(2);return /^0\d{9}$/.test(phone)?phone:null;}
export function getOrders(){const x=getJSON(ORDER_KEY,[]);return Array.isArray(x)?x:[];}
export function getOrderItems(){const x=getJSON(ORDER_ITEMS_KEY,[]);return Array.isArray(x)?x:[];}
export function getOrderByCode(code){return getOrders().find(x=>x.order_code===code||x.orderCode===code)||null;}
export function estimatedTimeForDate(value,now=new Date()){
 if(!value)return null;const requested=new Date(value+'T00:00:00');if(!Number.isFinite(+requested))return null;
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());const diff=Math.round((requested-today)/86400000);if(diff<0||diff>30)return null;
 if(diff===0){const end=new Date(now.getTime()+180*60000);if(end.getHours()>=20)return null;return end;}const future=new Date(requested);future.setHours(14,0,0,0);return future;
}
export async function calculateOrder(input){
 const source=Array.isArray(input.items)?input.items:getCart();if(!source.length)throw Error('Giỏ hàng trống');
 let subtotal=0;const lines=[];
 for(const row of source){const id=String(row.productId||row.itemId||'');const product=await getById(id);const quantity=Number(row.quantity);if(!product||product.status==='inactive')throw Error('Sản phẩm không còn tồn tại: '+id);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Số lượng không hợp lệ');if(Number.isFinite(product.stockQuantity)&&quantity>product.stockQuantity)throw Error('Không đủ tồn kho: '+product.name);
 if(product.isCustomizable&&!row.customCakeId)throw Error('Thiếu cấu hình bánh tùy chỉnh');
 // Giá tùy chỉnh chỉ có thể được xác minh từ cấu hình đã duyệt; không tin đơn giá gửi từ client.
 let unitPrice=Number(product.price);if(product.isCustomizable){const conf=getJSON('bobot:v1:customCakes',[]);const cake=Array.isArray(conf)?conf.find(c=>c.id===row.customCakeId):null;if(!cake)throw Error('Không tìm thấy cấu hình bánh tùy chỉnh');const opt=await fetch('data/cake-options.json').then(r=>r.json());const find=(set,id)=>set.find(x=>String(x.id)===String(id));const s=find(opt.sizes,cake.sizeId),f=find(opt.flavors,cake.flavorId),c=find(opt.creams,cake.creamId);if(!s||!f||!c)throw Error('Cấu hình bánh không hợp lệ');unitPrice=Number(s.price)+Number(f.priceModifier||0)+Number(c.priceModifier||0);}
 if(!Number.isSafeInteger(unitPrice)||unitPrice<0)throw Error('Giá sản phẩm không hợp lệ');const lineTotal=unitPrice*quantity;subtotal+=lineTotal;lines.push({product_id:id,product_name_snapshot:product.name,unit_price:unitPrice,quantity,subtotal:lineTotal,customization_data:row.customCakeId?{customCakeId:row.customCakeId}:null});}
 const coupon=input.couponCode?await validateCoupon(input.couponCode,subtotal):null;
 if(input.couponCode&&!coupon?.isValid)throw Error(coupon?.message||'Mã giảm giá không hợp lệ');
 const discount=coupon?.discount||0,delivery=input.fulfillmentType==='delivery';let shippingFee=0,shippingDistance=null;
 if(delivery){if(input.mapLat!=null&&input.mapLng!=null){const quote=await quoteShipping(input.mapLat,input.mapLng);shippingFee=quote.fee;shippingDistance=quote.distanceKm;if(!quote.supported)throw Error('Địa chỉ nằm ngoài phạm vi giao hàng 10 km');}else shippingFee=20000;}
 return {items:lines,subtotal,discountAmount:discount,shippingFee,totalAmount:Math.max(0,subtotal-discount+shippingFee),promotionId:coupon?.promotionId||null,shippingDistance};
}
export async function createOrder(body={}){
 const customerName=String(body.customerName||body.name||'').trim(),phone=normalizePhone(body.customerPhone||body.phone);if(!customerName)throw Error('Vui lòng nhập tên người nhận');if(!phone)throw Error('Số điện thoại không hợp lệ (10 chữ số)');const fulfillmentType=body.fulfillmentType==='pickup'?'pickup':'delivery';if(fulfillmentType==='delivery'&&!String(body.deliveryAddress||body.address||'').trim())throw Error('Vui lòng nhập địa chỉ giao hàng');
 const date=body.deliveryDate?String(body.deliveryDate).slice(0,10):'';const estimated=estimatedTimeForDate(date);if(!estimated)throw Error('Ngày nhận bánh không hợp lệ hoặc đã quá giờ phục vụ');
 const amounts=await calculateOrder({...body,fulfillmentType});const previous=getOrders();const used=new Set(previous.map(x=>x.order_code));let orderCode;for(let i=0;i<9000;i++){const n=1000+Math.floor(Math.random()*9000);const code=`ORD-${new Date().getFullYear()}-${n}`;if(!used.has(code)){orderCode=code;break;}}if(!orderCode)throw Error('Không thể cấp mã đơn hàng, vui lòng thử lại');
 const id=crypto.randomUUID(),createdAt=new Date().toISOString();const record={_id:id,id,title:orderCode,order_code:orderCode,orderCode,customer_id:getCurrentMember()?.contactId||null,customerName,ship_recipient:customerName,customerPhone:phone,ship_phone:phone,fulfillmentType,deliveryAddress:fulfillmentType==='pickup'?'Nhận tại cửa hàng':String(body.deliveryAddress||body.address),ship_address:fulfillmentType==='pickup'?'Nhận tại cửa hàng':String(body.deliveryAddress||body.address),ship_ward:body.ward||'',ship_district:body.district||'',ship_city:'Thành phố Hồ Chí Minh',deliveryDate:date,estimatedTime:estimated.toISOString(),notes:String(body.notes||''),couponCode:body.couponCode||'',voucher_code:body.couponCode||'',promotion_id:amounts.promotionId,subtotal:amounts.subtotal,discount_amount:amounts.discountAmount,discountAmount:amounts.discountAmount,shipping_fee:amounts.shippingFee,shippingFee:amounts.shippingFee,total_amount:amounts.totalAmount,totalAmount:amounts.totalAmount,order_status:'pending',status:'pending',payment_status:'UNPAID',created_at:createdAt,itemsList:JSON.stringify(amounts.items),items:amounts.items};
 const lineRows=amounts.items.map((item,index)=>({_id:crypto.randomUUID(),order_id:id,order_item_id:`${id}:${index+1}`,...item}));
 // localStorage không hỗ trợ transaction nhiều key: lưu items trong chính order làm nguồn sự thật, key phụ chỉ là read model.
 if(!setJSON(ORDER_KEY,[...previous,record]))throw Error('Không thể lưu đơn hàng');setJSON(ORDER_ITEMS_KEY,[...getOrderItems(),...lineRows]);clearCart();return {success:true,orderId:id,orderCode,totalAmount:record.totalAmount,order:record,items:lineRows};
}
export const orderService={createOrder,calculateOrder,getOrders,getOrderItems,getOrderByCode,normalizePhone,estimatedTimeForDate};
