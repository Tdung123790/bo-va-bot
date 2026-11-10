do $$
begin
  if (select count(*) from public.orders
      where client_request_id in ('promo-a','promo-b'))<>2
    then raise exception 'Both independent promo-race orders must commit'; end if;
  if (select count(*) from public.orders
      where client_request_id in ('promo-a','promo-b') and discount_amount=10000)<>1
    or (select count(*) from public.orders
      where client_request_id in ('promo-a','promo-b') and discount_amount=0)<>1
    or (select used_count from public.promotions
      where id='44444444-aaaa-4444-8444-444444444444')<>1
    then raise exception 'Promotion usage limit raced'; end if;
  if (select stock_quantity from public.products
      where id='99999999-aaaa-4999-8999-999999999999')<>0
    then raise exception 'Promotion race stock mismatch'; end if;
end $$;
begin;
select set_config('request.jwt.claim.sub',(
  select customer_id::text from public.orders
    where promotion_id='44444444-aaaa-4444-8444-444444444444'),true);
set local role authenticated;
do $$
declare v_order uuid;v_request jsonb;
begin
  select id into v_order from public.orders
    where promotion_id='44444444-aaaa-4444-8444-444444444444';
  perform public.cancel_order(v_order,'quota release test');
  perform public.cancel_order(v_order,'quota release test');
  v_request:=jsonb_build_object('request_id','promo-reuse',
    'fulfillment_type','pickup','payment_method','cod',
    'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),'recipient_name','Promo retry',
    'recipient_phone','0123456789','items',jsonb_build_array(jsonb_build_object(
      'product_id','99999999-aaaa-4999-8999-999999999999','quantity',1)));
  if (public.create_online_order(v_request)->>'replayed')::boolean is distinct from false
    then raise exception 'Released customer quota was not reusable'; end if;
end $$;
commit;
do $$
begin
  if (select used_count from public.promotions
      where id='44444444-aaaa-4444-8444-444444444444')<>1
    or (select count(*) from public.orders
      where promotion_id='44444444-aaaa-4444-8444-444444444444'
        and promotion_usage_claimed)<>1
    or (select count(*) from public.orders where client_request_id='promo-reuse'
        and discount_amount=10000)<>1
    then raise exception 'E-01 quota release/reuse count invalid'; end if;
  if (select stock_quantity from public.products
      where id='99999999-aaaa-4999-8999-999999999999')<>0
    then raise exception 'E-01 replay changed final stock'; end if;
  if (select count(*) from public.order_status_history h
      join public.orders o on o.id=h.order_id
      where o.promotion_id='44444444-aaaa-4444-8444-444444444444'
        and h.to_status='cancelled')<>1
    or (select count(*) from public.audit_log
      where action='order_cancel' and entity_id in
        (select id from public.orders
          where promotion_id='44444444-aaaa-4444-8444-444444444444'))<>1
    then raise exception 'E-01 duplicate cancellation wrote duplicate history/audit'; end if;
end $$;
