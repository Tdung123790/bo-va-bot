export const ORDER_STATUS=['pending','confirmed','preparing','shipping','completed','cancelled'];
export const ORDER_STATUS_LABEL={pending:'Chờ xác nhận',confirmed:'Đã xác nhận',preparing:'Đang làm bánh',shipping:'Đang giao hàng',completed:'Hoàn tất',cancelled:'Đã hủy'};
const LEGACY={'Chờ xử lý':'pending','Chờ xác nhận':'pending','Đã xác nhận':'confirmed','Đang làm bánh':'preparing','Đang giao hàng':'shipping','Đang giao':'shipping','Hoàn tất':'completed','Đã hủy':'cancelled',processing:'preparing',shipped:'shipping'};
export function normalizeOrderStatus(value){return LEGACY[value]||ORDER_STATUS.includes(value)?(LEGACY[value]||value):'pending';}
export function getNextStatus(current,fulfillment='delivery'){const flow=fulfillment==='pickup'?['pending','confirmed','preparing','completed']:['pending','confirmed','preparing','shipping','completed'];const index=flow.indexOf(normalizeOrderStatus(current));return index<0||index===flow.length-1?null:flow[index+1];}
export function getFlow(type='delivery'){return type==='pickup'?['pending','confirmed','preparing','completed']:['pending','confirmed','preparing','shipping','completed'];}
