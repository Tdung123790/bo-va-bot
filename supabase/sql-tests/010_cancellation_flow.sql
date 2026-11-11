begin;

update public.promotions set status='inactive' where status='active';

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-customer-a@example.invalid','test',now()),
 ('aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-customer-b@example.invalid','test',now()),
 ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbb1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-staff@example.invalid','test',now());
update public.profiles set role='staff' where id='bbbbbbbb-2222-4222-8222-bbbbbbbbbbb1';
insert into public.categories(id,name,status)
values('cccccccc-2222-4222-8222-ccccccccccc1','TEST cancel category','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status,is_customizable)
values
 ('dddddddd-2222-4222-8222-ddddddddddd1','cccccccc-2222-4222-8222-ccccccccccc1','TEST standard',100000,10,'active',false),
 ('dddddddd-2222-4222-8222-ddddddddddd2','cccccccc-2222-4222-8222-ccccccccccc1','TEST custom',100000,10,'active',true);
insert into public.promotions(id,name,discount_type,discount_value,target_type,starts_at,ends_at,status,used_count)
values('eeeeeeee-2222-4222-8222-eeeeeeeeeee1','TEST promo','FIXED',10000,'ALL',now()-interval '1 day',now()+interval '1 day','inactive',1);
insert into public.store_settings(store_key,pickup_hours)
values('main','{"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}],"7":[{"start":"00:00","end":"24:00"}]}'::jsonb)
on conflict(store_key) do update set pickup_hours=excluded.pickup_hours;
update public.loyalty_accounts set points=100,total_earned=100 where customer_id='aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1';
insert into public.loyalty_transactions(customer_id,points,gross_points,transaction_type,event_key,description)
values('aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1',100,100,'EARN','test-opening-cancel','TEST opening points');

insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,
  client_request_id,request_payload,requested_at,subtotal,total_amount,order_status)
values('ffffffff-2222-4222-8222-fffffffffff1','TEST-CUSTOM-CANCEL',
  'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1','aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1',
  'online','pickup','custom-cancel','{}'::jsonb,now()+interval '3 days',100000,100000,'pending');
insert into public.order_items(order_id,line_no,product_id,product_name_snapshot,unit_price,quantity,subtotal,customization_data)
values('ffffffff-2222-4222-8222-fffffffffff1',1,'dddddddd-2222-4222-8222-ddddddddddd2','TEST custom',100000,1,100000,'{"size":"TEST"}'::jsonb);
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,
  client_request_id,request_payload,requested_at,subtotal,discount_amount,total_amount,order_status,promotion_id,promotion_usage_claimed)
values('ffffffff-2222-4222-8222-fffffffffff2','TEST-PROMO-CANCEL',
  'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1','aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1',
  'online','pickup','promo-cancel','{}'::jsonb,now()+interval '3 days',100000,10000,90000,'pending',
  'eeeeeeee-2222-4222-8222-eeeeeeeeeee1',true);
insert into public.orders(id,order_code,customer_id,created_by,sales_channel,fulfillment_type,
  client_request_id,request_payload,requested_at,ship_address,subtotal,total_amount,order_status)
values('ffffffff-2222-4222-8222-fffffffffff3','TEST-SHIPPING-CANCEL',
  'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1','aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1',
  'online','delivery','shipping-cancel','{}'::jsonb,now()+interval '3 days','TEST delivery address',100000,100000,'shipping');

set local role authenticated;

do $$
declare v_customer uuid:='aaaaaaaa-2222-4222-8222-aaaaaaaaaaa1';
  v_other uuid:='aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2';
  v_staff uuid:='bbbbbbbb-2222-4222-8222-bbbbbbbbbbb1';
  v_pending uuid;v_confirmed uuid;v_preparing uuid;v_paid uuid;v_completed uuid;
  v_custom uuid:='ffffffff-2222-4222-8222-fffffffffff1';
  v_promo uuid:='ffffffff-2222-4222-8222-fffffffffff2';
  v_shipping uuid:='ffffffff-2222-4222-8222-fffffffffff3';
  v_request uuid;v_response jsonb;v_base jsonb;v_denied boolean;v_stock integer;
begin
  v_base:=jsonb_build_object('payment_method','cod','fulfillment_type','pickup',
    'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
    'recipient_name','TEST Customer','recipient_phone','0900000000','points_used',0,
    'items',jsonb_build_array(jsonb_build_object('product_id','dddddddd-2222-4222-8222-ddddddddddd1','quantity',1)));
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','cancel-pending-100','points_used',100));
  v_pending:=(v_response->>'order_id')::uuid;
  if (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1')<>9 then
    raise exception 'A11 stock was not reserved'; end if;
  perform public.cancel_order(v_pending,'TEST early cancellation');
  if (public.cancel_order(v_pending,'TEST retry')->>'replayed')::boolean is not true or
    (select points from public.loyalty_accounts where customer_id=v_customer)<>100 or
    (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1')<>10 or
    (select count(*) from public.loyalty_transactions where order_id=v_pending and transaction_type='RESTORE')<>1 then
    raise exception 'A01/C01/C02/A10 early cancel or retry incorrect'; end if;
  raise notice 'EVIDENCE A01 status=% available=% stock=% restore_count=%',
    (select order_status from public.orders where id=v_pending),
    (select points from public.loyalty_accounts where customer_id=v_customer),
    (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1'),
    (select count(*) from public.loyalty_transactions where order_id=v_pending and transaction_type='RESTORE');
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','cancel-confirmed'));
  v_confirmed:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.transition_order(v_confirmed,'confirmed',false,null);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.cancel_order(v_confirmed,'TEST confirmed cancellation');
  if (select order_status from public.orders where id=v_confirmed)<>'cancelled' or
    (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1')<>10 or
    exists(select 1 from public.loyalty_transactions where order_id=v_confirmed and transaction_type='RESTORE') then
    raise exception 'A02/C04 confirmed cancel incorrect'; end if;
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','cancel-preparing'));
  v_preparing:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.transition_order(v_preparing,'confirmed',false,null);
  perform public.transition_order(v_preparing,'preparing',false,null);
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_denied:=false;
  begin perform public.cancel_order(v_preparing,'TEST other owner');
  exception when others then v_denied:=sqlstate='42501'; end;
  if not v_denied then raise exception 'A03 other customer cancelled'; end if;
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_denied:=false;
  begin perform public.cancel_order(v_preparing,'TEST direct preparing');
  exception when others then v_denied:=sqlerrm='CANCELLATION_NOT_ALLOWED'; end;
  if not v_denied then raise exception 'A04 customer direct preparing cancel'; end if;
  v_response:=public.submit_order_cancel_request(v_preparing,'TEST cancel request preparing');
  v_request:=(v_response->>'request_id')::uuid;
  if (public.submit_order_cancel_request(v_preparing,'TEST retry request')->>'replayed')::boolean is not true or
    (select order_status from public.orders where id=v_preparing)<>'preparing' then
    raise exception 'A05 request changed order or duplicated'; end if;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied:=false;
  begin perform public.transition_order(v_preparing,'completed',true,null);
  exception when others then v_denied:=sqlerrm='ORDER_CANCELLATION_PENDING'; end;
  if not v_denied then raise exception 'A05 pending request allowed status transition'; end if;
  perform public.resolve_order_cancel_request(v_request,false,'TEST reject cancellation',false);
  if (select order_status from public.orders where id=v_preparing)<>'preparing' or
    (select cancel_resolution_note from public.orders where id=v_preparing)<>'TEST reject cancellation' then
    raise exception 'A07 rejected request state incorrect'; end if;
  raise notice 'EVIDENCE A07 status=% request_status=%',
    (select order_status from public.orders where id=v_preparing),
    (select cancel_request_status from public.orders where id=v_preparing);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.submit_order_cancel_request(v_preparing,'TEST second cancel request');
  v_request:=(v_response->>'request_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.resolve_order_cancel_request(v_request,true,'TEST approve no restock',false);
  if (select order_status from public.orders where id=v_preparing)<>'cancelled' or
    (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1')<>9 or
    (select count(*) from public.order_status_history where order_id=v_preparing and to_status='cancelled')<>1 then
    raise exception 'A06/A12 approved cancellation or stock incorrect'; end if;
  raise notice 'EVIDENCE A06 status=% stock=% cancelled_history_count=%',
    (select order_status from public.orders where id=v_preparing),
    (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd1'),
    (select count(*) from public.order_status_history where order_id=v_preparing and to_status='cancelled');
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','cancel-paid'));
  v_paid:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_paid,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.cancel_order(v_paid,'TEST paid cancellation');
  if (select payment_status from public.orders where id=v_paid)<>'paid' or
    exists(select 1 from public.payments where order_id=v_paid and kind='refund') then
    raise exception 'B11/C05 paid cancellation auto refunded'; end if;
  raise notice 'EVIDENCE C05 status=% payment_status=% refund_count=%',
    (select order_status from public.orders where id=v_paid),
    (select payment_status from public.orders where id=v_paid),
    (select count(*) from public.payments where order_id=v_paid and kind='refund');
  v_response:=public.create_online_order(v_base||jsonb_build_object('request_id','cancel-completed'));
  v_completed:=(v_response->>'order_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.confirm_demo_payment(v_completed,true);
  perform public.transition_order(v_completed,'confirmed',false,null);
  perform public.transition_order(v_completed,'preparing',false,null);
  perform public.transition_order(v_completed,'completed',true,null);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_denied:=false;
  begin perform public.cancel_order(v_completed,'TEST completed cancellation');
  exception when others then v_denied:=sqlerrm='CANCELLATION_NOT_ALLOWED'; end;
  if not v_denied or (select order_status from public.orders where id=v_completed)<>'completed' then
    raise exception 'A09 completed order cancelled'; end if;
  select stock_quantity into v_stock from public.products where id='dddddddd-2222-4222-8222-ddddddddddd2';
  perform public.cancel_order(v_custom,'TEST custom cancellation');
  if (select stock_quantity from public.products where id='dddddddd-2222-4222-8222-ddddddddddd2')<>v_stock then
    raise exception 'A13 custom cake changed finished inventory'; end if;
  perform public.cancel_order(v_promo,'TEST promo cancellation');
  perform public.cancel_order(v_promo,'TEST promo retry');
  if (select used_count from public.promotions where id='eeeeeeee-2222-4222-8222-eeeeeeeeeee1')<>0 then
    raise exception 'C03/A10 promotion quota restored incorrectly'; end if;
  v_response:=public.submit_order_cancel_request(v_shipping,'TEST shipping cancellation request');
  if (select order_status from public.orders where id=v_shipping)<>'shipping' or
    (select cancel_request_status from public.orders where id=v_shipping)<>'pending' then
    raise exception 'A08 shipping request auto cancelled'; end if;
end $$;

reset role;
rollback;
