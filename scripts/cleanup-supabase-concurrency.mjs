import {Client} from 'pg';
import {localDbPassword} from './local-db-password.mjs';

const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',database:'postgres',password:localDbPassword()});
const users=['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','aaaaaaaa-ffff-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-ffff-4bbb-8bbb-bbbbbbbbbbb2'];
const products=['99999999-9999-4999-8999-999999999999','99999999-aaaa-4999-8999-999999999999'];
try{
 await db.connect();
 await db.query('begin');
 const checks=[
  ['auth.users',`id::text = any($1) and email like 'sprint2-%@example.invalid'`,[users]],
  ['public.profiles','id::text = any($1)',[users]],
  ['public.categories',`id::text = '88888888-8888-4888-8888-888888888888'`,[]],
  ['public.products','id::text = any($1)',[products]],
  ['public.promotions',`id::text = '44444444-aaaa-4444-8444-444444444444'`,[]],
  ['public.orders',`customer_id::text = any($1) and client_request_id = any($2)`,[users,['race-a','race-b','promo-a','promo-b','promo-reuse']]],
  ['public.store_settings',`store_key = 'main'`,[]]
 ];
 for(const [table,predicate,params] of checks){
  const result=await db.query(`select count(*)::int as count from ${table} where not (${predicate})`,params);
  if(result.rows[0].count)throw Error(`NON_FIXTURE_DATA_FOUND: ${table}`);
 }
 for(const table of ['product_variants','customization_categories','customization_options','wishlist_items','reviews']){
  const result=await db.query(`select count(*)::int as count from public.${table}`);
  if(result.rows[0].count)throw Error(`NON_FIXTURE_DATA_FOUND: ${table}`);
 }
 const orderIds=(await db.query(`select id from public.orders where customer_id::text = any($1)`,[users])).rows.map(row=>row.id);
 for(const table of ['order_items','order_status_history','payments']){
  const result=await db.query(`select count(*)::int as count from public.${table} where order_id <> all($1::uuid[])`,[orderIds]);
  if(result.rows[0].count)throw Error(`NON_FIXTURE_DATA_FOUND: ${table}`);
 }
 for(const table of ['loyalty_accounts','loyalty_transactions']){
  const result=await db.query(`select count(*)::int as count from public.${table} where customer_id::text <> all($1)`,[users]);
  if(result.rows[0].count)throw Error(`NON_FIXTURE_DATA_FOUND: ${table}`);
 }
 const audit=await db.query(`select count(*)::int as count from public.audit_log where actor_user_id is null or actor_user_id::text <> all($1) or entity_id <> all($2::uuid[])`,[users,orderIds]);
 if(audit.rows[0].count)throw Error('NON_FIXTURE_DATA_FOUND: audit_log');
 const analytics=(await db.query(`select day::text,sales_channel,total_orders,completed_orders,cancelled_orders,gross_product_sales,promotion_discount,points_redeemed_amount,product_refunded_amount,net_product_revenue,shipping_collected,shipping_refunded,average_product_order_value,new_customers,returning_customers from public.daily_analytics`)).rows;
 const cancelledDay=(await db.query(`select (cancelled_at at time zone 'Asia/Ho_Chi_Minh')::date::text as day from public.orders where customer_id::text = any($1) and cancelled_at is not null limit 1`,[users])).rows[0]?.day;
 if(analytics.length>1||analytics.some(row=>row.day!==cancelledDay||row.sales_channel!=='online'||Number(row.total_orders)!==4||Number(row.cancelled_orders)!==1||Object.entries(row).some(([key,value])=>!['day','sales_channel','total_orders','cancelled_orders'].includes(key)&&Number(value)!==0)))throw Error('NON_FIXTURE_DATA_FOUND: daily_analytics');
 await db.query(`delete from public.audit_log where entity_id = any($1::uuid[]) and actor_user_id::text = any($2)`,[orderIds,users]);
 if(analytics.length)await db.query(`delete from public.daily_analytics where day=$1 and sales_channel='online'`,[cancelledDay]);
 await db.query(`delete from public.loyalty_transactions where customer_id::text = any($1)`,[users]);
 for(const table of ['payments','order_status_history','order_items']){
  await db.query(`delete from public.${table} where order_id = any($1::uuid[])`,[orderIds]);
 }
 await db.query(`delete from public.orders where id = any($1::uuid[])`,[orderIds]);
 await db.query(`delete from public.loyalty_accounts where customer_id::text = any($1)`,[users]);
 await db.query(`delete from public.promotions where id='44444444-aaaa-4444-8444-444444444444'`);
 await db.query(`delete from public.products where id::text = any($1)`,[products]);
 await db.query(`delete from public.categories where id='88888888-8888-4888-8888-888888888888'`);
 await db.query(`delete from public.store_settings where store_key='main'`);
 await db.query(`delete from public.profiles where id::text = any($1)`,[users]);
 await db.query(`delete from auth.users where id::text = any($1)`,[users]);
 await db.query('commit');
 console.log('PASS: only confirmed concurrency TEST fixture removed from LOCAL database');
}catch(error){
 await db.query('rollback').catch(()=>{});
 throw error;
}finally{
 await db.end().catch(()=>{});
}
