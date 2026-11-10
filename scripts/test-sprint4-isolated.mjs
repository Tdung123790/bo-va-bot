import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';

const dbUrl=new URL(process.env.BOBOT_S4_DISPOSABLE_DB_URL||'postgresql://invalid/');
const apiUrl=new URL(process.env.BOBOT_S4_DISPOSABLE_API_URL||'http://invalid/');
const publishableKey=process.env.BOBOT_S4_DISPOSABLE_PUBLISHABLE_KEY;
const serviceKey=process.env.BOBOT_S4_DISPOSABLE_SERVICE_KEY;
assert.equal(dbUrl.hostname,'127.0.0.1');
assert.equal(dbUrl.port,'55322');
assert.equal(dbUrl.pathname,'/postgres');
assert.equal(apiUrl.hostname,'127.0.0.1');
assert.equal(apiUrl.port,'55321');
assert.ok(publishableKey&&serviceKey);

const db=new Client({connectionString:dbUrl.toString()});
const makeClient=key=>createClient(apiUrl.toString(),key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=makeClient(serviceKey);
const guest=makeClient(publishableKey);
const runId=randomUUID().slice(0,8);
const pass=label=>console.log('PASS '+label);
const mustSucceed=async promise=>{const {data,error}=await promise;assert.ifError(error);return data;};
const mustFail=async promise=>{const {error}=await promise;assert.ok(error);return error;};

async function makeUser(role){
  const email=`TEST-sprint4-${role}-${randomUUID()}@example.test`;
  const password=`TEST-${randomUUID()}-Aa1!`;
  const created=await mustSucceed(root.auth.admin.createUser({email,password,email_confirm:true}));
  const id=created.user.id;
  if(role!=='customer')await db.query('update public.profiles set role=$1 where id=$2',[role,id]);
  const api=makeClient(publishableKey);
  await mustSucceed(api.auth.signInWithPassword({email,password}));
  return {id,api};
}

function productArgs(product,price,stock,expectedStock){
  return {p_id:product.id,p_name:product.name,p_description:'TEST Sprint 4',p_image_url:null,
    p_price:price,p_stock:stock,p_expected_stock:expectedStock,p_status:'active',
    p_featured:false,p_best_seller:false};
}

async function addOrder(user,product,status,tag){
  const code=`TEST-S4-${runId}-${tag}`;
  const order=(await db.query(`insert into public.orders(order_code,customer_id,created_by,sales_channel,
    fulfillment_type,client_request_id,request_payload,requested_at,subtotal,total_amount,
    order_status,payment_status) values($1,$2,$2,'online','pickup',$3,'{}'::jsonb,
    now()+interval '2 days',120000,120000,$4,'unpaid') returning id`,
    [code,user.id,code,status])).rows[0];
  const item=(await db.query(`insert into public.order_items(order_id,line_no,product_id,
    product_name_snapshot,unit_price,quantity,subtotal) values($1,1,$2,$3,120000,1,120000)
    returning id`,[order.id,product.id,product.name])).rows[0];
  return {orderId:order.id,itemId:item.id};
}

try{
  await db.connect();
  const versions=(await db.query(`select version from supabase_migrations.schema_migrations
    where version in ('20261109000500','20261109000600','20261109000700','20261110000100')`)).rows;
  assert.equal(versions.length,4);
  for(const table of ['profiles','products','orders']){
    const count=await db.query(`select count(*)::int as n from public.${table}`);
    assert.equal(count.rows[0].n,0);
  }
  pass('disposable target and migrations 005-008');

  const customer=await makeUser('customer');
  const other=await makeUser('customer');
  const staff=await makeUser('staff');
  const admin=await makeUser('admin');
  const category=(await db.query(`insert into public.categories(source_id,name,slug)
    values($1,'TEST Sprint 4','test-s4-${runId}') returning id`,[`TEST-S4-CAT-${runId}`])).rows[0];
  const regular=(await db.query(`insert into public.products(category_id,source_id,name,slug,
    base_price,stock_quantity,is_customizable) values($1,$2,'TEST Regular','test-regular-${runId}',
    100000,1,false) returning id,name`,[category.id,`TEST-S4-REG-${runId}`])).rows[0];
  const custom=(await db.query(`insert into public.products(category_id,source_id,name,slug,
    base_price,stock_quantity,is_customizable) values($1,$2,'TEST Custom','test-custom-${runId}',
    null,0,true) returning id,name`,[category.id,`TEST-S4-CUSTOM-${runId}`])).rows[0];

  await mustSucceed(admin.api.rpc('admin_update_product_checked',productArgs(regular,120000,1,1)));
  await mustSucceed(admin.api.rpc('admin_update_product_checked',productArgs(custom,null,0,0)));
  assert.equal((await db.query('select base_price from public.products where id=$1',[custom.id])).rows[0].base_price,null);
  await mustFail(admin.api.rpc('admin_update_product_checked',productArgs(regular,null,1,1)));
  assert.equal(Number((await db.query('select base_price from public.products where id=$1',[regular.id])).rows[0].base_price),120000);
  pass('admin regular and custom template price NULL');

  const promo={p_discount_type:'PERCENT',p_discount_value:10,p_target_type:'ALL',
    p_target_product:null,p_target_category:null,p_min_order:0,p_max_discount:null,
    p_starts:new Date(Date.now()-3600000).toISOString(),
    p_ends:new Date(Date.now()+86400000).toISOString(),
    p_usage_limit:null,p_usage_per_customer:null,p_status:'active'};
  const promoCreate={...promo,p_name:'TEST Sprint 4 promotion',p_description:'TEST only'};
  for(const actor of [guest,customer.api,staff.api]){
    await mustFail(actor.rpc('admin_update_product_checked',productArgs(regular,999999,1,1)));
    await mustFail(actor.rpc('admin_create_promotion',promoCreate));
    await mustFail(actor.rpc('admin_assign_role',{p_profile:other.id,p_role:'admin',p_status:'active'}));
  }
  assert.equal((await db.query('select role from public.profiles where id=$1',[other.id])).rows[0].role,'customer');
  pass('guest/customer/staff catalog promotion role denied');

  const created=await mustSucceed(admin.api.rpc('admin_create_promotion',promoCreate));
  const promotionId=created.promotion_id;
  await mustSucceed(admin.api.rpc('admin_set_promotion',{...promo,p_id:promotionId,
    p_discount_type:'FIXED',p_discount_value:5000,p_status:'inactive'}));
  await mustFail(admin.api.rpc('admin_set_promotion',{...promo,p_id:promotionId,
    p_discount_value:150}));
  const savedPromo=(await db.query('select discount_type,discount_value,status from public.promotions where id=$1',[promotionId])).rows[0];
  assert.equal(savedPromo.discount_type,'FIXED');
  assert.equal(Number(savedPromo.discount_value),5000);
  assert.equal(savedPromo.status,'inactive');
  pass('admin promotion valid create/update and invalid rejected');

  const completed=await addOrder(customer,regular,'completed','completed');
  const pending=await addOrder(customer,regular,'pending','pending');
  const reviewArgs=itemId=>({p_order_item:itemId,p_rating:1,p_content:'TEST valid one-star review',p_image_url:null});
  await mustFail(guest.rpc('submit_review',reviewArgs(completed.itemId)));
  await mustFail(other.api.rpc('submit_review',reviewArgs(completed.itemId)));
  await mustFail(customer.api.rpc('submit_review',reviewArgs(pending.itemId)));
  const review=await mustSucceed(customer.api.rpc('submit_review',reviewArgs(completed.itemId)));
  await mustFail(customer.api.rpc('submit_review',reviewArgs(completed.itemId)));
  const publicReviews=async()=>mustSucceed(guest.from('reviews').select('id,status').eq('id',review.review_id));
  assert.equal((await publicReviews()).length,0);
  pass('review ownership completed only duplicate denied and pending private');

  await mustFail(staff.api.rpc('admin_moderate_review_with_reason',{
    p_review:review.review_id,p_status:'published',p_reason:null}));
  await mustSucceed(admin.api.rpc('admin_moderate_review_with_reason',{
    p_review:review.review_id,p_status:'published',p_reason:null}));
  assert.equal((await publicReviews()).length,1);
  await mustFail(admin.api.rpc('admin_moderate_review_with_reason',{
    p_review:review.review_id,p_status:'hidden',p_reason:'  '}));
  assert.equal((await publicReviews()).length,1);
  await mustSucceed(admin.api.rpc('admin_moderate_review_with_reason',{
    p_review:review.review_id,p_status:'hidden',p_reason:'TEST policy violation'}));
  assert.equal((await publicReviews()).length,0);
  const replay=await mustSucceed(admin.api.rpc('admin_moderate_review_with_reason',{
    p_review:review.review_id,p_status:'hidden',p_reason:'TEST policy violation'}));
  assert.equal(replay.replayed,true);
  const audits=(await db.query(`select actor_user_id,new_value->>'reason' as reason,created_at
    from public.audit_log where entity_id=$1 and action='review_moderation' order by created_at`,
    [review.review_id])).rows;
  assert.equal(audits.length,2);
  assert.equal(audits[1].actor_user_id,admin.id);
  assert.equal(audits[1].reason,'TEST policy violation');
  assert.ok(audits[1].created_at);
  await mustFail(customer.api.from('reviews').update({status:'published'}).eq('id',review.review_id));
  pass('one-star review published; hide requires reason and audits actor/time; hidden private');

  const posRequest={items:[{product_id:regular.id,quantity:1}],fulfillment_type:'counter',
    points_used:0,payment_method:'cash_demo',request_id:`TEST-S4-race-${runId}`};
  const [sale,update]=await Promise.all([
    staff.api.rpc('record_pos_sale',{p_request:posRequest}),
    admin.api.rpc('admin_update_product_checked',productArgs(regular,120000,1,1))
  ]);
  assert.ifError(sale.error);
  assert.ok(!update.error||update.error.message.includes('STOCK_CHANGED_RELOAD_REQUIRED'));
  assert.equal((await db.query('select stock_quantity from public.products where id=$1',[regular.id])).rows[0].stock_quantity,0);
  await mustFail(staff.api.rpc('record_pos_sale',{p_request:{...posRequest,request_id:`TEST-S4-race-again-${runId}`}}));
  pass('admin stock update versus POS order no lost update or oversell');
}finally{
  await db.end().catch(()=>{});
}
