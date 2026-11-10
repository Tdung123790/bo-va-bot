begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','loyalty-final-customer@example.invalid','test',now()),
 ('bbbbbbbb-0909-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','loyalty-final-staff@example.invalid','test',now());
update public.profiles set role='staff' where id='bbbbbbbb-0909-4bbb-8bbb-bbbbbbbbbbb2';
insert into public.categories(id,name,status)
values('cccccccc-0909-4ccc-8ccc-ccccccccccc3','TEST Loyalty FINAL','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status)
values('dddddddd-0909-4ddd-8ddd-ddddddddddd4',
 'cccccccc-0909-4ccc-8ccc-ccccccccccc3','TEST Cake',100000,2,'active');
insert into public.promotions(id,name,discount_type,discount_value,target_type,starts_at,ends_at,status)
values('eeeeeeee-0909-4eee-8eee-eeeeeeeeeee5','TEST 10k','FIXED',10000,'ALL',
 now()-interval '1 day',now()+interval '1 day','active');
insert into public.store_settings(store_key,pickup_hours)
values('main','{"1":[{"start":"00:00","end":"24:00"}],
"2":[{"start":"00:00","end":"24:00"}],
"3":[{"start":"00:00","end":"24:00"}],
"4":[{"start":"00:00","end":"24:00"}],
"5":[{"start":"00:00","end":"24:00"}],
"6":[{"start":"00:00","end":"24:00"}],
"7":[{"start":"00:00","end":"24:00"}]}'::jsonb);
update public.loyalty_accounts set points=1000,total_earned=1000
 where customer_id='aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1';
insert into public.loyalty_transactions(customer_id,points,gross_points,transaction_type,event_key,description)
values('aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1',1000,1000,'EARN','test-historical-opening','Historical TEST opening balance');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare request jsonb;quote jsonb;created jsonb;v_order_id uuid;denied boolean:=false;
begin
 request:=jsonb_build_object('request_id','loyalty-final-1','payment_method','cod',
  'fulfillment_type','pickup','requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
  'recipient_name','TEST Customer','recipient_phone','0900000000','points_used',1000,
  'items',jsonb_build_array(jsonb_build_object('product_id',
    'dddddddd-0909-4ddd-8ddd-ddddddddddd4','quantity',1)));
 quote:=public.quote_order(request);
 if (quote->>'subtotal')::bigint<>100000 or (quote->>'discount_amount')::bigint<>10000
  or (quote->>'points_discount_amount')::bigint<>10000
  or (quote->>'total_amount')::bigint<>80000 then
  raise exception 'FINAL 90k minus 1000 points did not equal 80k'; end if;
 begin perform public.quote_order(request||'{"points_used":1801}'::jsonb);
 exception when others then denied:=sqlerrm='POINTS_CAP_EXCEEDED'; end;
 if not denied then raise exception 'FINAL 20 percent cap not enforced'; end if;
 denied:=false;
 begin perform public.quote_order(request||'{"points_used":1001}'::jsonb);
 exception when others then denied:=sqlerrm='INSUFFICIENT_POINTS'; end;
 if not denied then raise exception 'Available points not enforced'; end if;
 created:=public.create_online_order(request);
 v_order_id:=(created->>'order_id')::uuid;
 if (public.create_online_order(request)->>'order_id')::uuid<>v_order_id
  or (select points from public.loyalty_accounts where customer_id='aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1')<>0
  or (select count(*) from public.loyalty_transactions where order_id=v_order_id and transaction_type='REDEEM')<>1
  then raise exception 'FINAL redeem/idempotency failed'; end if;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-0909-4bbb-8bbb-bbbbbbbbbbb2',true);
 perform public.transition_order(v_order_id,'confirmed');
 perform public.transition_order(v_order_id,'preparing');
 perform public.transition_order(v_order_id,'completed',true);
 perform set_config('request.jwt.claim.sub','aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1',true);
 if exists(select 1 from public.loyalty_transactions where order_id=v_order_id and transaction_type='EARN')
  then raise exception 'Unpaid completed order earned points'; end if;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-0909-4bbb-8bbb-bbbbbbbbbbb2',true);
 perform public.confirm_demo_payment(v_order_id,true);
 denied:=false;
 begin perform public.confirm_demo_payment(v_order_id,true);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Duplicate payment confirmation accepted'; end if;
 perform set_config('request.jwt.claim.sub','aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1',true);
 if (select gross_points from public.loyalty_transactions where order_id=v_order_id and transaction_type='EARN')<>80
  or (select points from public.loyalty_accounts where customer_id='aaaaaaaa-0909-4aaa-8aaa-aaaaaaaaaaa1')<>80
  then raise exception 'Completed and paid 80k merchandise did not earn 80 points'; end if;
 if (select count(*) from public.loyalty_transactions where order_id=v_order_id and transaction_type='EARN')<>1
  then raise exception 'Duplicate EARN accepted'; end if;
 if (select gross_points from public.loyalty_transactions where event_key='test-historical-opening')<>1000
  then raise exception 'Historical ledger was rewritten'; end if;
end $$;
reset role;
rollback;
