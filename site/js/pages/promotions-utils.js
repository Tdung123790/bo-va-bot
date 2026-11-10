const WIX_PROMOTION_FALLBACK='https://static.wixstatic.com/media/fb1c19_9a48be6fd0aa46a5bc781a1c5f894ba3~mv2.png?originWidth=576&originHeight=448';

export function formatDateRange(start,end){
  const fmt=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'});
  function one(value){
    if(!value)return '';
    const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00+07:00':value);
    return Number.isNaN(date.getTime())?'':fmt.format(date);
  }
  return [one(start),one(end)].filter(Boolean).join(' – ');
}

export function promoImage(p){return /^https:\/\//i.test(p.bannerImage||'')?p.bannerImage:WIX_PROMOTION_FALLBACK;}

export function usePromoImageFallback(img){
  img.addEventListener('error',()=>{
    if(img.getAttribute('src')!==WIX_PROMOTION_FALLBACK){img.src=WIX_PROMOTION_FALLBACK;return;}
    img.hidden=true;
  });
}
