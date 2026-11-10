begin;
do $$
begin
 if (select count(*) from pg_tables where schemaname='public' and tablename in
  ('profiles','categories','products','product_variants','customization_categories',
   'customization_options','promotions','orders','order_items','order_status_history',
   'payments','loyalty_accounts','loyalty_transactions','wishlist_items','reviews',
   'daily_analytics','audit_log','store_settings'))<>18 then
  raise exception 'Application table count changed'; end if;
 if has_function_privilege('anon','public.vnpay_apply_result(text,bigint,text,text,text,text,text)','EXECUTE')
  or has_function_privilege('authenticated','public.vnpay_apply_result(text,bigint,text,text,text,text,text)','EXECUTE')
  or has_function_privilege('authenticated','public.vnpay_apply_refund_result(uuid,text,text,text,text)','EXECUTE')
  then raise exception 'Gateway write function exposed to client'; end if;
end $$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','vnpay-a@example.invalid','test',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','vnpay-b@example.invalid','test',now()),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','vnpay-staff@example.invalid','test',now());
update public.profiles set role='staff' where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,
  fulfillment_type,client_request_id,request_payload,requested_at,subtotal,total_amount)
values
 ('33333333-3333-4333-8333-333333333331','VNPAY-TEST-1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'online','pickup','vnpay-1','{}',now()+interval '48 hours',100000,100000),
 ('33333333-3333-4333-8333-333333333332','VNPAY-TEST-2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'online','pickup','vnpay-2','{}',now()+interval '48 hours',100000,100000),
 ('33333333-3333-4333-8333-333333333333','VNPAY-TEST-3',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'online','pickup','vnpay-3','{}',now()+interval '48 hours',100000,100000);
insert into public.payments(id,order_id,kind,payment_method,status,amount,product_amount,
  shipping_amount,request_id)
values
 ('44444444-4444-4444-8444-444444444441','33333333-3333-4333-8333-333333333331',
  'charge','vnpay','pending',100000,100000,0,'vnpay-1'),
 ('44444444-4444-4444-8444-444444444442','33333333-3333-4333-8333-333333333332',
  'charge','vnpay','pending',100000,100000,0,'vnpay-2'),
 ('44444444-4444-4444-8444-444444444443','33333333-3333-4333-8333-333333333333',
  'charge','vnpay','pending',100000,100000,0,'vnpay-3');
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$
declare denied boolean:=false;
begin
 begin perform public.vnpay_begin_payment('33333333-3333-4333-8333-333333333331');
 exception when others then denied:=sqlerrm='ORDER_NOT_FOUND'; end;
 if not denied then raise exception 'Customer B began payment A'; end if;
end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare first jsonb;second jsonb;
begin
 first:=public.vnpay_begin_payment('33333333-3333-4333-8333-333333333331');
 second:=public.vnpay_begin_payment('33333333-3333-4333-8333-333333333331');
 if first->>'txn_ref'<>second->>'txn_ref' or (first->>'amount')::bigint<>100000
  then raise exception 'Session not idempotent'; end if;
 perform public.vnpay_begin_payment('33333333-3333-4333-8333-333333333332');
end $$;
reset role;
update public.orders set order_status='cancelled',cancelled_at=now()
  where id='33333333-3333-4333-8333-333333333332';
set local role service_role;
do $$
declare ref1 text;ref2 text;result jsonb;count_paid integer;
begin
 select gateway_txn_ref into ref1 from public.payments
  where id='44444444-4444-4444-8444-444444444441';
 select gateway_txn_ref into ref2 from public.payments
  where id='44444444-4444-4444-8444-444444444442';
 result:=public.vnpay_apply_result(ref1,99000,'123456','00','00',repeat('a',64),'ipn');
 if result->>'RspCode'<>'04' then raise exception 'Amount spoof not rejected'; end if;
 result:=public.vnpay_apply_result(ref1,100000,'123456','00','00',repeat('b',64),'ipn');
 if result->>'RspCode'<>'00' then raise exception 'Valid payment not accepted'; end if;
 result:=public.vnpay_apply_result(ref1,100000,'123456','00','00',repeat('b',64),'ipn');
 if result->>'RspCode'<>'02' then raise exception 'Duplicate not detected'; end if;
 result:=public.vnpay_apply_result(ref2,100000,'123457','00','00',repeat('c',64),'ipn');
 if result->>'Message'<>'Reconciliation required' then
  raise exception 'Cancelled success not marked reconciliation'; end if;
 select count(*) into count_paid from public.payments where kind='charge' and status='paid';
 if count_paid<>1 then raise exception 'Unexpected paid payment count'; end if;
end $$;
reset role;
do $$
begin
 if (select payment_status from public.orders where id='33333333-3333-4333-8333-333333333332')<>'pending'
  then raise exception 'Cancelled order marked paid'; end if;
 if (select count(*) from public.audit_log where action='vnpay_paid')<>1
  then raise exception 'Duplicate payment audit'; end if;
end $$;
update public.orders set order_status='completed',completed_at=now()
  where id='33333333-3333-4333-8333-333333333331';
update public.orders set order_status='completed',completed_at=now()
  where id='33333333-3333-4333-8333-333333333333';
update public.payments set gateway_txn_ref='QUERYDRTEST',
  gateway_create_date=to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS'),
  gateway_result='awaiting' where id='44444444-4444-4444-8444-444444444443';
set local role service_role;
do $$
declare result jsonb;
begin
 result:=public.vnpay_apply_result('QUERYDRTEST',100000,'123459','00','00',repeat('f',64),'querydr');
 if result->>'RspCode'<>'00' then raise exception 'Late QUERYDR payment not applied'; end if;
end $$;
reset role;
do $$
begin
 if (select payment_status from public.orders where id='33333333-3333-4333-8333-333333333333')<>'paid'
  then raise exception 'Late QUERYDR payment projection failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$
declare refund jsonb;again jsonb;denied boolean:=false;
begin
 refund:=public.vnpay_request_full_refund('33333333-3333-4333-8333-333333333331','REFUNDTEST1');
 again:=public.vnpay_request_full_refund('33333333-3333-4333-8333-333333333331','REFUNDTEST1');
 if (refund->>'replayed')::boolean or not (again->>'replayed')::boolean then
  raise exception 'Refund idempotency failed'; end if;
 begin
  perform public.vnpay_request_full_refund('33333333-3333-4333-8333-333333333331','REFUNDTEST2');
 exception when others then denied:=sqlerrm='REFUND_ALREADY_REQUESTED'; end;
 if not denied then raise exception 'Second refund request accepted'; end if;
end $$;
reset role;
do $$
begin
 if (select payment_status from public.orders where id='33333333-3333-4333-8333-333333333331')<>'paid'
  then raise exception 'Pending refund prematurely reduced payment'; end if;
end $$;
set local role service_role;
do $$
declare refund_id uuid;result jsonb;
begin
 select id into refund_id from public.payments where kind='refund' and request_id='REFUNDTEST1';
 result:=public.vnpay_apply_refund_result(refund_id,'94',null,null,repeat('c',64));
 if result->>'status'<>'pending' then raise exception 'Refund duplicate request marked failed'; end if;
 result:=public.vnpay_apply_refund_result(refund_id,'00','05','888',repeat('d',64));
 if result->>'status'<>'pending' then raise exception 'Pending refund marked complete'; end if;
 result:=public.vnpay_apply_refund_result(refund_id,'00','00','888',repeat('e',64));
 if result->>'status'<>'refunded' then raise exception 'Verified refund failed'; end if;
 result:=public.vnpay_apply_refund_result(refund_id,'00','00','888',repeat('e',64));
 if not (result->>'replayed')::boolean then raise exception 'Refund duplicate not idempotent'; end if;
end $$;
reset role;
do $$
begin
 if (select payment_status from public.orders where id='33333333-3333-4333-8333-333333333331')<>'refunded'
  then raise exception 'Refund projection failed'; end if;
 if (select count(*) from public.audit_log where action='vnpay_refund_verified')<>1
  then raise exception 'Refund audit duplicated'; end if;
end $$;
insert into public.categories(id,name,status)
values('11111111-1111-4111-8111-111111111111','TEST VNPAY','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status)
values('22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111','TEST minimum',4999,1,'active');
insert into public.store_settings(store_key,pickup_hours)
select 'main',jsonb_object_agg(day::text,
  jsonb_build_array(jsonb_build_object('start','00:00','end','24:00')))
from generate_series(1,7) day;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare request jsonb;denied boolean:=false;result jsonb;
begin
 request:=jsonb_build_object('request_id','vnpay-min-test',
  'payment_method','vnpay','fulfillment_type','pickup',
  'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),'recipient_name','TEST Customer',
  'recipient_phone','0912345678','points_used',0,
  'items',jsonb_build_array(jsonb_build_object('product_id',
    '22222222-2222-4222-8222-222222222222','quantity',1)));
 begin perform public.create_online_order(request);
 exception when others then denied:=sqlerrm='VNPAY_AMOUNT_OUT_OF_RANGE'; end;
 if not denied then raise exception 'VNPAY 4999 VND accepted'; end if;
 if (select stock_quantity from public.products where id='22222222-2222-4222-8222-222222222222')<>1
  or exists(select 1 from public.orders where client_request_id='vnpay-min-test')
  then raise exception 'Rejected VNPAY amount changed stock or created order'; end if;
end $$;
reset role;
update public.products set base_price=5000
  where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare request jsonb;result jsonb;
begin
 request:=jsonb_build_object('request_id','vnpay-min-test',
  'payment_method','vnpay','fulfillment_type','pickup',
  'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),'recipient_name','TEST Customer',
  'recipient_phone','0912345678','points_used',0,
  'items',jsonb_build_array(jsonb_build_object('product_id',
    '22222222-2222-4222-8222-222222222222','quantity',1)));
 result:=public.create_online_order(request);
 if (result->>'total_amount')::bigint<>5000 then raise exception 'VNPAY minimum 5000 rejected'; end if;
 if (select stock_quantity from public.products where id='22222222-2222-4222-8222-222222222222')<>0
  or (select status from public.payments where order_id=(result->>'order_id')::uuid and kind='charge')<>'pending'
  then raise exception 'VNPAY minimum order state incorrect'; end if;
end $$;
rollback;
