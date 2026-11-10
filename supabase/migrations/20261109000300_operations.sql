create or replace function private.place_order(p_channel text,p_request jsonb) returns jsonb
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
    null,null,v_points,v_customer,p_request);
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
      'pending',
      case when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      null);
  if v_fulfillment='delivery' then
    update private.delivery_proofs set used_order_id=v_id
      where id=(p_request->>'delivery_proof_id')::uuid and used_order_id is null
        and expires_at>now();
    if not found then raise exception 'DELIVERY_PROOF_USED_OR_EXPIRED'; end if;
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
      values(v_actor,'customer','delivery_proof_consumed','order',v_id,v_request_id,
        jsonb_build_object('proof_id',p_request->>'delivery_proof_id'));
  end if;
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
      case when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      (v_quote->>'total_amount')::bigint,
      (v_quote->>'total_amount')::bigint-(v_quote->>'shipping_fee')::bigint,
      (v_quote->>'shipping_fee')::bigint,v_request_id,
      null,null);
  insert into public.order_status_history(order_id,to_status,changed_by,actor_type,event_key,note)
    values(v_id,'pending',
      v_actor,case when p_channel='offline' then
        (select role from public.profiles where id=v_actor) else 'customer' end,
      'created','Đơn được tạo');
  if p_channel='offline' then
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
      values(v_actor,(select role from public.profiles where id=v_actor),
        'pos_order_created','order',v_id,v_request_id,
        jsonb_build_object('payment_method','cash_demo','total_amount',v_quote->>'total_amount'));
  end if;
  perform private.refresh_for_order(v_id);
  return jsonb_build_object('order_id',v_id,'order_code',v_code,
    'total_amount',(v_quote->>'total_amount')::bigint,'replayed',false);
end $$;

alter table public.orders add column delivery_failed_at timestamptz;
alter table public.orders add column delivery_failure_reason text;
alter table public.payments add column refund_requested_by uuid references public.profiles(id) on delete restrict;
alter table public.payments add column refund_approved_by uuid references public.profiles(id) on delete restrict;
alter table public.payments add column refund_approved_at timestamptz;
alter table public.payments add column refund_reason text;
alter table public.store_settings add column nominatim_last_request_at timestamptz;

create function private.reserve_nominatim_request_core() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_last timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  select nominatim_last_request_at into v_last from public.store_settings where store_key='main' for update;
  if not found then raise exception 'STORE_NOT_CONFIGURED'; end if;
  if v_last is not null and v_last>now()-interval '1100 milliseconds' then
    raise exception 'GEOCODER_RATE_LIMIT'; end if;
  update public.store_settings set nominatim_last_request_at=now() where store_key='main';
  return jsonb_build_object('reserved',true);
end $$;

create function public.reserve_nominatim_request() returns jsonb
language sql security invoker set search_path = '' as $$
  select private.reserve_nominatim_request_core()
$$;

create function private.confirm_payment_with_receipt(p_order uuid,p_money_received boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_method text;v_result jsonb;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  if p_money_received is not true then raise exception 'MONEY_RECEIPT_REQUIRED'; end if;
  select payment_method into v_method from public.payments where order_id=p_order and kind='charge';
  if v_method not in ('cod','bank_transfer_demo') then raise exception 'DEMO_PAYMENT_METHOD_NOT_ALLOWED'; end if;
  v_result:=private.confirm_payment_core(p_order);
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,(select role from public.profiles where id=v_actor),
      'demo_money_receipt_attested','order',p_order,jsonb_build_object('method',v_method));
  return v_result;
end $$;

create function public.confirm_demo_payment(p_order uuid,p_money_received boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.confirm_payment_with_receipt(p_order,p_money_received)
$$;

create function private.complete_pos_sale_core(p_order uuid,p_cash_collected boolean,p_handover boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_charge public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  if p_cash_collected is not true or p_handover is not true then raise exception 'POS_CASH_AND_HANDOVER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_charge from public.payments where order_id=p_order and kind='charge' for update;
  if v_order.sales_channel='offline' and v_order.fulfillment_type='counter'
    and v_order.order_status='completed' and v_order.payment_status='paid'
    and v_charge.payment_method='cash_demo'
    and v_charge.status='paid' and exists(select 1 from public.order_status_history
      where order_id=p_order and event_key='pos_completed') then
    return jsonb_build_object('order_id',p_order,'order_status','completed','payment_status','paid','replayed',true);
  end if;
  if v_order.sales_channel<>'offline' or v_order.fulfillment_type<>'counter' or v_order.order_status<>'pending' then
    raise exception 'POS_COMPLETION_NOT_ALLOWED'; end if;
  if v_charge.id is null or v_charge.payment_method<>'cash_demo' or v_charge.status<>'unpaid' then
    raise exception 'POS_PAYMENT_NOT_READY'; end if;
  v_role:=(select role from public.profiles where id=v_actor);
  update public.payments set status='paid',paid_at=now(),confirmed_by=v_actor where id=v_charge.id;
  update public.orders set order_status='completed',completed_at=now() where id=p_order;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,actor_type,event_key,note)
    values(p_order,'pending','completed',v_actor,v_role,'pos_completed','Đã thu tiền mặt demo và giao bánh');
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,old_value,new_value)
    values(v_actor,v_role,'pos_cash_handover','order',p_order,
      jsonb_build_object('status','pending','payment','unpaid'),
      jsonb_build_object('status','completed','payment','paid','method','cash_demo'));
  perform private.loyalty_earn(p_order);
  perform private.refresh_for_order(p_order);
  return jsonb_build_object('order_id',p_order,'order_status','completed','payment_status','paid','replayed',false);
end $$;

create function public.complete_pos_sale(p_order uuid,p_cash_collected boolean,p_handover boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.complete_pos_sale_core(p_order,p_cash_collected,p_handover)
$$;

create function private.record_delivery_failure_core(p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'DELIVERY_FAILURE_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.sales_channel<>'online' or v_order.fulfillment_type<>'delivery' or v_order.order_status<>'shipping' then
    raise exception 'DELIVERY_FAILURE_NOT_ALLOWED'; end if;
  v_role:=(select role from public.profiles where id=v_actor);
  update public.orders set delivery_failed_at=now(),delivery_failure_reason=btrim(p_reason) where id=p_order;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,actor_type,event_key,note)
    values(p_order,'shipping','shipping',v_actor,v_role,'delivery_failed:'||gen_random_uuid()::text,btrim(p_reason));
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,v_role,'delivery_failed','order',p_order,jsonb_build_object('reason',btrim(p_reason)));
  return jsonb_build_object('order_id',p_order,'order_status','shipping','delivery_failed',true);
end $$;

create function public.record_delivery_failure(p_order uuid,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.record_delivery_failure_core(p_order,p_reason)
$$;

create function private.request_demo_refund_core(p_order uuid,p_request_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_order public.orders%rowtype;v_charge public.payments%rowtype;v_refund public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['staff']);
  if nullif(btrim(p_request_id),'') is null or length(p_request_id)>200 or length(btrim(coalesce(p_reason,'')))<5 then
    raise exception 'REFUND_REQUEST_DETAILS_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff']);
  select * into v_order from public.orders where id=p_order for update;
  if not found or v_order.order_status not in ('completed','cancelled') then raise exception 'REFUND_STATUS_NOT_ALLOWED'; end if;
  select * into v_charge from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_charge.status<>'paid' or v_charge.payment_method not in ('cod','bank_transfer_demo','cash_demo') then
    raise exception 'DEMO_PAID_CHARGE_REQUIRED'; end if;
  select * into v_refund from public.payments where order_id=p_order and kind='refund' for update;
  if found then
    if v_refund.request_id=p_request_id and v_refund.refund_requested_by=v_actor and v_refund.refund_reason=btrim(p_reason) then
      return jsonb_build_object('refund_id',v_refund.id,'status',v_refund.status,'replayed',true); end if;
    raise exception 'REFUND_ALREADY_REQUESTED';
  end if;
  insert into public.payments(order_id,kind,parent_payment_id,payment_method,status,amount,
    product_amount,shipping_amount,request_id,refund_requested_by,refund_reason)
    values(p_order,'refund',v_charge.id,v_charge.payment_method,'pending',v_charge.amount,
      v_charge.product_amount,v_charge.shipping_amount,p_request_id,v_actor,btrim(p_reason)) returning * into v_refund;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
    values(v_actor,'staff','demo_refund_requested','payment',v_refund.id,p_request_id,
      jsonb_build_object('order_id',p_order,'reason',btrim(p_reason)));
  return jsonb_build_object('refund_id',v_refund.id,'status','pending','replayed',false);
end $$;

create function public.request_demo_refund(p_order uuid,p_request_id text,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.request_demo_refund_core(p_order,p_request_id,p_reason)
$$;

create function private.approve_demo_refund_core(p_refund uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_refund public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  select * into v_refund from public.payments where id=p_refund and kind='refund' for update;
  if not found or v_refund.status<>'pending' or v_refund.refund_requested_by is null
    or v_refund.payment_method not in ('cod','bank_transfer_demo','cash_demo') then
    raise exception 'REFUND_NOT_PENDING'; end if;
  if v_refund.refund_approved_at is not null then
    return jsonb_build_object('refund_id',p_refund,'approved',true,'replayed',true); end if;
  update public.payments set refund_approved_by=v_actor,refund_approved_at=now() where id=p_refund;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,'admin','demo_refund_approved','payment',p_refund,
      jsonb_build_object('order_id',v_refund.order_id));
  return jsonb_build_object('refund_id',p_refund,'approved',true,'replayed',false);
end $$;

create function public.approve_demo_refund(p_refund uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.approve_demo_refund_core(p_refund)
$$;

create function private.execute_demo_refund_core(p_refund uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_refund public.payments%rowtype;v_order public.orders%rowtype;v_charge public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['staff']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff']);
  select * into v_refund from public.payments where id=p_refund and kind='refund' for update;
  if found and v_refund.status='refunded' and v_refund.refund_approved_at is not null
    and v_refund.refund_requested_by is not null then
    return jsonb_build_object('refund_id',p_refund,'payment_status','refunded','amount',v_refund.amount,'replayed',true);
  end if;
  if not found or v_refund.status<>'pending' or v_refund.refund_requested_by is null
    or v_refund.payment_method not in ('cod','bank_transfer_demo','cash_demo')
    or v_refund.refund_approved_at is null then
    raise exception 'REFUND_NOT_APPROVED_OR_ALREADY_EXECUTED'; end if;
  select * into v_order from public.orders where id=v_refund.order_id for update;
  select * into v_charge from public.payments where id=v_refund.parent_payment_id for update;
  if v_order.order_status not in ('completed','cancelled') or v_charge.status<>'paid' then
    raise exception 'REFUND_STATE_CHANGED'; end if;
  update public.payments set status='refunded',confirmed_by=v_actor,refunded_at=now() where id=p_refund;
  if v_order.order_status='completed' then perform private.loyalty_clawback(v_order.id); end if;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
    values(v_actor,'staff','demo_refund_executed','payment',p_refund,v_refund.request_id,
      jsonb_build_object('product_amount',v_refund.product_amount,'shipping_amount',v_refund.shipping_amount));
  perform private.refresh_for_order(v_order.id);
  return jsonb_build_object('refund_id',p_refund,'payment_status','refunded','amount',v_refund.amount,'replayed',false);
end $$;

create function public.execute_demo_refund(p_refund uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.execute_demo_refund_core(p_refund)
$$;

revoke all on function public.confirm_demo_payment(uuid) from public,anon,authenticated;
revoke all on function private.confirm_payment_core(uuid) from public,anon,authenticated;
revoke all on function public.refund_demo_payment(uuid,text) from public,anon,authenticated;
revoke all on function private.refund_payment_core(uuid,text) from public,anon,authenticated;
revoke all on function private.confirm_payment_with_receipt(uuid,boolean) from public,anon,authenticated;
revoke all on function private.complete_pos_sale_core(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function private.record_delivery_failure_core(uuid,text) from public,anon,authenticated;
revoke all on function private.request_demo_refund_core(uuid,text,text) from public,anon,authenticated;
revoke all on function private.approve_demo_refund_core(uuid) from public,anon,authenticated;
revoke all on function private.execute_demo_refund_core(uuid) from public,anon,authenticated;
revoke all on function private.reserve_nominatim_request_core() from public,anon,authenticated;
grant execute on function private.confirm_payment_with_receipt(uuid,boolean) to authenticated;
grant execute on function private.complete_pos_sale_core(uuid,boolean,boolean) to authenticated;
grant execute on function private.record_delivery_failure_core(uuid,text) to authenticated;
grant execute on function private.request_demo_refund_core(uuid,text,text) to authenticated;
grant execute on function private.approve_demo_refund_core(uuid) to authenticated;
grant execute on function private.execute_demo_refund_core(uuid) to authenticated;
grant execute on function private.reserve_nominatim_request_core() to service_role;
revoke all on function public.confirm_demo_payment(uuid,boolean) from public,anon,authenticated;
revoke all on function public.complete_pos_sale(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.record_delivery_failure(uuid,text) from public,anon,authenticated;
revoke all on function public.request_demo_refund(uuid,text,text) from public,anon,authenticated;
revoke all on function public.approve_demo_refund(uuid) from public,anon,authenticated;
revoke all on function public.execute_demo_refund(uuid) from public,anon,authenticated;
revoke all on function public.reserve_nominatim_request() from public,anon,authenticated;
grant execute on function public.confirm_demo_payment(uuid,boolean) to authenticated;
grant execute on function public.complete_pos_sale(uuid,boolean,boolean) to authenticated;
grant execute on function public.record_delivery_failure(uuid,text) to authenticated;
grant execute on function public.request_demo_refund(uuid,text,text) to authenticated;
grant execute on function public.approve_demo_refund(uuid) to authenticated;
grant execute on function public.execute_demo_refund(uuid) to authenticated;
grant execute on function public.reserve_nominatim_request() to service_role;
