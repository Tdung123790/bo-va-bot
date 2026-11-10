-- Run only against a disposable Supabase LOCAL database as postgres.
-- Synthetic fixtures are rolled back. A raised exception is a test failure.
begin;
do $$
declare v_count integer;v_enabled integer;
begin
  select count(*) into v_count from pg_tables
    where schemaname='public' and tablename=any(array[
      'profiles','categories','products','product_variants','customization_categories',
      'customization_options','promotions','orders','order_items','order_status_history',
      'payments','loyalty_accounts','loyalty_transactions','wishlist_items','reviews',
      'daily_analytics','audit_log','store_settings']);
  if v_count<>18 then raise exception 'Expected 18 application tables, found %',v_count; end if;
  select count(*) into v_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array[
      'profiles','categories','products','product_variants','customization_categories',
      'customization_options','promotions','orders','order_items','order_status_history',
      'payments','loyalty_accounts','loyalty_transactions','wishlist_items','reviews',
      'daily_analytics','audit_log','store_settings']) and c.relrowsecurity;
  if v_enabled<>18 then raise exception 'RLS not enabled on all 18 tables'; end if;
  if has_table_privilege('anon','public.orders','INSERT')
    or has_table_privilege('authenticated','public.orders','INSERT')
    or has_table_privilege('authenticated','public.payments','UPDATE')
    or has_table_privilege('authenticated','public.loyalty_accounts','UPDATE')
    or has_table_privilege('authenticated','public.daily_analytics','INSERT')
    or has_table_privilege('authenticated','public.audit_log','INSERT')
    or has_column_privilege('authenticated','public.products','base_price','UPDATE')
    or has_column_privilege('authenticated','public.profiles','role','UPDATE')
    or has_column_privilege('anon','public.reviews','customer_id','SELECT')
    then raise exception 'Unsafe Data API grants'; end if;
  if has_function_privilege('anon','public.create_online_order(jsonb)','EXECUTE')
    or has_function_privilege('anon','public.record_pos_sale(jsonb)','EXECUTE')
    or has_function_privilege('anon','public.confirm_demo_payment(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.confirm_demo_payment(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.refund_demo_payment(uuid,text)','EXECUTE')
    then raise exception 'Sensitive RPC executable by guest'; end if;
end $$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','sprint2-a@example.invalid','test',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','sprint2-b@example.invalid','test',now()),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','sprint2-staff@example.invalid','test',now()),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','sprint2-admin@example.invalid','test',now());
update public.profiles set role='staff' where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
update public.profiles set role='admin' where id='dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
insert into public.categories(id,name,status)
values('11111111-1111-4111-8111-111111111111','Fixture','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status)
values('22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111','Fixture cake',100000,2,'active');
insert into public.store_settings(store_key,pickup_hours)
values('main','{"1":[{"start":"00:00","end":"24:00"}],
  "2":[{"start":"00:00","end":"24:00"}],
  "3":[{"start":"00:00","end":"24:00"}],
  "4":[{"start":"00:00","end":"24:00"}],
  "5":[{"start":"00:00","end":"24:00"}],
  "6":[{"start":"00:00","end":"24:00"}],
  "7":[{"start":"00:00","end":"24:00"}]}'::jsonb);
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,
  fulfillment_type,client_request_id,request_payload,requested_at,subtotal,total_amount)
values('33333333-3333-4333-8333-333333333333','FIXTURE-B',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'online','pickup','fixture-b','{}',now()+interval '48 hours',100000,100000);

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$
declare v_denied boolean:=false;
begin
  begin perform public.create_online_order('{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Guest created online order'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare v_count integer;v_denied boolean:=false;
begin
  select count(*) into v_count from public.orders
    where id='33333333-3333-4333-8333-333333333333';
  if v_count<>0 then raise exception 'Customer A saw Customer B order'; end if;
  begin
    update public.orders set subtotal=0 where id='33333333-3333-4333-8333-333333333333';
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Customer updated order directly'; end if;
  v_denied:=false;
  begin
    perform public.cancel_order('33333333-3333-4333-8333-333333333333',null);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Customer cancelled another customer order'; end if;
  v_denied:=false;
  begin
    perform public.record_pos_sale('{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Customer created POS guest sale'; end if;
end $$;

select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$
declare v_denied boolean:=false;v_id uuid;
begin
  begin
    perform public.create_online_order('{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Staff created online customer order'; end if;
  v_denied:=false;
  begin
    perform public.admin_assign_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','admin','active');
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Staff assigned role'; end if;
  select (public.record_pos_sale(jsonb_build_object('request_id','pos-1',
    'fulfillment_type','counter','payment_method','cash_demo',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','22222222-2222-4222-8222-222222222222','quantity',1))))->>'order_id')::uuid
    into v_id;
  if not exists(select 1 from public.orders where id=v_id and sales_channel='offline'
      and customer_id is null and payment_status='unpaid' and order_status='pending')
    then raise exception 'POS guest pending sale invalid'; end if;
  v_denied:=false;
  begin perform public.complete_pos_sale(v_id,false,true);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'POS completed without cash receipt'; end if;
  perform public.complete_pos_sale(v_id,true,true);
  if (public.complete_pos_sale(v_id,true,true)->>'replayed')::boolean is not true
    then raise exception 'POS completion retry not idempotent'; end if;
  if not exists(select 1 from public.orders where id=v_id and payment_status='paid'
      and order_status='completed') then raise exception 'POS cash/handover completion invalid'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
do $$ begin
  perform public.admin_set_product('22222222-2222-4222-8222-222222222222',
    100000,5,'active');
  perform public.admin_assign_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'customer','blocked');
  if (select count(*) from public.audit_log where action in
      ('catalog_product_update','profile_access_update'))<>2
    then raise exception 'Admin management did not audit changes'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare v_denied boolean:=false;
begin
  begin
    perform public.create_online_order('{}'::jsonb);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Blocked profile used sensitive RPC'; end if;
end $$;
reset role;
update public.profiles set status='active'
  where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
update public.products set stock_quantity=5
  where id='22222222-2222-4222-8222-222222222222';
insert into public.promotions(id,name,discount_type,discount_value,target_type,
  starts_at,ends_at,status,usage_limit,usage_per_customer)
values
 ('44444444-4444-4444-8444-444444444441','Fixture promo 1',
  'FIXED',10000,'ALL',now()-interval '1 day',now()+interval '1 day','active',1,1),
 ('44444444-4444-4444-8444-444444444442','Fixture promo 2',
  'FIXED',10000,'ALL',now()-interval '1 day',now()+interval '1 day','active',1,1);
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare v_request jsonb;v_quote jsonb;v_first uuid;v_second uuid;v_bank_cancel uuid;v_refund uuid;
  v_item uuid;v_review uuid;
  v_before integer;v_denied boolean;v_result jsonb;v_points integer;v_debt integer;
begin
  v_request:=jsonb_build_object('request_id','web-1','fulfillment_type','pickup',
    'payment_method','cod','requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'recipient_name','Test customer','recipient_phone','0123456789',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','22222222-2222-4222-8222-222222222222','quantity',1)));
  v_quote:=public.quote_order(v_request);
  if (v_quote->>'promotion_id')::uuid<>'44444444-4444-4444-8444-444444444441'
    or (v_quote->>'discount_amount')::bigint<>10000 then
    raise exception 'Best discount / tie break failed'; end if;
  v_result:=public.create_online_order(v_request);
  v_first:=(v_result->>'order_id')::uuid;
  select stock_quantity into v_before from public.products
    where id='22222222-2222-4222-8222-222222222222';
  v_result:=public.create_online_order(v_request);
  if (v_result->>'order_id')::uuid<>v_first or (v_result->>'replayed')::boolean is not true
    then raise exception 'Same request did not replay'; end if;
  if (select stock_quantity from public.products
      where id='22222222-2222-4222-8222-222222222222')<>v_before
    then raise exception 'Replay changed stock'; end if;
  v_denied:=false;
  begin
    perform public.create_online_order(v_request||'{"notes":"different"}'::jsonb);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Same key accepted different payload'; end if;
  if (select stock_quantity from public.products
      where id='22222222-2222-4222-8222-222222222222')<>v_before
    or (select count(*) from public.orders where client_request_id='web-1')<>1
    then raise exception 'Rejected idempotency payload left a side effect'; end if;
  if (select used_count from public.promotions
      where id='44444444-4444-4444-8444-444444444441')<>1
    then raise exception 'Promotion usage mismatch'; end if;
  perform public.cancel_order(v_first,'test');
  perform public.cancel_order(v_first,'test');
  if (select used_count from public.promotions
      where id='44444444-4444-4444-8444-444444444441')<>0
    or (select stock_quantity from public.products
      where id='22222222-2222-4222-8222-222222222222')<>v_before+1
    then raise exception 'Cancel did not release quota/stock exactly once'; end if;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  v_denied:=false;
  begin perform public.confirm_demo_payment(v_first,true);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Cancelled COD payment confirmed'; end if;

  perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
  v_request:=v_request||jsonb_build_object('request_id','web-2',
    'payment_method','bank_transfer_demo');
  v_second:=(public.create_online_order(v_request)->>'order_id')::uuid;
  if v_second=v_first or (select payment_status from public.orders where id=v_second)<>'pending'
    then raise exception 'Independent bank transfer request failed'; end if;
  select id into v_item from public.order_items where order_id=v_second limit 1;
  v_denied:=false;
  begin perform public.submit_review(v_item,5::smallint,'Too early');
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Review before completed accepted'; end if;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  v_denied:=false;
  begin perform public.confirm_demo_payment(v_second,false);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Bank demo payment confirmed without receipt attestation'; end if;
  perform public.confirm_demo_payment(v_second,true);
  v_denied:=false;
  begin perform public.confirm_demo_payment(v_second,true);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Duplicate confirmation accepted'; end if;
  perform public.transition_order(v_second,'confirmed');
  perform public.transition_order(v_second,'preparing');
  v_denied:=false;
  begin perform public.transition_order(v_second,'completed',false);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Completed without handover'; end if;
  perform public.transition_order(v_second,'completed',true);
  select id into v_item from public.order_items where order_id=v_second limit 1;
  perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
  v_review:=(public.submit_review(v_item,5::smallint,'Fixture review')->>'review_id')::uuid;
  v_denied:=false;
  begin perform public.submit_review(v_item,5::smallint,'Duplicate');
  exception when unique_violation then v_denied:=true; end;
  if not v_denied then raise exception 'Duplicate review accepted'; end if;
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  perform public.admin_moderate_review(v_review,'published');
  if (select status from public.reviews where id=v_review)<>'published'
    then raise exception 'Admin review moderation failed'; end if;
  select points into v_points from public.loyalty_accounts
    where customer_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if v_points is distinct from 90 then raise exception 'Completed+paid earn expected 90, found %',v_points; end if;
  if (select net_product_revenue from public.daily_analytics
      where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date
        and sales_channel='online') is distinct from 90000
    then raise exception 'Product revenue incorrect'; end if;
  -- Spend earned points before refund so E-02 creates a debt.
  perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
  v_request:=v_request||jsonb_build_object('request_id','web-3',
    'points_used',90,'payment_method','cod');
  perform public.create_online_order(v_request);
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  v_refund:=(public.request_demo_refund(v_second,'refund-1','TEST approved refund')->>'refund_id')::uuid;
  if (public.request_demo_refund(v_second,'refund-1','TEST approved refund')->>'replayed')::boolean is not true
    then raise exception 'Refund request retry not idempotent'; end if;
  if (select payment_status from public.orders where id=v_second)<>'paid'
    then raise exception 'Pending refund changed payment projection'; end if;
  v_denied:=false;
  begin perform public.execute_demo_refund(v_refund);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Refund executed without Admin approval'; end if;
  v_denied:=false;
  begin perform public.approve_demo_refund(v_refund);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Staff approved refund'; end if;
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  perform public.approve_demo_refund(v_refund);
  v_denied:=false;
  begin perform public.execute_demo_refund(v_refund);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Admin executed Staff refund'; end if;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  perform public.execute_demo_refund(v_refund);
  if (public.execute_demo_refund(v_refund)->>'replayed')::boolean is not true
    then raise exception 'Refund execution retry not idempotent'; end if;
  v_denied:=false;
  begin perform public.request_demo_refund(v_second,'refund-2','TEST duplicate refund');
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Duplicate refund accepted'; end if;
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts
    where customer_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if v_points is distinct from 0 or v_debt is distinct from 90 then
    raise exception 'E-02 debt expected 90, got available %, debt %',v_points,v_debt; end if;
  if (select net_product_revenue from public.daily_analytics
      where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date
        and sales_channel='online') is distinct from 0
    then raise exception 'Refund KPI not adjusted'; end if;
  perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
  v_request:=v_request||jsonb_build_object('request_id','web-bank-cancel',
    'points_used',0,'payment_method','bank_transfer_demo');
  v_bank_cancel:=(public.create_online_order(v_request)->>'order_id')::uuid;
  perform public.cancel_order(v_bank_cancel,'test');
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  v_denied:=false;
  begin perform public.confirm_demo_payment(v_bank_cancel,true);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Cancelled bank transfer confirmed'; end if;
end $$;
reset role;
update public.promotions set status='inactive'
  where id in ('44444444-4444-4444-8444-444444444441',
    '44444444-4444-4444-8444-444444444442');
insert into public.products(id,category_id,name,is_customizable,stock_quantity,status)
values('55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111','Fixture custom cake',true,0,'active');
insert into public.customization_categories(id,source_key,name,pricing_role)
values
 ('66666666-6666-4666-8666-666666666661','size','Size','size'),
 ('66666666-6666-4666-8666-666666666662','flavor','Flavor','flavor'),
 ('66666666-6666-4666-8666-666666666663','cream','Cream','cream'),
 ('66666666-6666-4666-8666-666666666664','font','Font','font'),
 ('66666666-6666-4666-8666-666666666665','color','Color','color');
insert into public.customization_options(id,category_id,source_key,name,base_price)
values
 ('77777777-7777-4777-8777-777777777771',
  '66666666-6666-4666-8666-666666666661','s','Small',100000),
 ('77777777-7777-4777-8777-777777777772',
  '66666666-6666-4666-8666-666666666662','v','Vanilla',null),
 ('77777777-7777-4777-8777-777777777773',
  '66666666-6666-4666-8666-666666666663','c','Cream',null),
 ('77777777-7777-4777-8777-777777777774',
  '66666666-6666-4666-8666-666666666664','f','Font',null),
 ('77777777-7777-4777-8777-777777777775',
  '66666666-6666-4666-8666-666666666665','r','Red',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare v_request jsonb;v_custom jsonb;v_denied boolean;v_quote jsonb;
  v_third uuid;v_late uuid;v_debt integer;v_points integer;
begin
  v_request:=jsonb_build_object('fulfillment_type','pickup',
    'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','22222222-2222-4222-8222-222222222222','quantity',1)));
  v_quote:=public.quote_order(v_request);
  if (v_quote->>'discount_amount')::bigint<>0 or v_quote->>'promotion_id' is not null
    then raise exception 'Inactive promotions gave a discount'; end if;
  v_denied:=false;
  begin perform public.quote_order(v_request||jsonb_build_object(
    'fulfillment_type','delivery','delivery_lat',10.8,'delivery_lng',106.7));
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Delivery quote invented missing store configuration'; end if;
  v_denied:=false;
  begin perform public.quote_order(v_request||'{"points_used":2001}'::jsonb);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Point redemption exceeded 20 percent'; end if;
  v_custom:=jsonb_build_object('size_id','77777777-7777-4777-8777-777777777771',
    'flavor_id','77777777-7777-4777-8777-777777777772',
    'cream_id','77777777-7777-4777-8777-777777777773',
    'font_id','77777777-7777-4777-8777-777777777774',
    'color_id','77777777-7777-4777-8777-777777777775','text','Fixture');
  v_request:=jsonb_build_object('fulfillment_type','pickup',
    'requested_at',now()+interval '23 hours 59 minutes',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','55555555-5555-4555-8555-555555555555','quantity',1,
      'customization',v_custom)));
  v_denied:=false;
  begin perform public.quote_order(v_request);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Custom cake under 24 hours accepted'; end if;
  v_quote:=public.quote_order(v_request||jsonb_build_object(
    'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh')));
  if (v_quote->>'subtotal')::bigint<>100000
    then raise exception 'Custom cake price not calculated from options'; end if;
  if (select stock_quantity from public.products
      where id='55555555-5555-4555-8555-555555555555')<>0
    then raise exception 'Custom cake decremented finished stock'; end if;
  select id into v_third from public.orders
    where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and client_request_id='web-3';
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  perform public.confirm_demo_payment(v_third,true);
  perform public.transition_order(v_third,'confirmed');
  perform public.transition_order(v_third,'preparing');
  perform public.transition_order(v_third,'completed',true);
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts
    where customer_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if v_points is distinct from 9 or v_debt is distinct from 0 then
    raise exception 'E-02 earn debt offset expected available 9 and debt 0, got points %, debt %',
      v_points,v_debt; end if;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  v_refund:=(public.request_demo_refund(v_third,'refund-redeemed-order','TEST redeemed refund')->>'refund_id')::uuid;
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  perform public.approve_demo_refund(v_refund);
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  perform public.execute_demo_refund(v_refund);
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts
    where customer_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if v_points is distinct from 0 or v_debt is distinct from 90 or not exists(select 1
      from public.loyalty_transactions where order_id=v_third and transaction_type='REDEEM')
    then raise exception 'Refund with redeemed points lost ledger or debt'; end if;
  perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
  v_request:=jsonb_build_object('request_id','web-late','fulfillment_type','pickup',
    'payment_method','cod','requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'recipient_name','Second customer','recipient_phone','0123456789',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','22222222-2222-4222-8222-222222222222','quantity',1)));
  v_late:=(public.create_online_order(v_request)->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  perform public.transition_order(v_late,'confirmed');
  perform public.transition_order(v_late,'preparing');
  perform public.transition_order(v_late,'completed',true);
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  if (select net_product_revenue from public.daily_analytics
      where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date
        and sales_channel='online') is distinct from 0
    then raise exception 'Unpaid completed order counted as revenue'; end if;
  perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
  perform public.confirm_demo_payment(v_late,true);
  perform set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-ddddddddddd4',true);
  if (select net_product_revenue from public.daily_analytics
      where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date
        and sales_channel='online') is distinct from 100000
    then raise exception 'Late COD confirmation did not backfill revenue'; end if;
  perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
  v_request:=jsonb_build_object('request_id','web-2','fulfillment_type','pickup',
    'payment_method','cod','requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'recipient_name','Second customer','recipient_phone','0123456789',
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','22222222-2222-4222-8222-222222222222','quantity',1)));
  perform public.create_online_order(v_request);
  if (select count(*) from public.orders
      where client_request_id='web-2' and sales_channel='online')<>1
    then raise exception 'Customer B saw another user request'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.orders
      where client_request_id='web-2' and sales_channel='online')<>2
    then raise exception 'Different users could not reuse request ID'; end if;
end $$;
rollback;
