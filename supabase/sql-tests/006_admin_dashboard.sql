begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','TEST-dash-customer@example.invalid','test',now()),
('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','TEST-dash-staff@example.invalid','test',now()),
('33333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','TEST-dash-admin@example.invalid','test',now());
update public.profiles set role='staff' where id='22222222-2222-4222-8222-222222222222';
update public.profiles set role='admin' where id='33333333-3333-4333-8333-333333333333';
insert into public.categories(id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST category');
insert into public.products(id,category_id,name,base_price,stock_quantity) values
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST product A',60000,10),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST product B',40000,10);
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,client_request_id,request_payload,ship_address,requested_at,subtotal,discount_amount,shipping_fee,total_amount,order_status,payment_status,created_at,completed_at) values
('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','TEST-DASH-ONLINE','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','online','delivery','dash-online','{}','TEST address','2026-10-03 10:00+07',100000,10000,15000,105000,'completed','paid','2026-10-01 09:00+07','2026-10-01 10:00+07'),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc2','TEST-DASH-LINKED','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','offline','counter','dash-linked','{}',null,null,80000,0,0,80000,'completed','paid','2026-10-01 11:00+07','2026-10-01 11:00+07'),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','TEST-DASH-GUEST',null,'22222222-2222-4222-8222-222222222222','offline','counter','dash-guest','{}',null,null,70000,0,0,70000,'completed','paid','2026-10-01 12:00+07','2026-10-01 12:00+07'),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc4','TEST-DASH-UNPAID','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','online','pickup','dash-unpaid','{}',null,'2026-10-03 13:00+07',50000,0,0,50000,'completed','unpaid','2026-10-01 13:00+07','2026-10-01 13:00+07');
insert into public.order_items(order_id,line_no,product_id,product_name_snapshot,unit_price,quantity,subtotal) values
('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','TEST product A',60000,1,60000),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',2,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','TEST product B',40000,1,40000),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc2',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','TEST product A',80000,1,80000),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','TEST product B',70000,1,70000),
('cccccccc-cccc-4ccc-8ccc-ccccccccccc4',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','TEST product A',50000,1,50000);
insert into public.payments(id,order_id,kind,payment_method,status,amount,product_amount,shipping_amount,request_id,paid_at) values
('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','charge','cod','paid',105000,90000,15000,'dash-online','2026-10-01 10:00+07'),
('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','cccccccc-cccc-4ccc-8ccc-ccccccccccc2','charge','cash_demo','paid',80000,80000,0,'dash-linked','2026-10-01 11:00+07'),
('dddddddd-dddd-4ddd-8ddd-ddddddddddd3','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','charge','cash_demo','paid',70000,70000,0,'dash-guest','2026-10-01 12:00+07'),
('dddddddd-dddd-4ddd-8ddd-ddddddddddd4','cccccccc-cccc-4ccc-8ccc-ccccccccccc4','charge','cod','unpaid',50000,50000,0,'dash-unpaid',null);
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc2');
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc3');
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc4');
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 begin perform public.admin_dashboard('2026-10-01','2026-10-01','all');
 raise exception 'Staff read Dashboard';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare v jsonb;v_offline jsonb;
begin
 v:=public.admin_dashboard('2026-10-01','2026-10-01','all');
 if (v->'summary'->>'product_revenue')::bigint<>240000
  or (v->'summary'->>'online_revenue')::bigint<>90000
  or (v->'summary'->>'offline_revenue')::bigint<>150000
  or (v->'summary'->>'shipping_collected')::bigint<>15000
  or (v->'summary'->>'paid_completed_orders')::integer<>3
  or (v->'summary'->>'average_product_order_value')::bigint<>80000
  or (v->'summary'->>'unique_customers')::integer<>1
  or (v->'summary'->>'new_customers')::integer<>1
  or (select sum((x->>'product_revenue')::bigint) from jsonb_array_elements(v->'top_products') x)<>240000
 then raise exception 'Dashboard revenue/customer/top products wrong: %',v; end if;
 v_offline:=public.admin_dashboard('2026-10-01','2026-10-01','offline');
 if (v_offline->'summary'->>'returning_customers')::integer<>1
  or (v_offline->'summary'->>'unique_customers')::integer<>1
  or (v_offline->'summary'->>'new_customers')::integer<>0
 then raise exception 'Offline returning customer or POS guest counted wrong: %',v_offline; end if;
end $$;
reset role;
insert into public.payments(order_id,kind,parent_payment_id,payment_method,status,amount,product_amount,shipping_amount,request_id,refunded_at) values
('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','refund','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','cod','refunded',105000,90000,15000,'dash-refund','2026-10-02 10:00+07');
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
select private.refresh_for_order('cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare v jsonb;
begin
 v:=public.admin_dashboard('2026-10-01','2026-10-01','all');
 if (v->'summary'->>'product_revenue')::bigint<>150000
  or (v->'summary'->>'shipping_collected')::bigint<>15000
  or (v->'summary'->>'shipping_refunded')::bigint<>15000
  or (select sum((x->>'product_revenue')::bigint) from jsonb_array_elements(v->'top_products') x)<>150000
 then raise exception 'Refund duplicated or leaked into product revenue: %',v; end if;
end $$;
rollback;
