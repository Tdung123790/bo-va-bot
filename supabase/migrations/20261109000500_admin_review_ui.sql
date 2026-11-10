create function private.admin_create_promotion_core(
  p_name text,p_description text,p_discount_type text,p_discount_value numeric,
  p_target_type text,p_target_product uuid,p_target_category uuid,
  p_min_order bigint,p_max_discount bigint,p_starts timestamptz,p_ends timestamptz,
  p_usage_limit integer,p_usage_per_customer integer,p_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_id uuid;
begin
  v_actor:=private.require_actor(array['admin']);
  if nullif(btrim(p_name),'') is null or length(p_name)>160 then raise exception 'INVALID_PROMOTION_NAME'; end if;
  if p_status is null or p_status not in ('active','inactive') then raise exception 'INVALID_PROMOTION_STATUS'; end if;
  insert into public.promotions(
    name,description,discount_type,discount_value,target_type,target_product_id,target_category_id,
    min_order_value,max_discount,starts_at,ends_at,usage_limit,usage_per_customer,status
  ) values (
    btrim(p_name),nullif(btrim(p_description),''),p_discount_type,p_discount_value,
    p_target_type,p_target_product,p_target_category,p_min_order,p_max_discount,
    p_starts,p_ends,p_usage_limit,p_usage_per_customer,p_status
  ) returning id into v_id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,new_value)
    values(v_actor,'admin','promotion_create','promotion',v_id,
      jsonb_build_object('name',p_name,'discount_type',p_discount_type,
        'discount_value',p_discount_value,'target_type',p_target_type,'status',p_status));
  return jsonb_build_object('promotion_id',v_id,'created',true);
end $$;

create function public.admin_create_promotion(
  p_name text,p_description text,p_discount_type text,p_discount_value numeric,
  p_target_type text,p_target_product uuid,p_target_category uuid,
  p_min_order bigint,p_max_discount bigint,p_starts timestamptz,p_ends timestamptz,
  p_usage_limit integer,p_usage_per_customer integer,p_status text
) returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_create_promotion_core(
    p_name,p_description,p_discount_type,p_discount_value,p_target_type,p_target_product,
    p_target_category,p_min_order,p_max_discount,p_starts,p_ends,
    p_usage_limit,p_usage_per_customer,p_status
  )
$$;

create function private.admin_update_product_core(
  p_id uuid,p_name text,p_description text,p_image_url text,
  p_price bigint,p_stock integer,p_status text,p_featured boolean,p_best_seller boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_old public.products%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  if nullif(btrim(p_name),'') is null or length(p_name)>180 or p_price is null or p_price<=0
    or p_stock is null or p_stock<0 or p_status is null or p_status not in ('active','inactive')
    or p_featured is null or p_best_seller is null then
    raise exception 'INVALID_PRODUCT_VALUES';
  end if;
  if nullif(btrim(coalesce(p_image_url,'')),'') is not null
    and p_image_url !~* '^https://[^[:space:]]+$' then
    raise exception 'INVALID_IMAGE_URL';
  end if;
  select * into v_old from public.products where id=p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  update public.products set name=btrim(p_name),description=p_description,
    image_url=nullif(btrim(p_image_url),''),base_price=p_price,
    stock_quantity=p_stock,status=p_status,is_featured=p_featured,
    is_best_seller=p_best_seller,updated_at=now() where id=p_id;
  insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,old_value,new_value)
    values(v_actor,'admin','catalog_product_update','product',p_id,
      jsonb_build_object('name',v_old.name,'base_price',v_old.base_price,
        'stock_quantity',v_old.stock_quantity,'status',v_old.status),
      jsonb_build_object('name',btrim(p_name),'base_price',p_price,
        'stock_quantity',p_stock,'status',p_status));
  return jsonb_build_object('product_id',p_id,'updated',true);
end $$;

create function public.admin_update_product(
  p_id uuid,p_name text,p_description text,p_image_url text,
  p_price bigint,p_stock integer,p_status text,p_featured boolean,p_best_seller boolean
) returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_update_product_core(
    p_id,p_name,p_description,p_image_url,p_price,p_stock,p_status,p_featured,p_best_seller
  )
$$;

create function private.reviewable_items_core() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_items jsonb;
begin
  v_actor:=private.require_actor(array['customer']);
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id',i.id,'product_name',i.product_name_snapshot,
    'order_code',o.order_code,'product_id',i.product_id
  ) order by o.completed_at desc,i.line_no),'[]'::jsonb)
  into v_items
  from public.orders o
  join public.order_items i on i.order_id=o.id
  where o.customer_id=v_actor and o.order_status='completed' and i.product_id is not null
    and not exists(
      select 1 from public.reviews r where r.customer_id=v_actor
        and r.order_id=o.id and r.product_id=i.product_id
    );
  return v_items;
end $$;

create function public.reviewable_items() returns jsonb
language sql security invoker set search_path='' as $$
  select private.reviewable_items_core()
$$;

revoke all on function private.admin_create_promotion_core(text,text,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) from public,anon,authenticated;
revoke all on function public.admin_create_promotion(text,text,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) from public,anon,authenticated;
revoke all on function private.admin_update_product_core(uuid,text,text,text,bigint,integer,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.admin_update_product(uuid,text,text,text,bigint,integer,text,boolean,boolean) from public,anon,authenticated;
revoke all on function private.reviewable_items_core() from public,anon,authenticated;
revoke all on function public.reviewable_items() from public,anon,authenticated;
grant execute on function private.admin_create_promotion_core(text,text,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) to authenticated;
grant execute on function public.admin_create_promotion(text,text,text,numeric,text,uuid,uuid,bigint,bigint,timestamptz,timestamptz,integer,integer,text) to authenticated;
grant execute on function private.admin_update_product_core(uuid,text,text,text,bigint,integer,text,boolean,boolean) to authenticated;
grant execute on function public.admin_update_product(uuid,text,text,text,bigint,integer,text,boolean,boolean) to authenticated;
grant execute on function private.reviewable_items_core() to authenticated;
grant execute on function public.reviewable_items() to authenticated;