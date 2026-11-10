alter table public.payments drop constraint payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('cod','bank_transfer_demo','cash_demo','vnpay'));
alter table public.payments add column gateway_txn_ref text,
  add column gateway_create_date text,
  add column gateway_expires_at timestamptz,
  add column gateway_transaction_no text,
  add column gateway_event_hash text,
  add column gateway_result text,
  add column gateway_verified_at timestamptz;
alter table public.payments add constraint payments_gateway_result_check
  check (gateway_result is null or gateway_result in
    ('awaiting','paid','failed','reconciliation_required','refund_requested','refund_pending','refunded','refund_failed'));
create unique index payments_gateway_txn_ref_unique on public.payments(gateway_txn_ref)
  where gateway_txn_ref is not null and kind='charge';
create unique index payments_gateway_transaction_no_unique on public.payments(gateway_transaction_no)
  where gateway_transaction_no is not null and kind='charge';
create unique index payments_vnpay_one_refund on public.payments(parent_payment_id)
  where kind='refund' and payment_method='vnpay' and status in ('pending','refunded');

create function private.vnpay_begin_core(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_order public.orders%rowtype;v_payment public.payments%rowtype;
  v_created text;v_expires timestamptz;
begin
  v_actor:=private.require_actor(array['customer']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_order from public.orders where id=p_order for update;
  if not found or v_order.customer_id<>v_actor or v_order.sales_channel<>'online'
    then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.order_status='cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  select * into v_payment from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_payment.payment_method<>'vnpay' then raise exception 'VNPAY_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status<>'pending' or v_payment.gateway_result in
    ('reconciliation_required','failed','paid') then raise exception 'PAYMENT_SESSION_NOT_AVAILABLE'; end if;
  if v_payment.gateway_txn_ref is null then
    v_created:=to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS');
    v_expires:=now()+interval '15 minutes';
    update public.payments set gateway_txn_ref=upper(replace(id::text,'-','')),
      gateway_create_date=v_created,gateway_expires_at=v_expires,gateway_result='awaiting'
      where id=v_payment.id returning * into v_payment;
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
      values(v_actor,'customer','vnpay_session','payment',v_payment.id,
        jsonb_build_object('txn_ref',v_payment.gateway_txn_ref));
  end if;
  if v_payment.gateway_expires_at<=now() then raise exception 'PAYMENT_SESSION_EXPIRED_RECONCILE'; end if;
  return jsonb_build_object('order_id',p_order,'payment_id',v_payment.id,
    'txn_ref',v_payment.gateway_txn_ref,'amount',v_payment.amount,
    'create_date',v_payment.gateway_create_date,
    'expire_date',to_char(v_payment.gateway_expires_at at time zone 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS'));
end $$;

create function public.vnpay_begin_payment(p_order uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.vnpay_begin_core(p_order)
$$;

create function private.vnpay_apply_core(p_txn_ref text,p_amount bigint,p_external text,
  p_response_code text,p_transaction_status text,p_event_hash text,p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments%rowtype;v_order public.orders%rowtype;
  v_success boolean;v_failure boolean;v_result text;
begin
  if p_source not in ('ipn','querydr') or p_event_hash !~ '^[0-9a-f]{64}$'
    then raise exception 'INVALID_GATEWAY_EVENT'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_payment from public.payments where gateway_txn_ref=p_txn_ref and kind='charge' for update;
  if not found then return jsonb_build_object('RspCode','01','Message','Order not found'); end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;
  if p_amount<>v_payment.amount or p_amount<0 then
    return jsonb_build_object('RspCode','04','Message','Invalid amount'); end if;
  if v_payment.gateway_event_hash=p_event_hash then
    return jsonb_build_object('RspCode','02','Message','Order already confirmed'); end if;
  v_success:=p_response_code='00' and p_transaction_status='00';
  v_failure:=p_transaction_status in ('02','07','09') or p_response_code not in ('00');
  if v_payment.gateway_result in ('paid','failed','reconciliation_required')
    or v_payment.status in ('paid','failed') then
    if v_payment.gateway_result='paid' and v_success and
      v_payment.gateway_transaction_no=p_external then
      return jsonb_build_object('RspCode','02','Message','Order already confirmed'); end if;
    update public.payments set gateway_result='reconciliation_required',
      gateway_event_hash=p_event_hash,gateway_verified_at=now() where id=v_payment.id;
    insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
      values('system','vnpay_conflict','payment',v_payment.id,
        jsonb_build_object('source',p_source,'response_code',p_response_code,
          'transaction_status',p_transaction_status));
    return jsonb_build_object('RspCode','00','Message','Reconciliation required');
  end if;
  if v_success and v_order.order_status='cancelled' then
    update public.payments set gateway_result='reconciliation_required',
      gateway_transaction_no=p_external,gateway_event_hash=p_event_hash,
      gateway_verified_at=now() where id=v_payment.id;
    insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
      values('system','vnpay_success_after_cancel','payment',v_payment.id,
        jsonb_build_object('source',p_source));
    return jsonb_build_object('RspCode','00','Message','Reconciliation required');
  end if;
  if p_transaction_status in ('04','07') or
    (p_response_code<>'00' and p_transaction_status='00') then
    update public.payments set gateway_result='reconciliation_required',
      gateway_transaction_no=nullif(p_external,''),gateway_event_hash=p_event_hash,
      gateway_verified_at=now() where id=v_payment.id;
    insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
      values('system','vnpay_uncertain_result','payment',v_payment.id,
        jsonb_build_object('source',p_source,'transaction_status',p_transaction_status));
    return jsonb_build_object('RspCode','00','Message','Reconciliation required');
  end if;
  if v_success then
    if nullif(p_external,'') is null then raise exception 'EXTERNAL_TRANSACTION_REQUIRED'; end if;
    if exists(select 1 from public.payments where gateway_transaction_no=p_external
      and id<>v_payment.id) then raise exception 'EXTERNAL_TRANSACTION_DUPLICATE'; end if;
    update public.payments set status='paid',paid_at=now(),gateway_result='paid',
      gateway_transaction_no=p_external,gateway_event_hash=p_event_hash,
      gateway_verified_at=now() where id=v_payment.id;
    if v_order.order_status='completed' then perform private.loyalty_earn(v_order.id); end if;
    v_result:='vnpay_paid';
  elsif v_failure then
    update public.payments set status='failed',gateway_result='failed',
      gateway_transaction_no=nullif(p_external,''),gateway_event_hash=p_event_hash,
      gateway_verified_at=now() where id=v_payment.id;
    v_result:='vnpay_failed';
  else
    update public.payments set gateway_event_hash=p_event_hash,gateway_verified_at=now()
      where id=v_payment.id;
    return jsonb_build_object('RspCode','00','Message','Payment pending');
  end if;
  insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
    values('system',v_result,'payment',v_payment.id,
      jsonb_build_object('source',p_source,'transaction_no',p_external));
  perform private.refresh_for_order(v_order.id);
  return jsonb_build_object('RspCode','00','Message','Confirm success');
end $$;

create function public.vnpay_apply_result(p_txn_ref text,p_amount bigint,p_external text,
  p_response_code text,p_transaction_status text,p_event_hash text,p_source text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.vnpay_apply_core(p_txn_ref,p_amount,p_external,
    p_response_code,p_transaction_status,p_event_hash,p_source)
$$;

create function private.vnpay_refund_request_core(p_order uuid,p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;
  v_charge public.payments%rowtype;v_refund public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  if p_request_id !~ '^[A-Za-z0-9]{1,32}$' then raise exception 'INVALID_REQUEST_ID'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_order from public.orders where id=p_order for update;
  if not found or v_order.order_status not in ('completed','cancelled')
    then raise exception 'REFUND_STATUS_NOT_ALLOWED'; end if;
  select * into v_charge from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_charge.payment_method<>'vnpay' or v_charge.status<>'paid'
    then raise exception 'NO_PAID_VNPAY_CHARGE'; end if;
  select * into v_refund from public.payments where order_id=p_order and kind='refund'
    and payment_method='vnpay' for update;
  if found then
    if v_refund.request_id=p_request_id then
      return jsonb_build_object('refund_id',v_refund.id,'replayed',true,'status',v_refund.status,'amount',v_refund.amount,
        'txn_ref',v_charge.gateway_txn_ref,'transaction_no',v_charge.gateway_transaction_no,
        'transaction_date',v_charge.gateway_create_date); end if;
    raise exception 'REFUND_ALREADY_REQUESTED';
  end if;
  insert into public.payments(order_id,kind,parent_payment_id,payment_method,status,
    amount,product_amount,shipping_amount,request_id,confirmed_by,gateway_result)
    values(p_order,'refund',v_charge.id,'vnpay','pending',v_charge.amount,
      v_charge.product_amount,v_charge.shipping_amount,p_request_id,v_actor,'refund_requested')
    returning * into v_refund;
  v_role:=(select role from public.profiles where id=v_actor);
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    request_id,new_value) values(v_actor,v_role,'vnpay_refund_requested','payment',
    v_refund.id,p_request_id,jsonb_build_object('amount',v_refund.amount));
  return jsonb_build_object('refund_id',v_refund.id,'replayed',false,'amount',v_refund.amount,
    'txn_ref',v_charge.gateway_txn_ref,'transaction_no',v_charge.gateway_transaction_no,
    'transaction_date',v_charge.gateway_create_date);
end $$;

create function public.vnpay_request_full_refund(p_order uuid,p_request_id text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.vnpay_refund_request_core(p_order,p_request_id)
$$;

create function private.vnpay_refund_apply_core(p_refund uuid,p_response_code text,
  p_transaction_status text,p_external text,p_event_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_refund public.payments%rowtype;v_order public.orders%rowtype;
begin
  if p_event_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_GATEWAY_EVENT'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_refund from public.payments where id=p_refund and kind='refund'
    and payment_method='vnpay' for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  select * into v_order from public.orders where id=v_refund.order_id for update;
  if v_refund.status='refunded' then return jsonb_build_object('status','refunded','replayed',true); end if;
  if v_refund.gateway_event_hash=p_event_hash then
    return jsonb_build_object('status',v_refund.status,'replayed',true); end if;
  if v_refund.status='failed' then raise exception 'REFUND_ALREADY_FAILED_RECONCILE'; end if;
  if p_response_code='00' and p_transaction_status='00' then
    if nullif(p_external,'') is null then raise exception 'EXTERNAL_REFUND_REQUIRED'; end if;
    update public.payments set status='refunded',refunded_at=now(),
      gateway_result='refunded',gateway_transaction_no=p_external,
      gateway_event_hash=p_event_hash,gateway_verified_at=now() where id=p_refund;
    if v_order.order_status='completed' then perform private.loyalty_clawback(v_order.id); end if;
    perform private.refresh_for_order(v_order.id);
    insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
      values('system','vnpay_refund_verified','payment',p_refund,
        jsonb_build_object('transaction_no',p_external));
    return jsonb_build_object('status','refunded','replayed',false);
  elsif p_response_code='94' or
    (p_response_code='00' and p_transaction_status in ('01','05','06')) then
    update public.payments set gateway_result='refund_pending',
      gateway_event_hash=p_event_hash,gateway_verified_at=now() where id=p_refund;
    return jsonb_build_object('status','pending','replayed',false);
  else
    update public.payments set status='failed',gateway_result='refund_failed',
      gateway_event_hash=p_event_hash,gateway_verified_at=now() where id=p_refund;
    insert into public.audit_log(actor_type,action,entity_type,entity_id,new_value)
      values('system','vnpay_refund_failed','payment',p_refund,
        jsonb_build_object('response_code',p_response_code));
    return jsonb_build_object('status','failed','replayed',false);
  end if;
end $$;

create function public.vnpay_apply_refund_result(p_refund uuid,p_response_code text,
  p_transaction_status text,p_external text,p_event_hash text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.vnpay_refund_apply_core(p_refund,p_response_code,
    p_transaction_status,p_external,p_event_hash)
$$;

revoke all on function private.vnpay_begin_core(uuid) from public,anon,authenticated;
revoke all on function private.vnpay_apply_core(text,bigint,text,text,text,text,text) from public,anon,authenticated;
revoke all on function private.vnpay_refund_request_core(uuid,text) from public,anon,authenticated;
revoke all on function private.vnpay_refund_apply_core(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.vnpay_begin_payment(uuid) from public,anon,authenticated;
revoke all on function public.vnpay_apply_result(text,bigint,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.vnpay_request_full_refund(uuid,text) from public,anon,authenticated;
revoke all on function public.vnpay_apply_refund_result(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function private.vnpay_begin_core(uuid) to authenticated;
grant execute on function private.vnpay_refund_request_core(uuid,text) to authenticated;
grant usage on schema private to service_role;
grant execute on function public.vnpay_begin_payment(uuid) to authenticated;
grant execute on function public.vnpay_request_full_refund(uuid,text) to authenticated;
grant execute on function private.vnpay_apply_core(text,bigint,text,text,text,text,text) to service_role;
grant execute on function private.vnpay_refund_apply_core(uuid,text,text,text,text) to service_role;
grant execute on function public.vnpay_apply_result(text,bigint,text,text,text,text,text) to service_role;
grant execute on function public.vnpay_apply_refund_result(uuid,text,text,text,text) to service_role;
