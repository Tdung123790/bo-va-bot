create or replace function private.admin_update_product_core(
  p_id uuid,p_name text,p_description text,p_image_url text,
  p_price bigint,p_stock integer,p_status text,p_featured boolean,p_best_seller boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_old public.products%rowtype;
begin
  v_actor:=private.require_actor(array['admin']);
  select * into v_old from public.products where id=p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if nullif(btrim(p_name),'') is null or length(p_name)>180
    or (p_price is null and not v_old.is_customizable)
    or (p_price is not null and p_price<=0)
    or p_stock is null or p_stock<0 or p_status is null or p_status not in ('active','inactive')
    or p_featured is null or p_best_seller is null then
    raise exception 'INVALID_PRODUCT_VALUES';
  end if;
  if nullif(btrim(coalesce(p_image_url,'')),'') is not null
    and p_image_url !~* '^https://[^[:space:]]+$' then
    raise exception 'INVALID_IMAGE_URL';
  end if;
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
