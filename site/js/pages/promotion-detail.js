import {getById} from '../services/promotionService.js';
import {formatDateRange,promoImage,usePromoImageFallback} from './promotions-utils.js';
import {el} from '../core/dom.js';

async function init(){
  const root=document.querySelector('#promotion-detail');
  const id=new URLSearchParams(location.search).get('id');
  if(!id){root.replaceChildren(el('p',{text:'Thiếu mã ưu đãi. Hãy quay lại danh sách chương trình.'}));return;}
  try{
    const promotion=await getById(id);
    if(!promotion){root.replaceChildren(el('p',{text:'Không tìm thấy chương trình ưu đãi này.'}));return;}
    const info=el('div',{className:'promo-detail__info'});
    info.append(el('h1',{text:promotion.title||'Ưu đãi'}));
    const notices={active:'Chương trình đang áp dụng tự động khi đơn hàng đủ điều kiện. Ưu đãi thực tế do hệ thống xác định tại Checkout.',ended:'Chương trình đã kết thúc và không còn áp dụng khi đặt hàng.',upcoming:'Chương trình chưa bắt đầu và chưa áp dụng khi đặt hàng.',unavailable:'Thông tin chương trình được lưu để tham khảo. Chương trình chưa được kích hoạt trên hệ thống đặt hàng.'};
    info.append(el('p',{className:'promo-detail__availability',text:notices[promotion.availability]||notices.unavailable}));
    if(promotion.discountDetails){
      const details=promotion.discountDetails.replace(/Nhập mã:.*$/i,'Nếu chương trình còn hiệu lực và đủ điều kiện, hệ thống sẽ tự xét ưu đãi khi đặt hàng.');
      info.append(el('p',{className:'promo-detail__discount',text:details}));
    }
    const range=formatDateRange(promotion.startDate,promotion.endDate);
    if(range)info.append(el('p',{className:'promo-detail__date',text:range}));
    if(promotion.description)info.append(el('p',{className:'promo-detail__description',text:promotion.description}));
    const media=el('div',{className:'promo-detail__media'});
    const img=el('img',{src:promoImage(promotion),alt:promotion.title||'Ảnh ưu đãi',loading:'eager'});
    usePromoImageFallback(img);
    media.append(el('div',{className:'promo-detail__layer promo-detail__layer--back'}),el('div',{className:'promo-detail__layer promo-detail__layer--front'}),img);
    root.replaceChildren(info,media);
  }catch(error){
    console.error(error);
    root.replaceChildren(el('p',{text:'Không thể tải chi tiết ưu đãi.'}));
  }
}
init();
