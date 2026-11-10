import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--manifest');
const file=index<0?path.join(root,'reference/production/store-approval.json'):path.resolve(process.argv[index+1]);
const source=JSON.parse(await fs.readFile(file,'utf8'));
if(source.environment!=='production'||source.timezone!=='Asia/Ho_Chi_Minh'||source.customCakeLeadHours!==24)throw Error('Store manifest sai môi trường/timezone/lead time đã duyệt.');
const approved=source.reviewState==='APPROVED'&&source.approvalReference&&source.approvedBy&&Number.isFinite(Date.parse(source.approvedAt))&&!/\b(TEST|DEMO)\b/i.test(`${source.approvalReference} ${source.approvedBy}`);
const validHours=hours=>hours&&typeof hours==='object'&&!Array.isArray(hours)&&Object.keys(hours).every(day=>/^[1-7]$/.test(day)&&Array.isArray(hours[day])&&hours[day].every(period=>/^([01]\d|2[0-3]):[0-5]\d$/.test(period.start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(period.end)&&period.start<period.end));
const pickupReady=Boolean(approved&&source.storeName?.trim()&&source.address?.trim()&&validHours(source.pickupHours)&&Object.values(source.pickupHours).some(periods=>periods.length));
const deliveryConfigReady=Boolean(pickupReady&&validHours(source.deliveryHours)&&source.bakeryLat!==null&&source.bakeryLng!==null&&Number.isFinite(Number(source.bakeryLat))&&Number.isFinite(Number(source.bakeryLng))&&source.serviceArea&&Array.isArray(source.shippingTiers)&&source.shippingTiers.length);
const result={environment:'production',approval:approved?'APPROVED':'PENDING_APPROVAL',pickup:pickupReady?'CONFIG_READY':'BLOCKED',delivery:deliveryConfigReady?'CONFIG_READY_BUT_VERIFICATION_NOT_IMPLEMENTED':'BLOCKED',deliveryCheckout:'BLOCKED',missing:[]};
for(const key of ['storeName','address','pickupHours','deliveryHours','bakeryLat','bakeryLng','serviceArea','shippingTiers'])if(source[key]===null||source[key]===undefined||source[key]==='')result.missing.push(key);
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--require-pickup')&&!pickupReady)throw Error('BLOCKED: production pickup chưa có giờ/cửa hàng được phê duyệt.');
if(process.argv.includes('--require-delivery'))throw Error('BLOCKED: chưa có backend xác minh địa chỉ delivery được phê duyệt.');
