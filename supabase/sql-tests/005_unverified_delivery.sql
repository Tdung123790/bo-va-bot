begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values('51515151-5151-4515-8515-515151515151',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint3-delivery@example.invalid','test',now());
insert into public.categories(id,name)
values('52525252-5252-4525-8525-525252525252','TEST category');
insert into public.products(id,category_id,name,base_price,stock_quantity)
values('53535353-5353-4535-8535-535353535353',
  '52525252-5252-4525-8525-525252525252','TEST product',100000,2);
insert into public.store_settings(store_key,bakery_lat,bakery_lng,delivery_hours,
  service_area,shipping_tiers)
values('main',10.8,106.7,
  '{"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],
    "3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],
    "5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}],
    "7":[{"start":"00:00","end":"24:00"}]}'::jsonb,
  '{"max_km":10}'::jsonb,'[{"max_km":10,"fee":15000}]'::jsonb)
on conflict(store_key) do update set bakery_lat=excluded.bakery_lat,bakery_lng=excluded.bakery_lng,
  delivery_hours=excluded.delivery_hours,service_area=excluded.service_area,shipping_tiers=excluded.shipping_tiers;
set local role authenticated;
select set_config('request.jwt.claim.sub','51515151-5151-4515-8515-515151515151',true);
do $$
declare v_request jsonb;v_variant jsonb;v_rejected boolean:=false;
begin
  v_request:=jsonb_build_object('request_id','delivery-fake-coordinates',
    'fulfillment_type','delivery','payment_method','cod',
    'requested_at',now()+interval '48 hours','recipient_name','TEST',
    'recipient_phone','0123456789','ship_address','TEST address',
    'delivery_lat',10.8,'delivery_lng',106.7,
    'items',jsonb_build_array(jsonb_build_object(
      'product_id','53535353-5353-4535-8535-535353535353','quantity',1)));
  for v_variant in select value from jsonb_array_elements(jsonb_build_array(
      v_request,
      v_request || jsonb_build_object('delivery_lat',0,'delivery_lng',0,'shipping_fee',0),
      v_request || jsonb_build_object('ship_address','TEST wrong address','delivery_lat',10.8,'delivery_lng',106.7),
      v_request - 'delivery_lat' - 'delivery_lng' || jsonb_build_object('shipping_fee',0),
      v_request || jsonb_build_object('request_id','delivery-replay','verified_address_id','FAKE','shipping_fee',0)
    )) loop
    v_rejected:=false;
    begin perform public.quote_order(v_variant);
    exception when others then
      v_rejected:=sqlerrm='UNTRUSTED_DELIVERY_COORDINATES'; end;
    if not v_rejected then raise exception 'Unverified delivery accepted by quote'; end if;
    v_rejected:=false;
    begin perform public.create_online_order(v_variant);
    exception when others then
      v_rejected:=sqlerrm='UNTRUSTED_DELIVERY_COORDINATES'; end;
    if not v_rejected then raise exception 'Unverified delivery accepted by checkout'; end if;
  end loop;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.orders
      where customer_id='51515151-5151-4515-8515-515151515151')<>0
    or (select count(*) from public.payments where order_id in
      (select id from public.orders where customer_id='51515151-5151-4515-8515-515151515151'))<>0
    or (select stock_quantity from public.products
      where id='53535353-5353-4535-8535-535353535353')<>2
    then raise exception 'Rejected delivery left a transaction side effect'; end if;
end $$;
rollback;
