alter table public.store_settings add column if not exists delivery_origin_approved_at timestamptz;
alter table public.store_settings add column if not exists delivery_origin_approval_source text;
alter table public.store_settings add constraint delivery_origin_approval_complete
  check (delivery_origin_approved_at is null or
    (bakery_lat is not null and bakery_lng is not null and
     nullif(pg_catalog.btrim(delivery_origin_approval_source),'') is not null));

create function private.clear_delivery_origin_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.bakery_lat is distinct from old.bakery_lat
    or new.bakery_lng is distinct from old.bakery_lng then
    new.delivery_origin_approved_at:=null;
    new.delivery_origin_approval_source:=null;
  end if;
  return new;
end $$;
create trigger clear_delivery_origin_approval before update of bakery_lat,bakery_lng
on public.store_settings for each row execute function private.clear_delivery_origin_approval();
revoke all on function private.clear_delivery_origin_approval() from public,anon,authenticated;

create table private.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  request_id text not null check (length(request_id) between 1 and 200),
  address_salt uuid not null,
  address_hash bytea not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  expires_at timestamptz not null,
  used_order_id uuid references public.orders(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index delivery_proofs_customer_request on private.delivery_proofs(customer_id,request_id,expires_at);
alter table private.delivery_proofs enable row level security;
revoke all on private.delivery_proofs from public,anon,authenticated;

create function private.delivery_address_hash(p_salt uuid,p_address text) returns bytea
language sql immutable set search_path = '' as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_salt::text||':'||pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_address),'[[:space:]]+',' ','g')),'UTF8'))
$$;

create function private.require_delivery_proof(p_request jsonb,p_customer uuid)
returns private.delivery_proofs language plpgsql security definer set search_path = '' as $$
declare v_proof private.delivery_proofs%rowtype;v_address text;
begin
  if p_customer is null or p_customer is distinct from auth.uid()
    or private.active_role() is distinct from 'customer' then
    raise exception 'DELIVERY_CUSTOMER_REQUIRED' using errcode='42501'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or p_request ?| array['delivery_lat','delivery_lng','shipping_fee','verified_lat','verified_lng'] then
    raise exception 'UNTRUSTED_DELIVERY_COORDINATES'; end if;
  v_address:=p_request->>'ship_address';
  if v_address is null or length(pg_catalog.btrim(v_address)) not between 12 and 500
    or nullif(pg_catalog.btrim(p_request->>'request_id'),'') is null
    or nullif(pg_catalog.btrim(p_request->>'delivery_proof_id'),'') is null then
    raise exception 'DELIVERY_PROOF_REQUIRED'; end if;
  select * into v_proof from private.delivery_proofs
    where id=(p_request->>'delivery_proof_id')::uuid and customer_id=p_customer
      and request_id=p_request->>'request_id'
      and expires_at>now() and used_order_id is null;
  if not found or v_proof.address_hash is distinct from
    private.delivery_address_hash(v_proof.address_salt,v_address) then
    raise exception 'DELIVERY_PROOF_INVALID_OR_EXPIRED'; end if;
  return v_proof;
end $$;

create function private.issue_delivery_proof_core(p_customer uuid,p_request_id text,
  p_address text,p_lat numeric,p_lng numeric,p_provider_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_expiry timestamptz;v_salt uuid;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_customer and role='customer' and status='active')
    or p_request_id is null or length(p_request_id) not between 1 and 200
    or p_address is null or length(pg_catalog.btrim(p_address)) not between 12 and 500
    or p_lat is null or p_lat not between -90 and 90
    or p_lng is null or p_lng not between -180 and 180
    or p_provider_ref is null or p_provider_ref !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'INVALID_DELIVERY_VERIFICATION'; end if;
  if (select count(*) from private.delivery_proofs
      where customer_id=p_customer and created_at>now()-interval '1 minute')>=5 then
    raise exception 'DELIVERY_VERIFICATION_RATE_LIMIT'; end if;
  v_expiry:=now()+interval '5 minutes';
  v_salt:=gen_random_uuid();
  insert into private.delivery_proofs(customer_id,request_id,address_salt,address_hash,
    latitude,longitude,expires_at)
    values(p_customer,p_request_id,v_salt,private.delivery_address_hash(v_salt,p_address),p_lat,p_lng,v_expiry)
    returning id into v_id;
  insert into public.audit_log(actor_type,action,entity_type,entity_id,request_id,new_value)
    values('system','delivery_proof_issued','delivery_proof',v_id,p_request_id,
      jsonb_build_object('provider_ref',p_provider_ref,'expires_at',v_expiry));
  return jsonb_build_object('proof_id',v_id,'expires_at',v_expiry);
end $$;

create function public.issue_delivery_proof(p_customer uuid,p_request_id text,
  p_address text,p_lat numeric,p_lng numeric,p_provider_ref text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.issue_delivery_proof_core(p_customer,p_request_id,p_address,p_lat,p_lng,p_provider_ref)
$$;

revoke all on function private.delivery_address_hash(uuid,text) from public,anon,authenticated;
revoke all on function private.require_delivery_proof(jsonb,uuid) from public,anon,authenticated;
revoke all on function private.issue_delivery_proof_core(uuid,text,text,numeric,numeric,text) from public,anon,authenticated;
revoke all on function public.issue_delivery_proof(uuid,text,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function private.issue_delivery_proof_core(uuid,text,text,numeric,numeric,text) to service_role;
grant execute on function public.issue_delivery_proof(uuid,text,text,numeric,numeric,text) to service_role;

create function private.delivery_window(p_requested timestamptz,p_has_custom boolean,
  p_fulfillment text,p_now timestamptz) returns void
language plpgsql set search_path = '' as $$
declare v_clock text;
begin
  if p_fulfillment='counter' then return; end if;
  if p_requested is null or p_requested<=p_now then raise exception 'INVALID_REQUESTED_AT'; end if;
  if p_fulfillment='delivery' and
    (p_requested at time zone 'Asia/Ho_Chi_Minh')::date=
    (p_now at time zone 'Asia/Ho_Chi_Minh')::date and
    (p_now at time zone 'Asia/Ho_Chi_Minh')::time>=time '17:00' then
    raise exception 'SAME_DAY_DELIVERY_CUTOFF'; end if;
  if p_has_custom and p_requested<p_now+interval '24 hours' then
    raise exception 'CUSTOM_CAKE_REQUIRES_24_HOURS'; end if;
  if not p_has_custom and p_requested<p_now+interval '2 hours' then
    raise exception 'REGULAR_CAKE_REQUIRES_2_HOURS'; end if;
  v_clock:=to_char(p_requested at time zone 'Asia/Ho_Chi_Minh','HH24:MI');
  if v_clock<'09:30' or v_clock>='20:30' then
    raise exception 'OUTSIDE_STORE_HOURS'; end if;
  if p_fulfillment='pickup' and (v_clock<'10:00' or v_clock>='20:00') then
    raise exception 'OUTSIDE_PICKUP_HOURS'; end if;
  if p_fulfillment='delivery' then
    if v_clock<'10:00' or v_clock>='19:00' then raise exception 'OUTSIDE_DELIVERY_HOURS'; end if;
  end if;
end $$;
revoke all on function private.delivery_window(timestamptz,boolean,text,timestamptz) from public,anon,authenticated;

create function private.quote_core(
  p_items jsonb,p_fulfillment text,p_requested_at timestamptz,
  p_lat numeric,p_lng numeric,p_points integer,p_customer uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_option public.customization_options%rowtype; v_role text; v_quantity integer;
  v_unit bigint; v_line bigint; v_subtotal bigint:=0; v_lines jsonb:='[]'::jsonb;
  v_custom jsonb; v_snapshot jsonb; v_size bigint; v_option_id uuid;
  v_has_custom boolean:=false; v_settings public.store_settings%rowtype;
  v_hours jsonb; v_day text; v_clock text; v_hour jsonb; v_hour_ok boolean;
  v_distance numeric; v_fee bigint:=0; v_shipping_tier jsonb;
  v_promotion uuid; v_discount bigint:=0; v_candidate bigint;
  v_eligible bigint; v_promo public.promotions%rowtype;
  v_post bigint; v_balance integer; v_line_item jsonb; v_proof private.delivery_proofs%rowtype;
begin
  if p_customer is not null and (p_customer is distinct from auth.uid()
    or private.active_role() is distinct from 'customer') then
    raise exception 'CUSTOMER_CONTEXT_FORBIDDEN' using errcode='42501';
  end if;
  if p_fulfillment='counter' and coalesce(private.active_role(),'') not in ('staff','admin') then
    raise exception 'POS_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0
    then raise exception 'CART_EMPTY'; end if;
  if p_points is null or p_points<0 then raise exception 'INVALID_POINTS'; end if;
  if p_fulfillment is null or p_fulfillment not in ('delivery','pickup','counter')
    then raise exception 'INVALID_FULFILLMENT'; end if;
  if p_fulfillment='delivery' then
    v_proof:=private.require_delivery_proof(p_request,p_customer);
    p_lat:=v_proof.latitude;p_lng:=v_proof.longitude;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'INVALID_ITEM'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and status='active';
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    v_unit:=v_product.base_price; v_snapshot:=null; v_variant:=null;
    if v_product.is_customizable then
      v_has_custom:=true;
      if p_fulfillment='counter' then raise exception 'CUSTOM_CAKE_NOT_POS_READY'; end if;
      v_custom:=v_item->'customization';
      if v_custom is null or jsonb_typeof(v_custom)<>'object' then
        raise exception 'CUSTOMIZATION_REQUIRED'; end if;
      v_size:=null; v_unit:=0; v_snapshot:='{}'::jsonb;
      foreach v_role in array array['size','flavor','cream','font','color'] loop
        v_option_id:=(v_custom->>(v_role||'_id'))::uuid;
        select o.* into v_option from public.customization_options o
          join public.customization_categories c on c.id=o.category_id
          where o.id=v_option_id and o.status='active' and c.status='active'
            and c.pricing_role=v_role;
        if not found then raise exception 'INVALID_CUSTOMIZATION_%',v_role; end if;
        if v_role='size' then
          if v_option.base_price is null or v_option.base_price<=0 then
            raise exception 'CUSTOM_PRICE_NOT_CONFIGURED'; end if;
          v_size:=v_option.base_price;
        end if;
        v_unit:=v_unit+v_option.price_modifier;
        v_snapshot:=v_snapshot||jsonb_build_object(v_role,
          jsonb_build_object('id',v_option.id,'name',v_option.name,
            'base_price',v_option.base_price,'price_modifier',v_option.price_modifier));
      end loop;
      v_unit:=v_unit+v_size;
      v_snapshot:=v_snapshot||jsonb_build_object('text',coalesce(v_custom->>'text',''));
    else
      if v_unit is null then raise exception 'PRICE_NOT_CONFIRMED'; end if;
      if v_item->>'variant_id' is not null then
        select * into v_variant from public.product_variants
          where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and status='active';
        if not found then raise exception 'VARIANT_NOT_AVAILABLE'; end if;
        v_unit:=v_unit+v_variant.price_modifier;
        if v_variant.stock_quantity<v_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
      elsif v_product.stock_quantity<v_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    end if;
    if v_unit is null or v_unit<=0 then raise exception 'PRICE_NOT_CONFIRMED'; end if;
    v_line:=v_unit*v_quantity; v_subtotal:=v_subtotal+v_line;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'category_id',v_product.category_id,
      'variant_id',v_variant.id,'product_name_snapshot',v_product.name,
      'variant_name_snapshot',v_variant.name,'quantity',v_quantity,
      'unit_price',v_unit,'subtotal',v_line,'customization_data',v_snapshot));
  end loop;
  if exists(select 1 from (
    select (x->>'product_id')::uuid product_id,(x->>'variant_id')::uuid variant_id,
      sum((x->>'quantity')::integer) qty from jsonb_array_elements(v_lines) x
      where x->'customization_data'='null'::jsonb
      group by 1,2) q join public.products p on p.id=q.product_id
    left join public.product_variants pv on pv.id=q.variant_id
    where q.qty>coalesce(pv.stock_quantity,p.stock_quantity))
    then raise exception 'INSUFFICIENT_STOCK'; end if;

  if p_fulfillment<>'counter' then
    perform private.delivery_window(p_requested_at,v_has_custom,p_fulfillment,now());
    select * into v_settings from public.store_settings where store_key='main';
    if not found then raise exception 'STORE_NOT_CONFIGURED'; end if;
    if p_fulfillment='delivery' then
      if v_settings.delivery_origin_approved_at is null or v_settings.delivery_origin_approval_source is null or v_settings.bakery_lat is null
        or v_settings.bakery_lng is null then raise exception 'DELIVERY_ORIGIN_NOT_APPROVED'; end if;
      v_distance:=6371*2*asin(sqrt(least(1,
        power(sin(radians((p_lat-v_settings.bakery_lat)/2)),2)+
        cos(radians(v_settings.bakery_lat))*cos(radians(p_lat))*
        power(sin(radians((p_lng-v_settings.bakery_lng)/2)),2))));
      if v_distance>10 then raise exception 'OUTSIDE_DELIVERY_AREA'; end if;
      v_fee:=case when v_distance<=3 then 20000 when v_distance<=5 then 30000 else 50000 end;
    end if;
  end if;

  for v_promo in select * from public.promotions
    where status='active' and starts_at<=now() and ends_at>=now()
      and v_subtotal>=min_order_value
      and (usage_limit is null or used_count<usage_limit)
    order by coalesce(source_id,id::text) collate "C",id loop
    if v_promo.usage_per_customer is not null then
      if p_customer is null or (select count(*) from public.orders
          where customer_id=p_customer and promotion_id=v_promo.id
            and promotion_usage_claimed)>=v_promo.usage_per_customer then continue; end if;
    end if;
    select coalesce(sum((x->>'subtotal')::bigint),0) into v_eligible
      from jsonb_array_elements(v_lines) x
      where v_promo.target_type='ALL'
        or (v_promo.target_type='PRODUCT' and (x->>'product_id')::uuid=v_promo.target_product_id)
        or (v_promo.target_type='CATEGORY' and (x->>'category_id')::uuid=v_promo.target_category_id);
    if v_eligible<=0 then continue; end if;
    if v_promo.discount_type='PERCENT' then
      v_candidate:=round(v_eligible*v_promo.discount_value/100)::bigint;
    else v_candidate:=v_promo.discount_value::bigint; end if;
    v_candidate:=least(v_candidate,v_eligible,v_subtotal,
      coalesce(v_promo.max_discount,v_subtotal));
    if v_candidate>v_discount then v_discount:=v_candidate;v_promotion:=v_promo.id;end if;
  end loop;
  v_post:=v_subtotal-v_discount;
  if p_points>floor(v_post*0.20/10)::integer then raise exception 'POINTS_CAP_EXCEEDED'; end if;
  if p_points>0 then
    if p_customer is null then raise exception 'AUTH_REQUIRED_FOR_POINTS'; end if;
    select points into v_balance from public.loyalty_accounts where customer_id=p_customer;
    if v_balance is null or p_points>v_balance then raise exception 'INSUFFICIENT_POINTS'; end if;
  end if;
  return jsonb_build_object('items',v_lines,'subtotal',v_subtotal,
    'discount_amount',v_discount,'promotion_id',v_promotion,
    'points_used',p_points,'points_discount_amount',p_points*10,
    'shipping_fee',v_fee,'shipping_distance_km',v_distance,
    'total_amount',v_post-p_points*10+v_fee,
    'has_custom_cake',v_has_custom);
end $$;

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
      case when p_channel='offline' then 'completed' else 'pending' end,
      case when p_channel='offline' then 'paid'
           when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      case when p_channel='offline' then now() else null end);
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
      case when p_channel='offline' then 'paid'
           when v_method in ('bank_transfer_demo','vnpay') then 'pending' else 'unpaid' end,
      (v_quote->>'total_amount')::bigint,
      (v_quote->>'total_amount')::bigint-(v_quote->>'shipping_fee')::bigint,
      (v_quote->>'shipping_fee')::bigint,v_request_id,
      case when p_channel='offline' then v_actor else null end,
      case when p_channel='offline' then now() else null end);
  insert into public.order_status_history(order_id,to_status,changed_by,actor_type,event_key,note)
    values(v_id,case when p_channel='offline' then 'completed' else 'pending' end,
      v_actor,case when p_channel='offline' then
        (select role from public.profiles where id=v_actor) else 'customer' end,
      'created','Đơn được tạo');
  if p_channel='offline' then
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
      values(v_actor,(select role from public.profiles where id=v_actor),
        'pos_sale','order',v_id,v_request_id,
        jsonb_build_object('payment_method','cash_demo','total_amount',v_quote->>'total_amount'));
  end if;
  perform private.refresh_for_order(v_id);
  return jsonb_build_object('order_id',v_id,'order_code',v_code,
    'total_amount',(v_quote->>'total_amount')::bigint,'replayed',false);
end $$;

create or replace function public.quote_order(p_request jsonb) returns jsonb language sql
security invoker set search_path = '' as $$
  select private.quote_core(p_request->'items',p_request->>'fulfillment_type',
    (p_request->>'requested_at')::timestamptz,null,null,
    coalesce((p_request->>'points_used')::integer,0),
    case when private.active_role()='customer' then auth.uid() else null end,p_request)
$$;
revoke all on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid,jsonb) to anon,authenticated;
revoke execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid) from anon,authenticated;
