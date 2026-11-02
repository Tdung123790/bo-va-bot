const vnd=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
export function formatVND(amount){const n=Number(amount);return vnd.format(Number.isFinite(n)?n:0);}
export function formatDate(value,options={day:'2-digit',month:'2-digit',year:'numeric'}){if(!value)return '';const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',...options}).format(d);}
