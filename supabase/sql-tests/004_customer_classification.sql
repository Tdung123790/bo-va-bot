-- LOCAL-only fixture: one customer buys twice online and once at POS in one HCM day.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('01010101-0101-4101-8101-010101010101',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-metrics-customer@example.invalid','test',now()),
 ('02020202-0202-4202-8202-020202020202',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-metrics-staff@example.invalid','test',now()),
 ('03030303-0303-4303-8303-030303030303',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-metrics-admin@example.invalid','test',now());
update public.profiles set role='staff' where id='02020202-0202-4202-8202-020202020202';
update public.profiles set role='admin' where id='03030303-0303-4303-8303-030303030303';
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,
  fulfillment_type,client_request_id,request_payload,requested_at,subtotal,
  total_amount,order_status,created_at,completed_at)
values
 ('11111111-aaaa-4111-8111-111111111111','METRICS-1',
  '01010101-0101-4101-8101-010101010101','01010101-0101-4101-8101-010101010101',
  'online','pickup','metrics-1','{}','2026-10-01 10:00+07',100000,100000,
  'completed','2026-09-30 10:00+07','2026-10-01 10:00+07'),
 ('22222222-aaaa-4222-8222-222222222222','METRICS-2',
  '01010101-0101-4101-8101-010101010101','01010101-0101-4101-8101-010101010101',
  'online','pickup','metrics-2','{}','2026-10-01 11:00+07',100000,100000,
  'completed','2026-09-30 11:00+07','2026-10-01 11:00+07'),
 ('33333333-aaaa-4333-8333-333333333333','METRICS-3',
  '01010101-0101-4101-8101-010101010101','02020202-0202-4202-8202-020202020202',
  'offline','counter','metrics-3','{}',null,100000,100000,
  'completed','2026-10-01 12:00+07','2026-10-01 12:00+07');
insert into public.payments(order_id,kind,payment_method,status,amount,
  product_amount,shipping_amount,request_id,paid_at)
values
 ('11111111-aaaa-4111-8111-111111111111','charge','cod','paid',
  100000,100000,0,'metrics-1','2026-10-01 10:00+07'),
 ('22222222-aaaa-4222-8222-222222222222','charge','cod','paid',
  100000,100000,0,'metrics-2','2026-10-01 11:00+07'),
 ('33333333-aaaa-4333-8333-333333333333','charge','cash_demo','paid',
  100000,100000,0,'metrics-3','2026-10-01 12:00+07');
select private.refresh_for_order('11111111-aaaa-4111-8111-111111111111');
select private.refresh_for_order('22222222-aaaa-4222-8222-222222222222');
select private.refresh_for_order('33333333-aaaa-4333-8333-333333333333');
select private.refresh_for_order('11111111-aaaa-4111-8111-111111111111');
do $$
declare v_online public.daily_analytics%rowtype;
  v_offline public.daily_analytics%rowtype;
begin
  select * into v_online from public.daily_analytics
    where day='2026-10-01' and sales_channel='online';
  select * into v_offline from public.daily_analytics
    where day='2026-10-01' and sales_channel='offline';
  if v_online.new_customers is distinct from 1
    or v_online.returning_customers is distinct from 0
    or v_online.net_product_revenue is distinct from 200000
    then raise exception 'Same-day online buyer was double classified'; end if;
  if v_offline.new_customers is distinct from 0
    or v_offline.returning_customers is distinct from 1
    or v_offline.net_product_revenue is distinct from 100000
    then raise exception 'Cross-channel first purchase was inconsistent'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','02020202-0202-4202-8202-020202020202',true);
do $$
declare v_denied boolean:=false;
begin
  begin perform public.admin_customer_metrics('2026-10-01','2026-10-01');
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Staff read admin customer metrics'; end if;
end $$;
select set_config('request.jwt.claim.sub','03030303-0303-4303-8303-030303030303',true);
do $$
declare v jsonb;
begin
  v:=public.admin_customer_metrics('2026-10-01','2026-10-01');
  if (v->>'unique_customers')::integer is distinct from 1
    or (v->>'new_customers')::integer is distinct from 1
    or (v->>'returning_customers')::integer is distinct from 0
    then raise exception 'Cross-channel unique customers doubled: %',v; end if;
end $$;
reset role;
rollback;
