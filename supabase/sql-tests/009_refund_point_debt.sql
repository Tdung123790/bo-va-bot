begin;

update public.promotions set status='inactive' where status='active';

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund-customer-a@example.invalid','test',now()),
 ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund-customer-b@example.invalid','test',now()),
 ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbb1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund-staff@example.invalid','test',now()),
 ('cccccccc-1111-4111-8111-ccccccccccc1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund-admin@example.invalid','test',now());

update public.profiles set role='staff' where id='bbbbbbbb-1111-4111-8111-bbbbbbbbbbb1';
update public.profiles set role='admin' where id='cccccccc-1111-4111-8111-ccccccccccc1';

insert into public.categories(id,name,status)
values('dddddddd-1111-4111-8111-ddddddddddd1','TEST refund category','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status)
values
 ('eeeeeeee-1111-4111-8111-eeeeeeeeeee1','dddddddd-1111-4111-8111-ddddddddddd1','TEST 350',350000,10,'active'),
 ('eeeeeeee-1111-4111-8111-eeeeeeeeeee2','dddddddd-1111-4111-8111-ddddddddddd1','TEST 150',150000,10,'active'),
 ('eeeeeeee-1111-4111-8111-eeeeeeeeeee3','dddddddd-1111-4111-8111-ddddddddddd1','TEST 120',120000,10,'active'),
 ('eeeeeeee-1111-4111-8111-eeeeeeeeeee4','dddddddd-1111-4111-8111-ddddddddddd1','TEST 250',250000,10,'active');

insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,
  client_request_id,request_payload,requested_at,subtotal,total_amount,order_status,cancelled_at)
values('ffffffff-1111-4111-8111-fffffffffff1','TEST-VNPAY-PAID',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2','aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2',
  'online','pickup','vnpay-paid','{}'::jsonb,now()+interval '3 days',100000,100000,'cancelled',now());
insert into public.payments(order_id,kind,payment_method,status,amount,product_amount,shipping_amount,request_id,paid_at)
values('ffffffff-1111-4111-8111-fffffffffff1','charge','vnpay','paid',100000,100000,0,'vnpay-paid-charge',now());
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,
  client_request_id,request_payload,requested_at,ship_address,subtotal,shipping_fee,total_amount,order_status,cancelled_at)
values('ffffffff-1111-4111-8111-fffffffffff2','TEST-SHIPPING-REFUND',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2','aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2',
  'online','delivery','shipping-refund','{}'::jsonb,now()+interval '3 days','TEST delivery address',
  100000,30000,130000,'cancelled',now());
insert into public.payments(order_id,kind,payment_method,status,amount,product_amount,shipping_amount,request_id,paid_at)
values('ffffffff-1111-4111-8111-fffffffffff2','charge','cod','paid',130000,100000,30000,'shipping-paid-charge',now());

insert into public.store_settings(store_key,pickup_hours)
values('main','{"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}],"7":[{"start":"00:00","end":"24:00"}]}'::jsonb)
on conflict(store_key) do update set pickup_hours=excluded.pickup_hours;

set local role authenticated;

do $$
declare v_customer uuid:='aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1';
  v_other uuid:='aaaaaaaa-1111-4111-8111-aaaaaaaaaaa2';
  v_staff uuid:='bbbbbbbb-1111-4111-8111-bbbbbbbbbbb1';
  v_admin uuid:='cccccccc-1111-4111-8111-ccccccccccc1';
  v_a uuid;v_b uuid;v_c uuid;v_d uuid;v_full uuid;v_refund uuid;v_reject uuid;v_full_refund uuid;
  v_vnpay uuid:='ffffffff-1111-4111-8111-fffffffffff1';
  v_shipping uuid:='ffffffff-1111-4111-8111-fffffffffff2';v_shipping_refund uuid;
  v_response jsonb;v_base jsonb;v_denied boolean;v_points integer;v_debt integer;v_revenue bigint;
begin
  v_base:=jsonb_build_object('payment_method','cod','fulfillment_type','pickup',
    'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'recipient_name','TEST Customer','recipient_phone','0900000000','points_used',0);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','debt-earn-350','items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee1','quantity',1))));
  v_a:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_a,true);
  perform public.transition_order(v_a,'confirmed',false,null);
  perform public.transition_order(v_a,'preparing',false,null);
  perform public.transition_order(v_a,'completed',true,null);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  if (select gross_points from public.loyalty_transactions where order_id=v_a and transaction_type='EARN')<>350 then
    raise exception 'E00 expected earned 350, got %',
      (select gross_points from public.loyalty_transactions where order_id=v_a and transaction_type='EARN'); end if;
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  select net_product_revenue into v_revenue from public.daily_analytics where day=(select (completed_at at time zone 'Asia/Ho_Chi_Minh')::date from public.orders where id=v_a) and sales_channel='online';
  if v_revenue<>350000 then raise exception 'D06 initial product revenue incorrect'; end if;
  raise notice 'EVIDENCE E00 available=% debt=% gross_earn=%',v_points,v_debt,
    (select gross_points from public.loyalty_transactions where order_id=v_a and transaction_type='EARN');
  raise notice 'EVIDENCE D06_BEFORE net_product_revenue=%',v_revenue;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','debt-spend-300','points_used',300,'items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee2','quantity',1))));
  v_b:=(v_response->>'order_id')::uuid;
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  if v_points<>50 or v_debt<>0 or (select count(*) from public.loyalty_transactions where order_id=v_b and transaction_type='REDEEM')<>1 then
    raise exception 'E00 expected available 50 and debt 0 after redeem'; end if;
  raise notice 'EVIDENCE E00_AFTER_REDEEM available=% debt=% redeem_count=%',v_points,v_debt,
    (select count(*) from public.loyalty_transactions where order_id=v_b and transaction_type='REDEEM');
  v_denied:=false;
  begin perform public.create_online_order(v_base||jsonb_build_object('request_id','debt-overredeem','points_used',51,'items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee2','quantity',1))));
  exception when others then v_denied:=sqlerrm='INSUFFICIENT_POINTS'; end;
  if not v_denied then raise exception 'E07 overredeem accepted'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_response:=public.request_demo_refund(v_a,'refund-350-request','TEST full merchandise refund');
  v_refund:=(v_response->>'refund_id')::uuid;
  if (select status from public.payments where id=v_refund)<>'pending' or
    (select amount from public.payments where id=v_refund)<>
    (select amount from public.payments where order_id=v_a and kind='charge') then
    raise exception 'B01/B14 refund not pending or amount exceeds charge'; end if;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_denied:=false;
  begin perform public.approve_demo_refund(v_refund);
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'B06 customer approved refund'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied:=false;
  begin perform public.approve_demo_refund(v_refund);
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'B07 staff approved refund'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.approve_demo_refund(v_refund);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  if (select status from public.payments where id=v_refund)<>'pending' or v_points<>50 or v_debt<>0 then
    raise exception 'B02 approval changed refund or loyalty'; end if;
  raise notice 'EVIDENCE B02 refund_status=% available=% debt=%',
    (select status from public.payments where id=v_refund),v_points,v_debt;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_denied:=false;
  begin perform public.execute_demo_refund(v_refund,'TEST-CUSTOMER-EXECUTE');
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'B06 customer executed refund'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied:=false;
  begin perform public.execute_demo_refund(v_refund,'');
  exception when others then v_denied:=sqlerrm='REFUND_EXECUTION_REFERENCE_REQUIRED'; end;
  if not v_denied then raise exception 'B05 missing receipt accepted'; end if;
  perform public.execute_demo_refund(v_refund,'TEST-RECEIPT-350');
  if (public.execute_demo_refund(v_refund,'TEST-RECEIPT-350')->>'replayed')::boolean is not true then
    raise exception 'B09 replay not idempotent'; end if;
  v_denied:=false;
  begin perform public.execute_demo_refund(v_refund,'TEST-OTHER-350');
  exception when others then v_denied:=sqlerrm='REFUND_ALREADY_EXECUTED'; end;
  if not v_denied then raise exception 'B10 changed receipt accepted'; end if;
  v_denied:=false;
  begin perform public.request_demo_refund(v_a,'refund-350-other','TEST duplicate full refund');
  exception when others then v_denied:=sqlerrm='REFUND_ALREADY_REQUESTED'; end;
  if not v_denied then raise exception 'B14 duplicate full refund accepted'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  if v_points<>0 or v_debt<>300 or
    (select count(*) from public.loyalty_transactions where order_id=v_a and transaction_type='CLAWBACK')<>1 or
    (select points from public.loyalty_transactions where order_id=v_a and transaction_type='CLAWBACK')<>-50 or
    (select debt_delta from public.loyalty_transactions where order_id=v_a and transaction_type='CLAWBACK')<>300 or
    (select order_status from public.orders where id=v_a)<>'completed' then
    raise exception 'E02/D02 clawback balance, ledger or order incorrect'; end if;
  if (select count(*) from public.audit_log where entity_id=v_refund and action='demo_refund_executed_with_reference')<>1 then
    raise exception 'E09 missing or duplicate refund audit'; end if;
  select net_product_revenue into v_revenue from public.daily_analytics where day=(select (completed_at at time zone 'Asia/Ho_Chi_Minh')::date from public.orders where id=v_a) and sales_channel='online';
  if v_revenue<>0 then
    raise exception 'D06 product revenue not zero after full refund'; end if;
  raise notice 'EVIDENCE E02 refund_status=% available=% debt=% clawback_points=% clawback_debt_delta=% audit_count=% net_product_revenue=%',
    (select status from public.payments where id=v_refund),v_points,v_debt,
    (select points from public.loyalty_transactions where order_id=v_a and transaction_type='CLAWBACK'),
    (select debt_delta from public.loyalty_transactions where order_id=v_a and transaction_type='CLAWBACK'),
    (select count(*) from public.audit_log where entity_id=v_refund and action='demo_refund_executed_with_reference'),v_revenue;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','debt-earn-120','items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee3','quantity',1))));
  v_c:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_c,true);
  perform public.transition_order(v_c,'confirmed',false,null);
  perform public.transition_order(v_c,'preparing',false,null);
  perform public.transition_order(v_c,'completed',true,null);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  if v_points<>0 or v_debt<>180 or
    (select debt_delta from public.loyalty_transactions where order_id=v_c and transaction_type='EARN')<>-120 then
    raise exception 'E03 debt offset 120 incorrect'; end if;
  raise notice 'EVIDENCE E03 available=% debt=% earn_debt_delta=%',v_points,v_debt,
    (select debt_delta from public.loyalty_transactions where order_id=v_c and transaction_type='EARN');
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','debt-earn-250','items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee4','quantity',1))));
  v_d:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_d,true);
  perform public.transition_order(v_d,'confirmed',false,null);
  perform public.transition_order(v_d,'preparing',false,null);
  perform public.transition_order(v_d,'completed',true,null);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_customer;
  if v_points<>70 or v_debt<>0 or
    (select points from public.loyalty_transactions where order_id=v_d and transaction_type='EARN')<>70 or
    (select debt_delta from public.loyalty_transactions where order_id=v_d and transaction_type='EARN')<>-180 then
    raise exception 'E04 debt offset 250 incorrect'; end if;
  raise notice 'EVIDENCE E04 available=% debt=% earn_points=% earn_debt_delta=%',v_points,v_debt,
    (select points from public.loyalty_transactions where order_id=v_d and transaction_type='EARN'),
    (select debt_delta from public.loyalty_transactions where order_id=v_d and transaction_type='EARN');
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  if exists(select 1 from public.orders where id=v_b) or exists(select 1 from public.payments where id=v_refund) then
    raise exception 'RLS other customer read order or refund'; end if;
  v_denied:=false;
  begin perform public.cancel_order(v_b,'TEST other customer');
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'A03 other customer cancelled order'; end if;
  v_denied:=false;
  begin perform public.request_demo_refund(v_a,'other-customer-refund','TEST forbidden request');
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'B06 customer requested refund'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_response:=public.request_demo_refund(v_c,'refund-reject-request','TEST rejected refund');
  v_reject:=(v_response->>'refund_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.reject_demo_refund(v_reject,'TEST refund rejected by admin');
  if (public.reject_demo_refund(v_reject,'TEST refund rejected by admin')->>'replayed')::boolean is not true then
    raise exception 'B03 rejection replay incorrect'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied:=false;
  begin perform public.execute_demo_refund(v_reject,'TEST-REJECTED-REFUND');
  exception when others then v_denied:=sqlerrm='REFUND_NOT_APPROVED_OR_UNSUPPORTED_METHOD'; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  if not v_denied or (select status from public.payments where id=v_reject)<>'failed' or
    (select count(*) from public.audit_log where entity_id=v_reject and action='demo_refund_rejected')<>1 then
    raise exception 'B03 rejected refund execution or audit incorrect'; end if;
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','full-points-refund','items',jsonb_build_array(jsonb_build_object('product_id','eeeeeeee-1111-4111-8111-eeeeeeeeeee1','quantity',1))));
  v_full:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_full,true);
  perform public.transition_order(v_full,'confirmed',false,null);
  perform public.transition_order(v_full,'preparing',false,null);
  perform public.transition_order(v_full,'completed',true,null);
  v_response:=public.request_demo_refund(v_full,'full-points-refund-request','TEST refund with all earned points available');
  v_full_refund:=(v_response->>'refund_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.approve_demo_refund(v_full_refund);
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.execute_demo_refund(v_full_refund,'TEST-FULL-RECEIPT');
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  select points,point_debt into v_points,v_debt from public.loyalty_accounts where customer_id=v_other;
  if v_points<>0 or v_debt<>0 or
    (select points from public.loyalty_transactions where order_id=v_full and transaction_type='CLAWBACK')<>-350 then
    raise exception 'E01 full available clawback incorrect'; end if;
  raise notice 'EVIDENCE E01 available=% debt=% clawback_points=%',v_points,v_debt,
    (select points from public.loyalty_transactions where order_id=v_full and transaction_type='CLAWBACK');
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied:=false;
  begin perform public.request_demo_refund(v_vnpay,'vnpay-demo-forbidden','TEST VNPAY must not use demo refund');
  exception when others then v_denied:=sqlerrm='DEMO_PAID_CHARGE_REQUIRED'; end;
  if not v_denied or exists(select 1 from public.payments where order_id=v_vnpay and kind='refund') then
    raise exception 'B15 VNPAY demo refund accepted'; end if;
  raise notice 'EVIDENCE B15 vnpay_demo_refund_count=%',
    (select count(*) from public.payments where order_id=v_vnpay and kind='refund');
  v_response:=public.request_demo_refund(v_shipping,'shipping-full-refund','TEST shipping and merchandise refund');
  v_shipping_refund:=(v_response->>'refund_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.approve_demo_refund(v_shipping_refund);
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.execute_demo_refund(v_shipping_refund,'TEST-SHIPPING-RECEIPT');
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  if (select amount from public.payments where id=v_shipping_refund)<>130000 or
    (select product_amount from public.payments where id=v_shipping_refund)<>100000 or
    (select shipping_amount from public.payments where id=v_shipping_refund)<>30000 or
    (select payment_status from public.orders where id=v_shipping)<>'refunded' or
    (select new_value->>'product_amount' from public.audit_log where entity_id=v_shipping_refund and action='demo_refund_executed_with_reference')<>'100000' or
    (select new_value->>'shipping_amount' from public.audit_log where entity_id=v_shipping_refund and action='demo_refund_executed_with_reference')<>'30000' then
    raise exception 'B13 product and shipping refund not separately recorded'; end if;
  raise notice 'EVIDENCE B13 refund_total=% product_refund=% shipping_refund=% payment_status=%',
    (select amount from public.payments where id=v_shipping_refund),
    (select product_amount from public.payments where id=v_shipping_refund),
    (select shipping_amount from public.payments where id=v_shipping_refund),
    (select payment_status from public.orders where id=v_shipping);
end $$;

reset role;
rollback;
