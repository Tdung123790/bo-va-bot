create or replace function private.admin_moderate_review_with_reason_core(p_review uuid,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_old public.reviews%rowtype;v_reason text;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  if p_status not in ('published','hidden') then raise exception 'INVALID_REVIEW_STATUS'; end if;
  v_reason:=nullif(btrim(coalesce(p_reason,'')),'');
  if p_status='hidden' and v_reason is null then raise exception 'REVIEW_REASON_REQUIRED'; end if;
  if length(coalesce(v_reason,''))>1000 then raise exception 'REVIEW_REASON_TOO_LONG'; end if;
  select * into v_old from public.reviews where id=p_review for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_old.status=p_status then
    return jsonb_build_object('review_id',p_review,'status',p_status,'replayed',true);
  end if;
  update public.reviews set status=p_status,updated_at=now() where id=p_review;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,old_value,new_value)
    values(v_actor,'admin','review_moderation','review',p_review,
      jsonb_build_object('status',v_old.status),
      jsonb_build_object('status',p_status,'reason',v_reason));
  return jsonb_build_object('review_id',p_review,'status',p_status,'replayed',false);
end $$;

create or replace function private.admin_update_product_checked_core(
  p_id uuid,p_name text,p_description text,p_image_url text,
  p_price bigint,p_stock integer,p_status text,p_featured boolean,p_best_seller boolean,
  p_expected_stock integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_stock integer;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  select stock_quantity into v_stock from public.products where id=p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_expected_stock is null or v_stock<>p_expected_stock then
    raise exception 'STOCK_CHANGED_RELOAD_REQUIRED' using errcode='40001';
  end if;
  return private.admin_update_product_core(
    p_id,p_name,p_description,p_image_url,p_price,p_stock,p_status,p_featured,p_best_seller
  );
end $$;
