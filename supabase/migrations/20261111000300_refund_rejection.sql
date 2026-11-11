alter table public.payments add column refund_rejected_by uuid references public.profiles(id) on delete restrict;
alter table public.payments add column refund_rejected_at timestamptz;
alter table public.payments add column refund_rejection_reason text;

create function private.reject_demo_refund_core(p_refund uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_refund public.payments%rowtype;v_reason text;
begin
  v_actor:=private.require_actor(array['admin']);
  v_reason:=btrim(coalesce(p_reason,''));
  if length(v_reason) not between 5 and 1000 then raise exception 'REFUND_REJECTION_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(4000044001::bigint);
  select * into v_refund from public.payments where id=p_refund and kind='refund' for update;
  if found and v_refund.status='failed' and v_refund.refund_rejected_at is not null then
    if v_refund.refund_rejection_reason=v_reason then
      return jsonb_build_object('refund_id',p_refund,'status','failed','replayed',true);
    end if;
    raise exception 'REFUND_ALREADY_REJECTED';
  end if;
  if not found or v_refund.status<>'pending' or v_refund.refund_approved_at is not null
    or v_refund.refund_requested_by is null then raise exception 'REFUND_NOT_PENDING'; end if;
  update public.payments set status='failed',refund_rejected_by=v_actor,
    refund_rejected_at=now(),refund_rejection_reason=v_reason where id=p_refund;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
    values(v_actor,'admin','demo_refund_rejected','payment',p_refund,v_refund.request_id,
      jsonb_build_object('order_id',v_refund.order_id,'reason',v_reason));
  return jsonb_build_object('refund_id',p_refund,'status','failed','replayed',false);
end $$;

create function public.reject_demo_refund(p_refund uuid,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.reject_demo_refund_core(p_refund,p_reason)
$$;

revoke all on function private.reject_demo_refund_core(uuid,text) from public,anon,authenticated;
revoke all on function public.reject_demo_refund(uuid,text) from public,anon,authenticated;
grant execute on function private.reject_demo_refund_core(uuid,text) to authenticated;
grant execute on function public.reject_demo_refund(uuid,text) to authenticated;
