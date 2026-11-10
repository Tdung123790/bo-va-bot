const vnd=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
export function formatVND(amount){const n=Number(amount);return vnd.format(Number.isFinite(n)?n:0);}
export function formatDate(value,options={day:'2-digit',month:'2-digit',year:'numeric'}){if(!value)return '';const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',...options}).format(d);}
export function formatOrderItem(item){
 const name=item.product_name_snapshot||item.name||item.productName||'Bánh';
 const base=`${name} (x${item.quantity||1})`;
 const data=item.customization_data;
 if(!data||typeof data!=='object')return base;
 const labels={size:'Kích thước',flavor:'Cốt bánh',cream:'Kem phủ',font:'Font chữ',color:'Màu chữ'};
 const parts=Object.entries(labels).map(([key,label])=>data[key]?.name?`${label}: ${data[key].name}`:null).filter(Boolean);
 if(data.text)parts.push(`Lời chúc: “${data.text}”`);
 return parts.length?`${base} · ${parts.join(' · ')}`:base;
}
