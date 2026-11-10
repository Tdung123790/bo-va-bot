import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from 'pg';
import {localDbPassword} from './local-db-password.mjs';

const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const configPath=value('--config');
if(!configPath)throw Error('Cần --config <file JSON> chứa dữ liệu cửa hàng đã phê duyệt.');
const source=JSON.parse(await fs.readFile(path.resolve(configPath),'utf8'));
if(!source.approvalReference||!source.approvedBy)throw Error('Thiếu approvalReference hoặc approvedBy.');
const hoursPattern=/^([01]\d|2[0-3]):[0-5]\d$/;
function validateHours(hours,name){
 if(hours===null)return;
 if(!hours||Array.isArray(hours)||typeof hours!=='object')throw Error(name+' phải là object theo ngày 1–7 hoặc null.');
 for(const [day,periods] of Object.entries(hours)){
  if(!/^[1-7]$/.test(day)||!Array.isArray(periods))throw Error(name+' có ngày không hợp lệ.');
  for(const period of periods){
   if(!hoursPattern.test(period.start)||!hoursPattern.test(period.end)||period.start>=period.end)throw Error(name+' có khoảng giờ không hợp lệ.');
  }
 }
}
const payload={pickup_hours:source.pickupHours??null,delivery_hours:source.deliveryHours??null,
 bakery_lat:source.bakeryLat??null,bakery_lng:source.bakeryLng??null,
 service_area:source.serviceArea??null,shipping_tiers:source.shippingTiers??null};
validateHours(payload.pickup_hours,'pickupHours');
validateHours(payload.delivery_hours,'deliveryHours');
if(!payload.pickup_hours||!Object.values(payload.pickup_hours).some(periods=>periods.length))throw Error('Cần giờ nhận bánh được phê duyệt; không mặc định 24/7.');
if((payload.bakery_lat===null)!==(payload.bakery_lng===null))throw Error('Tọa độ cửa hàng phải có cả latitude và longitude hoặc cùng null.');
if(payload.bakery_lat!==null&&(!Number.isFinite(Number(payload.bakery_lat))||Math.abs(Number(payload.bakery_lat))>90||!Number.isFinite(Number(payload.bakery_lng))||Math.abs(Number(payload.bakery_lng))>180))throw Error('Tọa độ cửa hàng không hợp lệ.');
if(payload.shipping_tiers!==null&&(!Array.isArray(payload.shipping_tiers)||payload.shipping_tiers.some(tier=>!Number.isFinite(Number(tier.max_km))||!Number.isSafeInteger(Number(tier.fee))||Number(tier.fee)<0)))throw Error('Bảng phí giao không hợp lệ.');
if(payload.service_area!==null&&(!Number.isFinite(Number(payload.service_area.max_km))||Number(payload.service_area.max_km)<=0))throw Error('Vùng giao không hợp lệ.');
const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
console.log(`Store config SHA-256: ${hash}; pickup days: ${Object.keys(payload.pickup_hours).length}; delivery remains blocked by RPC.`);
if(!flag('--apply'))process.exit(0);
assert.equal(value('--confirm-hash'),hash,'--confirm-hash phải khớp cấu hình đã dry-run');
const operator=String(value('--operator')||'').trim();if(operator.length<3)throw Error('Cần --operator để ghi audit.');
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query('begin');
 await db.query('select pg_advisory_xact_lock($1::bigint)',[4000044001]);
 const previous=(await db.query("select bakery_lat, bakery_lng, pickup_hours, delivery_hours, service_area, shipping_tiers from public.store_settings where store_key='main' for update")).rows[0]||null;
 const values=[payload.bakery_lat,payload.bakery_lng,payload.pickup_hours,payload.delivery_hours,payload.service_area,payload.shipping_tiers===null?null:JSON.stringify(payload.shipping_tiers)];
 const same=previous&&(await db.query(`select bakery_lat is not distinct from $1::numeric and bakery_lng is not distinct from $2::numeric
   and pickup_hours is not distinct from $3::jsonb and delivery_hours is not distinct from $4::jsonb
   and service_area is not distinct from $5::jsonb and shipping_tiers is not distinct from $6::jsonb as same
   from public.store_settings where store_key='main'`,values)).rows[0].same;
 if(same){
  await db.query('rollback');console.log('NO CHANGE: store settings already match.');
 }else{
  await db.query(`insert into public.store_settings(store_key,bakery_lat,bakery_lng,pickup_hours,delivery_hours,service_area,shipping_tiers)
    values('main',$1,$2,$3,$4,$5,$6) on conflict(store_key) do update set
    bakery_lat=excluded.bakery_lat,bakery_lng=excluded.bakery_lng,pickup_hours=excluded.pickup_hours,
    delivery_hours=excluded.delivery_hours,service_area=excluded.service_area,shipping_tiers=excluded.shipping_tiers,updated_at=now()`,
   values);
  await db.query(`insert into public.audit_log(actor_type,action,entity_type,entity_id,old_value,new_value)
    values('system','store_settings_local_approved','store_settings','00000000-0000-0000-0000-000000000001',$1,$2)`,
   [previous,{...payload,operator,approvalReference:source.approvalReference,approvedBy:source.approvedBy}]);
  await db.query('commit');console.log('PASS: approved store settings applied to local database with audit.');
 }
}catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{await db.end();}
