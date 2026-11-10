-- LOCAL-only transaction fixture: shipping is never product revenue.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values('abababab-abab-4aba-8aba-abababababab',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-shipping@example.invalid','test',now());
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,
  fulfillment_type,client_request_id,request_payload,ship_address,requested_at,
  subtotal,discount_amount,shipping_fee,total_amount,order_status,completed_at)
values('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','FIXTURE-SHIP',
  'abababab-abab-4aba-8aba-abababababab',
  'abababab-abab-4aba-8aba-abababababab','online','delivery','ship-fixture',
  '{}','Fixture address',now()+interval '48 hours',
  100000,20000,15000,95000,'completed',now());
insert into public.payments(id,order_id,kind,payment_method,status,amount,
  product_amount,shipping_amount,request_id,paid_at)
values('dededede-dede-4ede-8ede-dededededede',
  'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd','charge','cod','paid',
  95000,80000,15000,'charge',now());
select private.refresh_for_order('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd');
do $$
declare v public.daily_analytics%rowtype;
begin
  select * into v from public.daily_analytics
    where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date and sales_channel='online';
  if v.net_product_revenue<>80000 or v.shipping_collected<>15000
    or v.shipping_refunded<>0 then raise exception 'Shipping leaked into product revenue'; end if;
end $$;
insert into public.payments(order_id,kind,parent_payment_id,payment_method,status,
  amount,product_amount,shipping_amount,request_id,refunded_at)
values('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
  'refund','dededede-dede-4ede-8ede-dededededede','cod','refunded',
  95000,80000,15000,'refund',now());
select private.refresh_for_order('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd');
select private.refresh_for_order('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd');
do $$
declare v public.daily_analytics%rowtype;
begin
  select * into v from public.daily_analytics
    where day=(now() at time zone 'Asia/Ho_Chi_Minh')::date and sales_channel='online';
  if v.net_product_revenue<>0 or v.shipping_collected<>15000
    or v.shipping_refunded<>15000 then raise exception 'Refund/backfill KPI doubled'; end if;
  if (select payment_status from public.orders
      where id='cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd')<>'refunded'
    or (select status from public.payments
      where id='dededede-dede-4ede-8ede-dededededede')<>'paid'
    then raise exception 'Payment projection or original charge invalid'; end if;
end $$;
rollback;
