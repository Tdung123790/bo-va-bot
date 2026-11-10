begin;
do $$
begin
 if has_function_privilege('anon','public.issue_delivery_proof(uuid,text,text,numeric,numeric,text)','EXECUTE')
   or has_function_privilege('authenticated','public.issue_delivery_proof(uuid,text,text,numeric,numeric,text)','EXECUTE')
   or has_table_privilege('authenticated','private.delivery_proofs','SELECT')
   or has_table_privilege('authenticated','private.delivery_proofs','UPDATE') then
   raise exception 'Delivery proof client privileges are unsafe'; end if;
end $$;
do $$
declare denied boolean;
begin
 perform private.delivery_window('2026-11-09 16:00+07',false,'pickup','2026-11-09 14:00+07');
 denied:=false;
 begin perform private.delivery_window('2026-11-09 15:59:59+07',false,'pickup','2026-11-09 14:00+07');
 exception when others then denied:=sqlerrm='REGULAR_CAKE_REQUIRES_2_HOURS'; end;
 if not denied then raise exception 'Regular 2h boundary failed'; end if;
 perform private.delivery_window('2026-11-10 14:00+07',true,'pickup','2026-11-09 14:00+07');
 denied:=false;
 begin perform private.delivery_window('2026-11-10 13:59:59+07',true,'pickup','2026-11-09 14:00+07');
 exception when others then denied:=sqlerrm='CUSTOM_CAKE_REQUIRES_24_HOURS'; end;
 if not denied then raise exception 'Custom 24h boundary failed'; end if;
 perform private.delivery_window('2026-11-09 18:30+07',false,'delivery','2026-11-09 16:30+07');
 denied:=false;
 begin perform private.delivery_window('2026-11-09 18:30+07',false,'delivery','2026-11-09 17:00+07');
 exception when others then denied:=sqlerrm='SAME_DAY_DELIVERY_CUTOFF'; end;
 if not denied then raise exception '17h delivery cutoff failed'; end if;
 denied:=false;
 begin perform private.delivery_window('2026-11-10 19:00+07',false,'delivery','2026-11-09 15:00+07');
 exception when others then denied:=sqlerrm='OUTSIDE_DELIVERY_HOURS'; end;
 if not denied then raise exception '19h delivery end boundary failed'; end if;
 denied:=false;
 begin perform private.delivery_window('2026-11-10 20:00+07',false,'pickup','2026-11-09 15:00+07');
 exception when others then denied:=sqlerrm='OUTSIDE_PICKUP_HOURS'; end;
 if not denied then raise exception '20h pickup end boundary failed'; end if;
end $$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','delivery-customer-a@example.invalid','test',now()),
 ('bbbbbbbb-1919-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','delivery-customer-b@example.invalid','test',now());
insert into public.categories(id,name,status)
values('cccccccc-1919-4ccc-8ccc-ccccccccccc3','TEST Delivery','active');
insert into public.products(id,category_id,name,base_price,stock_quantity,status)
values('dddddddd-1919-4ddd-8ddd-ddddddddddd4',
 'cccccccc-1919-4ccc-8ccc-ccccccccccc3','TEST Cake',100000,1,'active');
insert into public.promotions(id,name,discount_type,discount_value,target_type,starts_at,ends_at,status)
values('eeeeeeee-1919-4eee-8eee-eeeeeeeeeee5','TEST 10k','FIXED',10000,'ALL',
 now()-interval '1 day',now()+interval '7 days','active');
insert into public.store_settings(store_key,bakery_lat,bakery_lng,delivery_origin_approved_at,delivery_origin_approval_source)
values('main',10.800000,106.700000,now(),'TEST_APPROVED_FIXTURE');
update public.loyalty_accounts set points=1000,total_earned=1000
 where customer_id='aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1';
insert into public.loyalty_transactions(customer_id,points,gross_points,transaction_type,event_key)
values('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',1000,1000,'EARN','test-delivery-opening');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare proof jsonb;denied boolean:=false;
begin
 proof:=public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-1','12 TEST Street, Ho Chi Minh City',10.800000,106.700000,'TEST_PLACE_1');
 perform set_config('bobot.test.proof_id',proof->>'proof_id',true);
 proof:=public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-4km','12 TEST Street, Ho Chi Minh City',10.836000,106.700000,'TEST_PLACE_4');
 perform set_config('bobot.test.proof_4km',proof->>'proof_id',true);
 proof:=public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-8km','12 TEST Street, Ho Chi Minh City',10.872000,106.700000,'TEST_PLACE_8');
 perform set_config('bobot.test.proof_8km',proof->>'proof_id',true);
 proof:=public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-11km','12 TEST Street, Ho Chi Minh City',10.900000,106.700000,'TEST_PLACE_11');
 perform set_config('bobot.test.proof_11km',proof->>'proof_id',true);
 proof:=public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-expired','12 TEST Street, Ho Chi Minh City',10.800000,106.700000,'TEST_PLACE_EXP');
 perform set_config('bobot.test.proof_expired',proof->>'proof_id',true);
 begin perform public.issue_delivery_proof('aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',
   'delivery-too-many','12 TEST Street, Ho Chi Minh City',10.800000,106.700000,'TEST_PLACE_LIMIT');
 exception when others then denied:=sqlerrm='DELIVERY_VERIFICATION_RATE_LIMIT'; end;
 if not denied then raise exception 'Proof issuance rate limit failed'; end if;
end $$;
reset role;
update public.store_settings set bakery_lat=10.810000 where store_key='main';
do $$
begin
 if (select delivery_origin_approved_at from public.store_settings where store_key='main') is not null
   then raise exception 'Changed bakery coordinate kept approval'; end if;
end $$;
update public.store_settings set bakery_lat=10.800000 where store_key='main';
update public.store_settings set delivery_origin_approved_at=now(),
 delivery_origin_approval_source='TEST_APPROVED_FIXTURE' where store_key='main';
update private.delivery_proofs set expires_at=now()-interval '1 second'
 where id=current_setting('bobot.test.proof_expired')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$
declare request jsonb;quote jsonb;placed jsonb;v_order_id uuid;denied boolean;
begin
 request:=jsonb_build_object('request_id','delivery-1','fulfillment_type','delivery',
  'delivery_proof_id',current_setting('bobot.test.proof_id'),
  'ship_address','12 TEST Street, Ho Chi Minh City',
  'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')
    +interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),
  'points_used',1000,'payment_method','cod','recipient_name','TEST Customer',
  'recipient_phone','0900000000','items',jsonb_build_array(jsonb_build_object(
    'product_id','dddddddd-1919-4ddd-8ddd-ddddddddddd4','quantity',1)));
 quote:=public.quote_order(request);
 if (quote->>'shipping_fee')::bigint<>20000
   or (quote->>'discount_amount')::bigint<>10000
   or (quote->>'points_discount_amount')::bigint<>10000
   or (quote->>'total_amount')::bigint<>100000 then
   raise exception 'Delivery fee, promotion, loyalty or total mismatch'; end if;
 quote:=public.quote_order(request||jsonb_build_object('request_id','delivery-4km',
   'delivery_proof_id',current_setting('bobot.test.proof_4km')));
 if (quote->>'shipping_fee')::bigint<>30000 then raise exception '4km shipping fee mismatch'; end if;
 quote:=public.quote_order(request||jsonb_build_object('request_id','delivery-8km',
   'delivery_proof_id',current_setting('bobot.test.proof_8km')));
 if (quote->>'shipping_fee')::bigint<>50000 then raise exception '8km shipping fee mismatch'; end if;
 denied:=false;
 begin perform public.quote_order(request||jsonb_build_object('request_id','delivery-11km',
   'delivery_proof_id',current_setting('bobot.test.proof_11km')));
 exception when others then denied:=sqlerrm='OUTSIDE_DELIVERY_AREA'; end;
 if not denied then raise exception 'Outside 10km accepted'; end if;
 denied:=false;
 begin perform public.quote_order(request||jsonb_build_object('request_id','delivery-expired',
   'delivery_proof_id',current_setting('bobot.test.proof_expired')));
 exception when others then denied:=sqlerrm='DELIVERY_PROOF_INVALID_OR_EXPIRED'; end;
 if not denied then raise exception 'Expired proof accepted'; end if;
 denied:=false;
 begin perform public.quote_order(request||'{"delivery_lat":0,"delivery_lng":0,"shipping_fee":0}'::jsonb);
 exception when others then denied:=sqlerrm='UNTRUSTED_DELIVERY_COORDINATES'; end;
 if not denied then raise exception 'Spoofed coordinates or fee accepted'; end if;
 denied:=false;
 begin perform public.quote_order(request||'{"ship_address":"999 Fake Road, Ho Chi Minh City"}'::jsonb);
 exception when others then denied:=sqlerrm='DELIVERY_PROOF_INVALID_OR_EXPIRED'; end;
 if not denied then raise exception 'Changed address accepted'; end if;
 denied:=false;
 begin perform public.quote_order(request||'{"request_id":"delivery-replay"}'::jsonb);
 exception when others then denied:=sqlerrm='DELIVERY_PROOF_INVALID_OR_EXPIRED'; end;
 if not denied then raise exception 'Proof replay under another request accepted'; end if;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-1919-4bbb-8bbb-bbbbbbbbbbb2',true);
 denied:=false;
 begin perform public.quote_order(request);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Customer B used Customer A proof'; end if;
 perform set_config('request.jwt.claim.sub','aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1',true);
 denied:=false;
 begin perform (select id from private.delivery_proofs limit 1);
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Customer read private proof table'; end if;
 placed:=public.create_online_order(request);
 v_order_id:=(placed->>'order_id')::uuid;
 if (public.create_online_order(request)->>'order_id')::uuid<>v_order_id
   or (select stock_quantity from public.products where id='dddddddd-1919-4ddd-8ddd-ddddddddddd4')<>0
   or (select points from public.loyalty_accounts where customer_id='aaaaaaaa-1919-4aaa-8aaa-aaaaaaaaaaa1')<>0
   or (select payment_status from public.orders where id=v_order_id)<>'unpaid' then
   raise exception 'Delivery create/retry/stock/payment/points mismatch'; end if;
 denied:=false;
 begin perform public.create_online_order(request||'{"notes":"changed"}'::jsonb);
 exception when others then denied:=sqlerrm='IDEMPOTENCY_PAYLOAD_MISMATCH'; end;
 if not denied then raise exception 'Changed request replay accepted'; end if;
 if exists(select 1 from public.loyalty_transactions where order_id=v_order_id and transaction_type='EARN')
   then raise exception 'Unpaid delivery earned loyalty'; end if;
end $$;
reset role;
rollback;
