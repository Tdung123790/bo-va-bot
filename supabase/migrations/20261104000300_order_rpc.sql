-- One advisory transaction lock keeps the local baseline serializable for order-side
-- stock, promotion usage, points and analytics. It can be narrowed only after race tests.
create function private.place_order(p_channel text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_customer uuid;v_role text;v_request_id text;
  v_existing public.orders%rowtype;v_id uuid;v_code text;v_quote jsonb;
  v_items jsonb;v_fulfillment text;v_method text;v_requested timestamptz;
  v_points integer;v_line jsonb;v_line_no integer:=0;v_product uuid;
  v_variant uuid;v_qty integer;v_promotion uuid;v_recipient text;v_phone text;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'INVALID_REQUEST'; end if;
  if p_channel='online' then
    v_actor:=private.require_actor(array['customer']);v_customer:=v_actor;
  elsif p_channel='offline' then
    v_actor:=private.require_actor(array['staff','admin']);v_customer:=null;
    if (p_request ? 'customer_id' and nullif(p_request->>'customer_id','') is not null)
      or p_request ? 'pos_link_code' or p_request ? 'verification_code' then
      raise exception 'POS_CUSTOMER_LINK_REQUIRES_VERIFICATION'; end if;
  else raise exception 'INVALID_CHANNEL'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  if p_channel='online' then perform private.require_actor(array['customer']);
  else perform private.require_actor(array['staff','admin']); end if;
  v_request_id:=nullif(btrim(p_request->>'request_id'),'');
  if v_request_id is null or length(v_request_id)>200 then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select * into v_existing from public.orders
    where sales_channel=p_channel and created_by=v_actor and client_request_id=v_request_id;
  if found then
    if v_existing.request_payload<>p_request then raise exception 'IDEMPOTENCY_PAYLOAD_MISMATCH'; end if;
    return jsonb_build_object('order_id',v_existing.id,'order_code',v_existing.order_code,
      'total_amount',v_existing.total_amount,'replayed',true);
  end if;
  v_items:=p_request->'items';
  v_fulfillment:=p_request->>'fulfillment_type';
  v_method:=p_request->>'payment_method';
  if p_channel='online' then
    if v_fulfillment not in ('pickup','delivery')
      or v_method not in ('cod','bank_transfer_demo','vnpay') then raise exception 'INVALID_ONLINE_METHOD'; end if;
    v_requested:=(p_request->>'requested_at')::timestamptz;
    v_recipient:=nullif(btrim(p_request->>'recipient_name'),'');
    v_phone:=nullif(btrim(p_request->>'recipient_phone'),'');
    if v_recipient is null or v_phone is null or v_phone !~ '^0[0-9]{9}$' then
      raise exception 'RECIPIENT_REQUIRED'; end if;
    if v_fulfillment='delivery' and nullif(btrim(p_request->>'ship_address'),'') is null then
      raise exception 'ADDRESS_REQUIRED'; end if;
  else
    if v_fulfillment<>'counter' or v_method<>'cash_demo' then
      raise exception 'INVALID_POS_METHOD'; end if;
    v_requested:=null;v_recipient:=null;v_phone:=null;
  end if;
  v_points:=coalesce((p_request->>'points_used')::integer,0);
  if p_channel='offline' and v_points<>0 then raise exception 'POS_GUEST_CANNOT_REDEEM'; end if;
  v_quote:=private.quote_core(v_items,v_fulfillment,v_requested,
    (p_request->>'delivery_lat')::numeric,(p_request->>'delivery_lng')::numeric,
    v_points,v_customer);
  if v_method='vnpay' and (v_quote->>'total_amount')::bigint not between 5000 and 9999999999
    then raise exception 'VNPAY_AMOUNT_OUT_OF_RANGE'; end if;
  v_promotion:=(v_quote->>'promotion_id')::uuid;
  if v_promotion is not null then
    update public.promotions set used_count=used_count+1,updated_at=now()
      where id=v_promotion and (usage_limit is null or used_count<usage_limit);
    if not found then raise exception 'PROMOTION_LIMIT_REACHED'; end if;
  end if;
  v_id:=gen_random_uuid();
  v_code:='ORD-'||to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY')||'-'
    ||upper(substr(replace(v_id::text,'-',''),1,12));
  insert into public.orders(id,order_code,customer_id,created_by,sales_channel,
    fulfillment_type,client_request_id,request_payload,promotion_id,promotion_usage_claimed,
    ship_recipient,ship_phone,ship_address,ship_ward,ship_district,ship_city,
    requested_at,notes,subtotal,discount_amount,points_used,points_discount_amount,
    shipping_fee,total_amount,order_status,payment_status,completed_at)
    values(v_id,v_code,v_customer,v_actor,p_channel,v_fulfillment,v_request_id,p_request,
      v_promotion,v_promotion is not null,v_recipient,v_phone,
      nullif(p_request->>'ship_address',''),p_request->>'ship_ward',
      p_request->>'ship_district',p_request->>'ship_city',v_requested,p_request->>'notes',
      (v_quote->>'subtotal')::bigint,(v_quote->>'discount_amount')::bigint,
      v_points,(v_quote->>'points_discount_amount')::bigint,
      (v_quote->>'shipping_fee')::bigint,(v_quote->>'total_amount')::bigint,
      case when p_channel='offline' then 'completed' else 'pending' end,
      case when p_channel='offline' then 'paid'
           when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      case when p_channel='offline' then now() else null end);
  for v_line in select value from jsonb_array_elements(v_quote->'items') loop
    v_line_no:=v_line_no+1;
    v_product:=(v_line->>'product_id')::uuid;
    v_variant:=(v_line->>'variant_id')::uuid;
    v_qty:=(v_line->>'quantity')::integer;
    if (v_line->'customization_data')='null'::jsonb then
      if v_variant is null then
        update public.products set stock_quantity=stock_quantity-v_qty,updated_at=now()
          where id=v_product and stock_quantity>=v_qty;
      else
        update public.product_variants set stock_quantity=stock_quantity-v_qty,updated_at=now()
          where id=v_variant and product_id=v_product and stock_quantity>=v_qty;
      end if;
      if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
    end if;
    insert into public.order_items(order_id,line_no,product_id,variant_id,
      product_name_snapshot,variant_name_snapshot,unit_price,quantity,subtotal,customization_data)
      values(v_id,v_line_no,v_product,v_variant,v_line->>'product_name_snapshot',
        v_line->>'variant_name_snapshot',(v_line->>'unit_price')::bigint,
        v_qty,(v_line->>'subtotal')::bigint,
        nullif(v_line->'customization_data','null'::jsonb));
  end loop;
  if v_customer is not null then perform private.loyalty_redeem(v_customer,v_id,v_points); end if;
  insert into public.payments(order_id,kind,payment_method,status,
    amount,product_amount,shipping_amount,request_id,confirmed_by,paid_at)
    values(v_id,'charge',v_method,
      case when p_channel='offline' then 'paid'
           when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      (v_quote->>'total_amount')::bigint,
      (v_quote->>'total_amount')::bigint-(v_quote->>'shipping_fee')::bigint,
      (v_quote->>'shipping_fee')::bigint,v_request_id,
      case when p_channel='offline' then v_actor else null end,
      case when p_channel='offline' then now() else null end);
  insert into public.order_status_history(order_id,to_status,changed_by,actor_type,event_key,note)
    values(v_id,case when p_channel='offline' then 'completed' else 'pending' end,
      v_actor,case when p_channel='offline' then
        (select role from public.profiles where id=v_actor) else 'customer' end,
      'created','Đơn được tạo');
  if p_channel='offline' then
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
      values(v_actor,(select role from public.profiles where id=v_actor),
        'pos_sale','order',v_id,v_request_id,
        jsonb_build_object('payment_method','cash_demo','total_amount',v_quote->>'total_amount'));
  end if;
  perform private.refresh_for_order(v_id);
  return jsonb_build_object('order_id',v_id,'order_code',v_code,
    'total_amount',(v_quote->>'total_amount')::bigint,'replayed',false);
end $$;

create function private.transition_order_core(p_order uuid,p_next text,p_handover boolean,p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_expected text;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_role:=(select role from public.profiles where id=v_actor);
  v_expected:=case v_order.order_status
    when 'pending' then 'confirmed' when 'confirmed' then 'preparing'
    when 'preparing' then case when v_order.fulfillment_type='delivery' then 'shipping'
      when v_order.fulfillment_type='pickup' then 'completed' else null end
    when 'shipping' then 'completed' else null end;
  if v_order.sales_channel<>'online' or p_next is distinct from v_expected then
    raise exception 'INVALID_STATUS_TRANSITION'; end if;
  if p_next='completed' and p_handover is not true then raise exception 'HANDOVER_REQUIRED'; end if;
  update public.orders set order_status=p_next,
    confirmed_at=case when p_next='confirmed' then now() else confirmed_at end,
    completed_at=case when p_next='completed' then now() else completed_at end
    where id=p_order;
  insert into public.order_status_history
    (order_id,from_status,to_status,changed_by,actor_type,note,event_key)
    values(p_order,v_order.order_status,p_next,v_actor,v_role,p_note,'transition:'||p_next);
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,v_role,'order_status','order',p_order,
    jsonb_build_object('status',v_order.order_status),jsonb_build_object('status',p_next));
  if p_next='completed' then perform private.loyalty_earn(p_order); end if;
  perform private.refresh_for_order(p_order);
  return jsonb_build_object('order_id',p_order,'order_status',p_next);
end $$;

create function private.cancel_order_core(p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_line record;
begin
  v_actor:=private.require_actor(array['customer','staff','admin']);
  v_role:=(select role from public.profiles where id=v_actor);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['customer','staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_role='customer' and (v_order.customer_id<>v_actor or v_order.sales_channel<>'online')
    then raise exception 'ORDER_NOT_OWNED' using errcode='42501'; end if;
  if v_order.order_status='cancelled' then
    return jsonb_build_object('order_id',p_order,'order_status','cancelled','replayed',true);
  end if;
  if v_order.order_status='completed' or
    (v_role='customer' and v_order.order_status not in ('pending','confirmed')) then
    raise exception 'CANCELLATION_NOT_ALLOWED'; end if;
  if v_order.order_status in ('preparing','shipping') and nullif(btrim(p_reason),'') is null
    then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  update public.orders set order_status='cancelled',cancelled_at=now(),
    cancellation_reason=p_reason,stock_released=true,points_restored=true,
    promotion_usage_claimed=false where id=p_order;
  if not v_order.stock_released then
    for v_line in select product_id,variant_id,sum(quantity)::integer qty
      from public.order_items where order_id=p_order and customization_data is null
      group by product_id,variant_id loop
      if v_line.variant_id is null then
        update public.products set stock_quantity=stock_quantity+v_line.qty,updated_at=now()
          where id=v_line.product_id;
      else
        update public.product_variants set stock_quantity=stock_quantity+v_line.qty,updated_at=now()
          where id=v_line.variant_id;
      end if;
    end loop;
  end if;
  if v_order.promotion_usage_claimed and v_order.promotion_id is not null then
    update public.promotions set used_count=used_count-1,updated_at=now()
      where id=v_order.promotion_id and used_count>0;
    if not found then raise exception 'PROMOTION_USAGE_INCONSISTENT'; end if;
  end if;
  if v_order.customer_id is not null and not v_order.points_restored then
    perform private.loyalty_restore(v_order.customer_id,p_order);
  end if;
  insert into public.order_status_history
    (order_id,from_status,to_status,changed_by,actor_type,note,event_key)
    values(p_order,v_order.order_status,'cancelled',v_actor,v_role,p_reason,'cancel');
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,v_role,'order_cancel','order',p_order,
    jsonb_build_object('status',v_order.order_status),
    jsonb_build_object('status','cancelled','reason',p_reason));
  perform private.refresh_for_order(p_order);
  return jsonb_build_object('order_id',p_order,'order_status','cancelled','replayed',false);
end $$;

create function private.confirm_payment_core(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_charge public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  v_role:=(select role from public.profiles where id=v_actor);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.order_status='cancelled' then raise exception 'CANCELLED_PAYMENT_FORBIDDEN'; end if;
  select * into v_charge from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_charge.status not in ('unpaid','pending') then
    raise exception 'PAYMENT_ALREADY_HANDLED'; end if;
  update public.payments set status='paid',paid_at=now(),confirmed_by=v_actor
    where id=v_charge.id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,v_role,'demo_payment_confirmed','payment',v_charge.id,
    jsonb_build_object('status',v_charge.status),jsonb_build_object('status','paid'));
  if v_order.order_status='completed' then perform private.loyalty_earn(p_order); end if;
  perform private.refresh_for_order(p_order);
  return jsonb_build_object('order_id',p_order,'payment_status','paid');
end $$;

create function private.refund_payment_core(p_order uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;
  v_charge public.payments%rowtype;v_refund uuid;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  v_role:=(select role from public.profiles where id=v_actor);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.order_status not in ('completed','cancelled') then
    raise exception 'REFUND_STATUS_NOT_ALLOWED'; end if;
  select * into v_charge from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_charge.status<>'paid' then raise exception 'NO_PAID_CHARGE'; end if;
  if exists(select 1 from public.payments where order_id=p_order and kind='refund'
      and status='refunded') then raise exception 'ALREADY_REFUNDED'; end if;
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  insert into public.payments(order_id,kind,parent_payment_id,payment_method,status,
    amount,product_amount,shipping_amount,request_id,confirmed_by,refunded_at)
    values(p_order,'refund',v_charge.id,v_charge.payment_method,'refunded',
      v_charge.amount,v_charge.product_amount,v_charge.shipping_amount,
      p_request_id,v_actor,now()) returning id into v_refund;
  if v_order.order_status='completed' then perform private.loyalty_clawback(p_order); end if;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    request_id,new_value) values(v_actor,v_role,'demo_refund','payment',v_refund,p_request_id,
    jsonb_build_object('product_amount',v_charge.product_amount,
      'shipping_amount',v_charge.shipping_amount,'original_charge',v_charge.id));
  perform private.refresh_for_order(p_order);
  return jsonb_build_object('order_id',p_order,'refund_id',v_refund,
    'payment_status','refunded','amount',v_charge.amount);
end $$;

-- Exposed wrappers are invoker functions. Private definer functions check Auth/role again.
create function public.quote_order(p_request jsonb) returns jsonb language sql
security invoker set search_path = '' as $$
  select private.quote_core(p_request->'items',p_request->>'fulfillment_type',
    (p_request->>'requested_at')::timestamptz,(p_request->>'delivery_lat')::numeric,
    (p_request->>'delivery_lng')::numeric,coalesce((p_request->>'points_used')::integer,0),
    case when private.active_role()='customer' then auth.uid() else null end)
$$;
create function public.create_online_order(p_request jsonb) returns jsonb language sql
security invoker set search_path = '' as $$
  select private.place_order('online',p_request)
$$;
create function public.record_pos_sale(p_request jsonb) returns jsonb language sql
security invoker set search_path = '' as $$
  select private.place_order('offline',p_request)
$$;
create function public.transition_order(p_order uuid,p_next text,p_handover boolean default false,p_note text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.transition_order_core(p_order,p_next,p_handover,p_note)
$$;
create function public.cancel_order(p_order uuid,p_reason text default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.cancel_order_core(p_order,p_reason)
$$;
create function public.confirm_demo_payment(p_order uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.confirm_payment_core(p_order)
$$;
create function public.refund_demo_payment(p_order uuid,p_request_id text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.refund_payment_core(p_order,p_request_id)
$$;

revoke all on all functions in schema public from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_role() to anon,authenticated;
grant execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid) to anon,authenticated;
grant execute on function private.place_order(text,jsonb) to authenticated;
grant execute on function private.transition_order_core(uuid,text,boolean,text) to authenticated;
grant execute on function private.cancel_order_core(uuid,text) to authenticated;
grant execute on function private.confirm_payment_core(uuid) to authenticated;
grant execute on function private.refund_payment_core(uuid,text) to authenticated;
grant execute on function public.quote_order(jsonb) to anon,authenticated;
grant execute on function public.create_online_order(jsonb) to authenticated;
grant execute on function public.record_pos_sale(jsonb) to authenticated;
grant execute on function public.transition_order(uuid,text,boolean,text) to authenticated;
grant execute on function public.cancel_order(uuid,text) to authenticated;
grant execute on function public.confirm_demo_payment(uuid) to authenticated;
grant execute on function public.refund_demo_payment(uuid,text) to authenticated;
