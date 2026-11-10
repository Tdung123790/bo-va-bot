create function private.admin_activate_final_20261112_core() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_existing public.promotions%rowtype;v_created public.promotions%rowtype;v_count integer;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FINAL_2026_11_12_15_PERCENT',0));
  select count(*) into v_count from public.promotions
    where id='a5526fc3-4e1d-4766-bd9a-59f1b7049bbf'::uuid
      or source_id='FINAL_2026_11_12_15_PERCENT' or name='Ưu đãi 12/11';
  if v_count>1 then raise exception 'FINAL_PROMOTION_IDENTITY_CONFLICT'; end if;
  if v_count=1 then
    select * into v_existing from public.promotions
      where id='a5526fc3-4e1d-4766-bd9a-59f1b7049bbf'::uuid
        or source_id='FINAL_2026_11_12_15_PERCENT' or name='Ưu đãi 12/11'
      for update;
    if v_existing.id is distinct from 'a5526fc3-4e1d-4766-bd9a-59f1b7049bbf'::uuid
      or v_existing.source_id is distinct from 'FINAL_2026_11_12_15_PERCENT'
      or v_existing.name is distinct from 'Ưu đãi 12/11'
      or v_existing.description is distinct from 'Ưu đãi tự động từ 10/11 đến hết 12/11/2026 cho đơn hàng đủ điều kiện.'
      or v_existing.discount_type is distinct from 'PERCENT'
      or v_existing.discount_value is distinct from 15
      or v_existing.min_order_value is distinct from 150000
      or v_existing.max_discount is distinct from 90000
      or v_existing.target_type is distinct from 'ALL'
      or v_existing.target_product_id is not null or v_existing.target_category_id is not null
      or v_existing.voucher_code is not null
      or v_existing.starts_at is distinct from '2026-11-10T00:00:00+07:00'::timestamptz
      or v_existing.ends_at is distinct from '2026-11-12T23:59:59+07:00'::timestamptz
      or v_existing.usage_limit is not null or v_existing.usage_per_customer is not null
    then raise exception 'FINAL_PROMOTION_TERMS_CONFLICT'; end if;
    if v_existing.status='active' then
      return jsonb_build_object('promotion_id',v_existing.id,'source_id',v_existing.source_id,'created',false,'activated',false,'replayed',true);
    end if;
    update public.promotions set status='active',updated_at=now() where id=v_existing.id returning * into v_created;
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,old_value,new_value)
      values(v_actor,'admin','promotion_activate','promotion',v_created.id,
        jsonb_build_object('status',v_existing.status),
        jsonb_build_object('source_id',v_created.source_id,'status',v_created.status,'approval_source','Quyết định trực tiếp của chủ dự án ngày 10/11/2026'));
    return jsonb_build_object('promotion_id',v_created.id,'source_id',v_created.source_id,'created',false,'activated',true,'replayed',false);
  end if;
  insert into public.promotions(id,source_id,name,description,discount_type,discount_value,
    min_order_value,max_discount,target_type,target_product_id,target_category_id,voucher_code,
    usage_limit,usage_per_customer,starts_at,ends_at,status)
  values('a5526fc3-4e1d-4766-bd9a-59f1b7049bbf','FINAL_2026_11_12_15_PERCENT',
    'Ưu đãi 12/11','Ưu đãi tự động từ 10/11 đến hết 12/11/2026 cho đơn hàng đủ điều kiện.',
    'PERCENT',15,150000,90000,'ALL',null,null,null,null,null,
    '2026-11-10T00:00:00+07:00','2026-11-12T23:59:59+07:00','active')
  returning * into v_created;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,'admin','promotion_create','promotion',v_created.id,
      jsonb_build_object('source_id',v_created.source_id,'name',v_created.name,
        'discount_type',v_created.discount_type,'discount_value',v_created.discount_value,
        'min_order_value',v_created.min_order_value,'max_discount',v_created.max_discount,
        'target_type',v_created.target_type,'starts_at',v_created.starts_at,'ends_at',v_created.ends_at,
        'usage_limit',v_created.usage_limit,'usage_per_customer',v_created.usage_per_customer,
        'status',v_created.status,'approval_source','Quyết định trực tiếp của chủ dự án ngày 10/11/2026'));
  return jsonb_build_object('promotion_id',v_created.id,'source_id',v_created.source_id,'created',true,'activated',true,'replayed',false);
end $$;

create function public.admin_activate_final_20261112() returns jsonb
language sql security invoker set search_path='' as $$
  select private.admin_activate_final_20261112_core()
$$;

revoke all on function private.admin_activate_final_20261112_core() from public,anon,authenticated;
revoke all on function public.admin_activate_final_20261112() from public,anon,authenticated;
grant execute on function private.admin_activate_final_20261112_core() to authenticated;
grant execute on function public.admin_activate_final_20261112() to authenticated;
