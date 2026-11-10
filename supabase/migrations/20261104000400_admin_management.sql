-- Narrow trusted administration paths; direct Data API writes remain revoked.
create function private.admin_set_product_core(
  p_id uuid,p_price bigint,p_stock integer,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_old public.products%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  if p_price is null or p_price<=0 or p_stock is null or p_stock<0
    or p_status not in ('active','inactive') then raise exception 'INVALID_PRODUCT_VALUES'; end if;
  select * into v_old from public.products where id=p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  update public.products set base_price=p_price,stock_quantity=p_stock,
    status=p_status,updated_at=now() where id=p_id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,'admin','catalog_product_update','product',p_id,
    jsonb_build_object('base_price',v_old.base_price,'stock_quantity',v_old.stock_quantity,
      'status',v_old.status),
    jsonb_build_object('base_price',p_price,'stock_quantity',p_stock,'status',p_status));
  return jsonb_build_object('product_id',p_id,'updated',true);
end $$;

create function private.admin_set_promotion_core(
  p_id uuid,p_discount_type text,p_discount_value numeric,p_target_type text,
  p_target_product uuid,p_target_category uuid,p_min_order bigint,
  p_max_discount bigint,p_starts timestamptz,p_ends timestamptz,
  p_usage_limit integer,p_usage_per_customer integer,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_old public.promotions%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  select * into v_old from public.promotions where id=p_id for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if p_usage_limit is not null and p_usage_limit<v_old.used_count then
    raise exception 'PROMOTION_LIMIT_BELOW_USED'; end if;
  update public.promotions set discount_type=p_discount_type,
    discount_value=p_discount_value,target_type=p_target_type,
    target_product_id=p_target_product,target_category_id=p_target_category,
    min_order_value=p_min_order,max_discount=p_max_discount,
    starts_at=p_starts,ends_at=p_ends,usage_limit=p_usage_limit,
    usage_per_customer=p_usage_per_customer,status=p_status,updated_at=now()
    where id=p_id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,'admin','promotion_update','promotion',p_id,
    jsonb_build_object('discount_type',v_old.discount_type,'discount_value',v_old.discount_value,
      'target_type',v_old.target_type,'status',v_old.status),
    jsonb_build_object('discount_type',p_discount_type,'discount_value',p_discount_value,
      'target_type',p_target_type,'status',p_status));
  return jsonb_build_object('promotion_id',p_id,'updated',true);
end $$;

create function private.admin_assign_role_core(p_profile uuid,p_role text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_old public.profiles%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  if p_role not in ('customer','staff','admin') or p_status not in ('active','blocked')
    then raise exception 'INVALID_ROLE_OR_STATUS'; end if;
  if p_profile=v_actor and (p_role<>'admin' or p_status<>'active') then
    raise exception 'CANNOT_REMOVE_OWN_ADMIN_ACCESS'; end if;
  select * into v_old from public.profiles where id=p_profile for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  update public.profiles set role=p_role,status=p_status,updated_at=now() where id=p_profile;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,'admin','profile_access_update','profile',p_profile,
    jsonb_build_object('role',v_old.role,'status',v_old.status),
    jsonb_build_object('role',p_role,'status',p_status));
  return jsonb_build_object('profile_id',p_profile,'role',p_role,'status',p_status);
end $$;

create function private.admin_set_store_core(
  p_lat numeric,p_lng numeric,p_pickup_hours jsonb,p_delivery_hours jsonb,
  p_service_area jsonb,p_shipping_tiers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_old jsonb;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  select to_jsonb(s) into v_old from public.store_settings s where store_key='main' for update;
  insert into public.store_settings(store_key,bakery_lat,bakery_lng,pickup_hours,
    delivery_hours,service_area,shipping_tiers,updated_by)
    values('main',p_lat,p_lng,p_pickup_hours,p_delivery_hours,
      p_service_area,p_shipping_tiers,v_actor)
    on conflict(store_key) do update set bakery_lat=excluded.bakery_lat,
      bakery_lng=excluded.bakery_lng,pickup_hours=excluded.pickup_hours,
      delivery_hours=excluded.delivery_hours,service_area=excluded.service_area,
      shipping_tiers=excluded.shipping_tiers,updated_by=v_actor,updated_at=now();
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,'admin','store_settings_update','store_settings',
      '00000000-0000-0000-0000-000000000001'::uuid,
      v_old - 'updated_by',jsonb_build_object('store_key','main',
        'bakery_lat',p_lat,'bakery_lng',p_lng,'pickup_hours',p_pickup_hours,
        'delivery_hours',p_delivery_hours,'service_area',p_service_area,
        'shipping_tiers',p_shipping_tiers));
  return jsonb_build_object('store_key','main','updated',true);
end $$;

create function private.submit_review_core(
  p_order_item uuid,p_rating smallint,p_content text,p_image_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_item public.order_items%rowtype;
  v_order public.orders%rowtype;v_review uuid;
begin
  v_actor:=private.require_actor(array['customer']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['customer']);
  if p_rating is null or p_rating not between 1 and 5
    or nullif(btrim(p_content),'') is null then raise exception 'INVALID_REVIEW'; end if;
  select * into v_item from public.order_items where id=p_order_item;
  if not found or v_item.product_id is null then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  select * into v_order from public.orders where id=v_item.order_id;
  if not found or v_order.customer_id<>v_actor or v_order.order_status<>'completed' then
    raise exception 'REVIEW_NOT_ALLOWED' using errcode='42501'; end if;
  insert into public.reviews(customer_id,order_id,order_item_id,product_id,
    rating,content,image_url,status)
    values(v_actor,v_order.id,v_item.id,v_item.product_id,
      p_rating,btrim(p_content),p_image_url,'pending')
    returning id into v_review;
  return jsonb_build_object('review_id',v_review,'status','pending');
end $$;

create function private.admin_moderate_review_core(p_review uuid,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;v_old public.reviews%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  perform pg_advisory_xact_lock(4000044001::bigint);
  perform private.require_actor(array['admin']);
  if p_status not in ('published','hidden') then raise exception 'INVALID_REVIEW_STATUS'; end if;
  select * into v_old from public.reviews where id=p_review for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_old.status=p_status then return jsonb_build_object('review_id',p_review,
    'status',p_status,'replayed',true); end if;
  update public.reviews set status=p_status,updated_at=now() where id=p_review;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,
    old_value,new_value) values(v_actor,'admin','review_moderation','review',p_review,
    jsonb_build_object('status',v_old.status),jsonb_build_object('status',p_status));
  return jsonb_build_object('review_id',p_review,'status',p_status,'replayed',false);
end $$;

-- A cross-channel unique-customer total must not sum daily channel counters.
create function private.admin_customer_metrics_core(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid;v_unique integer;v_new integer;v_returning integer;
begin
  v_actor:=private.require_actor(array['admin']);
  if p_from is null or p_to is null or p_to<p_from then
    raise exception 'INVALID_DATE_RANGE'; end if;
  with first_purchase as (
    select o.customer_id,min((o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date) first_day
      from public.orders o join public.payments c on c.order_id=o.id
        and c.kind='charge' and c.status='paid'
      where o.order_status='completed' and o.customer_id is not null
      group by o.customer_id
  ), period_customers as (
    select distinct o.customer_id from public.orders o
      join public.payments c on c.order_id=o.id and c.kind='charge' and c.status='paid'
      where o.order_status='completed' and o.customer_id is not null
        and (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  ) select count(*),count(*) filter (where f.first_day between p_from and p_to),
      count(*) filter (where f.first_day<p_from)
    into v_unique,v_new,v_returning
    from period_customers p join first_purchase f on f.customer_id=p.customer_id;
  return jsonb_build_object('unique_customers',v_unique,
    'new_customers',v_new,'returning_customers',v_returning);
end $$;

create function public.admin_set_product(p_id uuid,p_price bigint,p_stock integer,p_status text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_set_product_core(p_id,p_price,p_stock,p_status)
$$;
create function public.admin_set_promotion(
  p_id uuid,p_discount_type text,p_discount_value numeric,p_target_type text,
  p_target_product uuid,p_target_category uuid,p_min_order bigint,
  p_max_discount bigint,p_starts timestamptz,p_ends timestamptz,
  p_usage_limit integer,p_usage_per_customer integer,p_status text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_set_promotion_core(p_id,p_discount_type,p_discount_value,
    p_target_type,p_target_product,p_target_category,p_min_order,p_max_discount,
    p_starts,p_ends,p_usage_limit,p_usage_per_customer,p_status)
$$;
create function public.admin_assign_role(p_profile uuid,p_role text,p_status text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_assign_role_core(p_profile,p_role,p_status)
$$;
create function public.admin_set_store(
  p_lat numeric,p_lng numeric,p_pickup_hours jsonb,p_delivery_hours jsonb,
  p_service_area jsonb,p_shipping_tiers jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_set_store_core(p_lat,p_lng,p_pickup_hours,p_delivery_hours,
    p_service_area,p_shipping_tiers)
$$;
create function public.submit_review(
  p_order_item uuid,p_rating smallint,p_content text,p_image_url text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_review_core(p_order_item,p_rating,p_content,p_image_url)
$$;
create function public.admin_moderate_review(p_review uuid,p_status text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_moderate_review_core(p_review,p_status)
$$;
create function public.admin_customer_metrics(p_from date,p_to date)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_customer_metrics_core(p_from,p_to)
$$;

revoke all on function private.admin_set_product_core(uuid,bigint,integer,text) from public,anon,authenticated;
revoke all on function private.admin_set_promotion_core(uuid,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) from public,anon,authenticated;
revoke all on function private.admin_assign_role_core(uuid,text,text) from public,anon,authenticated;
revoke all on function private.admin_set_store_core(numeric,numeric,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.submit_review_core(uuid,smallint,text,text) from public,anon,authenticated;
revoke all on function private.admin_moderate_review_core(uuid,text) from public,anon,authenticated;
revoke all on function private.admin_customer_metrics_core(date,date) from public,anon,authenticated;
revoke all on function public.admin_set_product(uuid,bigint,integer,text) from public,anon,authenticated;
revoke all on function public.admin_set_promotion(uuid,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) from public,anon,authenticated;
revoke all on function public.admin_assign_role(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_set_store(numeric,numeric,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.submit_review(uuid,smallint,text,text) from public,anon,authenticated;
revoke all on function public.admin_moderate_review(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_customer_metrics(date,date) from public,anon,authenticated;
grant execute on function private.admin_set_product_core(uuid,bigint,integer,text) to authenticated;
grant execute on function private.admin_set_promotion_core(uuid,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) to authenticated;
grant execute on function private.admin_assign_role_core(uuid,text,text) to authenticated;
grant execute on function private.admin_set_store_core(numeric,numeric,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function private.submit_review_core(uuid,smallint,text,text) to authenticated;
grant execute on function private.admin_moderate_review_core(uuid,text) to authenticated;
grant execute on function private.admin_customer_metrics_core(date,date) to authenticated;
grant execute on function public.admin_set_product(uuid,bigint,integer,text) to authenticated;
grant execute on function public.admin_set_promotion(uuid,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) to authenticated;
grant execute on function public.admin_assign_role(uuid,text,text) to authenticated;
grant execute on function public.admin_set_store(numeric,numeric,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.submit_review(uuid,smallint,text,text) to authenticated;
grant execute on function public.admin_moderate_review(uuid,text) to authenticated;
grant execute on function public.admin_customer_metrics(date,date) to authenticated;
