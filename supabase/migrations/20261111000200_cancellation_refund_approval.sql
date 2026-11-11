alter table public.orders
  add column cancel_request_id uuid,
  add column cancel_request_status text check (cancel_request_status in ('pending','approved','rejected')),
  add column cancel_request_reason text,
  add column cancel_requested_at timestamptz,
  add column cancel_resolved_by uuid references public.profiles(id) on delete restrict,
  add column cancel_resolved_at timestamptz,
  add column cancel_resolution_note text,
  add column cancel_restock_eligible boolean not null default false,
  add constraint orders_cancel_request_consistency check (
    (cancel_request_status is null and cancel_request_id is null and cancel_request_reason is null and cancel_requested_at is null and cancel_resolved_by is null and cancel_resolved_at is null and cancel_resolution_note is null and cancel_restock_eligible=false)
    or (cancel_request_status='pending' and cancel_request_id is not null and cancel_request_reason is not null and cancel_requested_at is not null and cancel_resolved_by is null and cancel_resolved_at is null and cancel_resolution_note is null and cancel_restock_eligible=false)
    or (cancel_request_status in ('approved','rejected') and cancel_request_id is not null and cancel_request_reason is not null and cancel_requested_at is not null and cancel_resolved_by is not null and cancel_resolved_at is not null and cancel_resolution_note is not null)
  );
create unique index orders_cancel_request_id_unique on public.orders(cancel_request_id) where cancel_request_id is not null;

create function private.submit_order_cancel_request_core(p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_customer uuid;v_order public.orders%rowtype;v_request_id uuid;
begin
  v_customer:=private.require_actor(array['customer']);
  if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_order from public.orders where id=p_order for update;
  if not found or v_order.customer_id is distinct from v_customer or v_order.sales_channel<>'online'
    then raise exception 'ORDER_NOT_OWNED' using errcode='42501'; end if;
  if v_order.order_status not in ('preparing','shipping') then raise exception 'CANCEL_REQUEST_STATE_INVALID'; end if;
  if v_order.cancel_request_status='pending' then
    return jsonb_build_object('request_id',v_order.cancel_request_id,'status','pending','replayed',true);
  end if;
  v_request_id:=gen_random_uuid();
  update public.orders set cancel_request_id=v_request_id,cancel_request_status='pending',
    cancel_request_reason=btrim(p_reason),cancel_requested_at=now(),cancel_resolved_by=null,
    cancel_resolved_at=null,cancel_resolution_note=null,cancel_restock_eligible=false where id=p_order;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,actor_type,event_key,note)
    values(p_order,v_order.order_status,v_order.order_status,v_customer,'customer','cancel_request:'||v_request_id,btrim(p_reason));
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_customer,'customer','cancel_request_submitted','order',p_order,
      jsonb_build_object('request_id',v_request_id,'reason',btrim(p_reason)));
  return jsonb_build_object('request_id',v_request_id,'status','pending','replayed',false);
end $$;
create function public.submit_order_cancel_request(p_order uuid,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.submit_order_cancel_request_core(p_order,p_reason)
$$;

create or replace function private.transition_order_core(p_order uuid,p_next text,p_handover boolean,p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_expected text;
begin
  v_actor:=private.require_actor(array['staff','admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['staff','admin']);
  select * into v_order from public.orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.cancel_request_status='pending' then raise exception 'ORDER_CANCELLATION_PENDING'; end if;
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

create or replace function private.cancel_order_core(p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_role text;v_order public.orders%rowtype;v_line record;v_restore_stock boolean;
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
  if v_order.order_status in ('preparing','shipping') and v_order.cancel_request_status is distinct from 'approved' then raise exception 'CANCELLATION_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if v_order.order_status in ('preparing','shipping') and nullif(btrim(p_reason),'') is null
    then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  v_restore_stock:=not v_order.stock_released and (v_order.order_status in ('pending','confirmed') or (v_order.cancel_request_status='approved' and v_order.cancel_restock_eligible));
  update public.orders set order_status='cancelled',cancelled_at=now(),
    cancellation_reason=p_reason,stock_released=(v_order.stock_released or v_restore_stock),points_restored=true,
    promotion_usage_claimed=false where id=p_order;
  if v_restore_stock then
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

create function private.resolve_order_cancel_request_core(p_request uuid,p_approve boolean,p_note text,p_restock_eligible boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_order public.orders%rowtype;v_result jsonb;
begin
  v_actor:=private.require_actor(array['staff']);
  if p_approve is null or length(btrim(coalesce(p_note,'')))<5 then raise exception 'CANCEL_DECISION_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_order from public.orders where cancel_request_id=p_request for update;
  if not found or v_order.cancel_request_status<>'pending' then raise exception 'CANCELLATION_REQUEST_NOT_PENDING'; end if;
  if v_order.order_status not in ('preparing','shipping') then raise exception 'CANCELLATION_ORDER_CHANGED'; end if;
  update public.orders set cancel_request_status=case when p_approve then 'approved' else 'rejected' end,
    cancel_resolved_by=v_actor,cancel_resolved_at=now(),cancel_resolution_note=btrim(p_note),
    cancel_restock_eligible=case when p_approve then coalesce(p_restock_eligible,false) else false end
    where id=v_order.id;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,actor_type,event_key,note)
    values(v_order.id,v_order.order_status,v_order.order_status,v_actor,'staff',
      case when p_approve then 'cancel_approved:' else 'cancel_rejected:' end||p_request,btrim(p_note));
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,'staff',case when p_approve then 'cancel_request_approved' else 'cancel_request_rejected' end,
      'order',v_order.id,jsonb_build_object('request_id',p_request,'reason',btrim(p_note),'restock_eligible',coalesce(p_restock_eligible,false)));
  if not p_approve then return jsonb_build_object('request_id',p_request,'status','rejected'); end if;
  v_result:=private.cancel_order_core(v_order.id,'Được Staff chấp thuận: '||btrim(p_note));
  return jsonb_build_object('request_id',p_request,'status','approved','order',v_result);
end $$;
create function public.resolve_order_cancel_request(p_request uuid,p_approve boolean,p_note text,p_restock_eligible boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select private.resolve_order_cancel_request_core(p_request,p_approve,p_note,p_restock_eligible)
$$;

create function private.execute_demo_refund_with_evidence_core(p_refund uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_refund public.payments%rowtype;v_order public.orders%rowtype;v_charge public.payments%rowtype;v_reference text;
begin
  v_actor:=private.require_actor(array['staff']);
  v_reference:=btrim(coalesce(p_reference,''));
  if length(v_reference) not between 6 and 160 then raise exception 'REFUND_EXECUTION_REFERENCE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_refund from public.payments where id=p_refund and kind='refund' for update;
  if found and v_refund.status='refunded' then
    if v_refund.transaction_code=v_reference then
      return jsonb_build_object('refund_id',p_refund,'payment_status','refunded','replayed',true);
    end if;
    raise exception 'REFUND_ALREADY_EXECUTED';
  end if;
  if not found or v_refund.status<>'pending' or v_refund.refund_approved_at is null or v_refund.refund_requested_by is null
    or v_refund.payment_method not in ('cod','bank_transfer_demo','cash_demo') then
    raise exception 'REFUND_NOT_APPROVED_OR_UNSUPPORTED_METHOD'; end if;
  select * into v_order from public.orders where id=v_refund.order_id for update;
  select * into v_charge from public.payments where id=v_refund.parent_payment_id for update;
  if v_order.order_status not in ('completed','cancelled') or v_charge.status<>'paid' then raise exception 'REFUND_STATE_CHANGED'; end if;
  update public.payments set status='refunded',confirmed_by=v_actor,refunded_at=now(),transaction_code=v_reference where id=p_refund;
  if v_order.order_status='completed' then perform private.loyalty_clawback(v_order.id); end if;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
    values(v_actor,'staff','demo_refund_executed_with_reference','payment',p_refund,v_refund.request_id,
      jsonb_build_object('product_amount',v_refund.product_amount,'shipping_amount',v_refund.shipping_amount,'reference',v_reference));
  perform private.refresh_for_order(v_order.id);
  return jsonb_build_object('refund_id',p_refund,'payment_status','refunded','amount',v_refund.amount,'replayed',false);
end $$;
create function public.execute_demo_refund(p_refund uuid,p_reference text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.execute_demo_refund_with_evidence_core(p_refund,p_reference)
$$;
revoke all on function public.execute_demo_refund(uuid) from public,anon,authenticated;
revoke all on function private.execute_demo_refund_core(uuid) from public,anon,authenticated;
revoke all on function private.submit_order_cancel_request_core(uuid,text) from public,anon,authenticated;
revoke all on function private.resolve_order_cancel_request_core(uuid,boolean,text,boolean) from public,anon,authenticated;
revoke all on function private.execute_demo_refund_with_evidence_core(uuid,text) from public,anon,authenticated;
revoke all on function public.submit_order_cancel_request(uuid,text) from public,anon,authenticated;
revoke all on function public.resolve_order_cancel_request(uuid,boolean,text,boolean) from public,anon,authenticated;
revoke all on function public.execute_demo_refund(uuid,text) from public,anon,authenticated;
grant execute on function private.submit_order_cancel_request_core(uuid,text) to authenticated;
grant execute on function private.resolve_order_cancel_request_core(uuid,boolean,text,boolean) to authenticated;
grant execute on function private.execute_demo_refund_with_evidence_core(uuid,text) to authenticated;
grant execute on function public.submit_order_cancel_request(uuid,text) to authenticated;
grant execute on function public.resolve_order_cancel_request(uuid,boolean,text,boolean) to authenticated;
grant execute on function public.execute_demo_refund(uuid,text) to authenticated;
