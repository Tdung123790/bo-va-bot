alter table public.payments add column gateway_query_reserved_at timestamptz;

create function private.vnpay_reserve_query_core(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_payment public.payments%rowtype;
begin
  v_actor:=private.require_actor(array['customer','staff','admin']);
  v_role:=(select role from public.profiles where id=v_actor);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['customer','staff','admin']);
  v_role:=(select role from public.profiles where id=v_actor and status='active');
  select * into v_order from public.orders where id=p_order for update;
  if not found or (v_role='customer' and (v_order.customer_id is distinct from v_actor
    or v_order.sales_channel<>'online')) then raise exception 'ORDER_NOT_FOUND' using errcode='42501'; end if;
  select * into v_payment from public.payments where order_id=p_order and kind='charge' for update;
  if not found or v_payment.payment_method<>'vnpay' or v_payment.gateway_txn_ref is null
    or v_payment.gateway_create_date is null then raise exception 'VNPAY_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status<>'pending' or v_payment.gateway_result in ('paid','failed','refunded') then
    raise exception 'VNPAY_QUERY_NOT_PENDING'; end if;
  if v_payment.gateway_query_reserved_at is not null
    and v_payment.gateway_query_reserved_at>now()-interval '5 minutes' then
    raise exception 'VNPAY_QUERY_RATE_LIMIT'; end if;
  update public.payments set gateway_query_reserved_at=now() where id=v_payment.id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,v_role,'vnpay_querydr_reserved','payment',v_payment.id,
      jsonb_build_object('order_id',p_order));
  return jsonb_build_object('reserved',true);
end $$;

create function public.vnpay_reserve_query(p_order uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.vnpay_reserve_query_core(p_order)
$$;

revoke all on function private.vnpay_reserve_query_core(uuid) from public,anon,authenticated;
revoke all on function public.vnpay_reserve_query(uuid) from public,anon,authenticated;
grant execute on function private.vnpay_reserve_query_core(uuid) to authenticated;
grant execute on function public.vnpay_reserve_query(uuid) to authenticated;
revoke all on function public.vnpay_request_full_refund(uuid,text) from public,anon,authenticated;
revoke all on function private.vnpay_refund_request_core(uuid,text) from public,anon,authenticated;
