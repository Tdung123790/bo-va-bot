-- Private transactional primitives. No function in private is an exposed RPC.
create function private.require_actor(p_roles text[]) returns uuid language plpgsql stable
security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_role text;
begin
  if v_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select role into v_role from public.profiles where id=v_id and status='active';
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception 'ROLE_OR_PROFILE_BLOCKED' using errcode='42501';
  end if;
  return v_id;
end $$;

create function private.handle_new_user() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name)
    values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.loyalty_accounts(customer_id) values(new.id);
  return new;
end $$;
create trigger bobot_auth_profile after insert on auth.users
  for each row execute function private.handle_new_user();

-- Payment is authoritative; this projection is written in the same transaction.
create function private.project_payment_status() returns trigger language plpgsql
security definer set search_path = '' as $$
declare v_charge public.payments%rowtype; v_refunded bigint; v_has_refund boolean;
begin
  select * into v_charge from public.payments
    where order_id=new.order_id and kind='charge' for update;
  if not found then return new; end if;
  select coalesce(sum(amount),0) into v_refunded from public.payments
    where order_id=new.order_id and kind='refund' and status='refunded';
  select exists(select 1 from public.payments where order_id=new.order_id
    and kind='refund' and status='refunded') into v_has_refund;
  update public.orders set payment_status=
    case when v_charge.status='paid' and v_has_refund and v_refunded>=v_charge.amount then 'refunded'
         else v_charge.status end
    where id=new.order_id;
  return new;
end $$;
create trigger bobot_payment_projection after insert or update of status on public.payments
  for each row execute function private.project_payment_status();

create function private.loyalty_redeem(p_customer uuid,p_order uuid,p_points integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_available integer;
begin
  if p_points=0 then return; end if;
  if p_points<0 then raise exception 'INVALID_POINTS'; end if;
  select points into v_available from public.loyalty_accounts
    where customer_id=p_customer for update;
  if v_available is null or v_available<p_points then raise exception 'INSUFFICIENT_POINTS'; end if;
  update public.loyalty_accounts set points=points-p_points,
    total_redeemed=total_redeemed+p_points,updated_at=now()
    where customer_id=p_customer;
  insert into public.loyalty_transactions
    (customer_id,order_id,points,transaction_type,event_key,description)
    values(p_customer,p_order,-p_points,'REDEEM','redeem:'||p_order,'Điểm sử dụng cho đơn');
end $$;

create function private.loyalty_restore(p_customer uuid,p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_points integer;
begin
  select -points into v_points from public.loyalty_transactions
    where order_id=p_order and customer_id=p_customer and transaction_type='REDEEM';
  if v_points is null or exists(select 1 from public.loyalty_transactions
      where order_id=p_order and transaction_type='RESTORE') then return; end if;
  perform 1 from public.loyalty_accounts where customer_id=p_customer for update;
  update public.loyalty_accounts set points=points+v_points,
    total_redeemed=total_redeemed-v_points,updated_at=now()
    where customer_id=p_customer;
  insert into public.loyalty_transactions
    (customer_id,order_id,points,transaction_type,event_key,description)
    values(p_customer,p_order,v_points,'RESTORE','restore:'||p_order,'Hoàn điểm khi hủy đơn');
end $$;

create function private.loyalty_earn(p_order uuid) returns void language plpgsql
security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_gross integer; v_debt integer; v_offset integer;
begin
  select * into v_order from public.orders where id=p_order for update;
  if not found or v_order.customer_id is null or v_order.order_status<>'completed'
    or not exists(select 1 from public.payments where order_id=p_order and kind='charge' and status='paid')
    or exists(select 1 from public.loyalty_transactions where order_id=p_order and transaction_type='EARN')
    then return; end if;
  v_gross := floor((v_order.subtotal-v_order.discount_amount-v_order.points_discount_amount)/10000.0)::integer;
  if v_gross<=0 then return; end if;
  select point_debt into v_debt from public.loyalty_accounts
    where customer_id=v_order.customer_id for update;
  if v_debt is null then raise exception 'LOYALTY_ACCOUNT_MISSING'; end if;
  v_offset := least(v_gross,v_debt);
  update public.loyalty_accounts set points=points+v_gross-v_offset,
    point_debt=point_debt-v_offset,total_earned=total_earned+v_gross,updated_at=now()
    where customer_id=v_order.customer_id;
  insert into public.loyalty_transactions
    (customer_id,order_id,points,debt_delta,gross_points,transaction_type,event_key,description)
    values(v_order.customer_id,p_order,v_gross-v_offset,-v_offset,v_gross,
      'EARN','earn:'||p_order,'Tích điểm; cấn nợ trước khi tăng điểm khả dụng');
end $$;

create function private.loyalty_clawback(p_order uuid) returns void language plpgsql
security definer set search_path = '' as $$
declare v_earn public.loyalty_transactions%rowtype; v_available integer;
  v_take integer; v_short integer;
begin
  select * into v_earn from public.loyalty_transactions
    where order_id=p_order and transaction_type='EARN';
  if not found or exists(select 1 from public.loyalty_transactions
      where order_id=p_order and transaction_type='CLAWBACK') then return; end if;
  select points into v_available from public.loyalty_accounts
    where customer_id=v_earn.customer_id for update;
  if v_available is null then raise exception 'LOYALTY_ACCOUNT_MISSING'; end if;
  v_take := least(v_available,v_earn.gross_points);
  v_short := v_earn.gross_points-v_take;
  update public.loyalty_accounts set points=points-v_take,
    point_debt=point_debt+v_short,updated_at=now()
    where customer_id=v_earn.customer_id;
  insert into public.loyalty_transactions
    (customer_id,order_id,points,debt_delta,transaction_type,event_key,
     related_transaction_id,description)
    values(v_earn.customer_id,p_order,-v_take,v_short,'CLAWBACK',
      'clawback:'||p_order,v_earn.id,'Thu hồi điểm sau hoàn tiền; phần thiếu thành nợ');
end $$;

-- Hours JSON: {"1":[{"start":"HH:MI","end":"HH:MI"}],...,"7":[...]}
-- Shipping JSON: {"max_km":number}; tiers [{"max_km":number,"fee":integer},...].
create function private.quote_core(
  p_items jsonb,p_fulfillment text,p_requested_at timestamptz,
  p_lat numeric,p_lng numeric,p_points integer,p_customer uuid)
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
  v_post bigint; v_balance integer; v_line_item jsonb;
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
    raise exception 'DELIVERY_LOCATION_NOT_VERIFIED' using errcode='22023';
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
  -- A duplicate product/variant in separate lines must be checked in aggregate too.
  if exists(select 1 from (
    select (x->>'product_id')::uuid product_id,(x->>'variant_id')::uuid variant_id,
      sum((x->>'quantity')::integer) qty from jsonb_array_elements(v_lines) x
      where x->'customization_data'='null'::jsonb
      group by 1,2) q join public.products p on p.id=q.product_id
    left join public.product_variants pv on pv.id=q.variant_id
    where q.qty>coalesce(pv.stock_quantity,p.stock_quantity))
    then raise exception 'INSUFFICIENT_STOCK'; end if;

  if p_fulfillment<>'counter' then
    if p_requested_at is null or p_requested_at<=now() then raise exception 'INVALID_REQUESTED_AT'; end if;
    if v_has_custom and p_requested_at<now()+interval '24 hours' then
      raise exception 'CUSTOM_CAKE_REQUIRES_24_HOURS'; end if;
    select * into v_settings from public.store_settings where store_key='main';
    if not found then raise exception 'STORE_NOT_CONFIGURED'; end if;
    v_hours:=case when p_fulfillment='pickup' then v_settings.pickup_hours
      else v_settings.delivery_hours end;
    if v_hours is null then raise exception 'STORE_HOURS_NOT_CONFIGURED'; end if;
    v_day:=to_char(p_requested_at at time zone 'Asia/Ho_Chi_Minh','ID');
    v_clock:=to_char(p_requested_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI');
    v_hour_ok:=false;
    for v_hour in select value from jsonb_array_elements(coalesce(v_hours->v_day,'[]'::jsonb)) loop
      if v_clock >= v_hour->>'start' and v_clock < v_hour->>'end' then v_hour_ok:=true; end if;
    end loop;
    if not v_hour_ok then raise exception 'OUTSIDE_STORE_HOURS'; end if;
    if p_fulfillment='delivery' then
      if p_lat is null or p_lng is null or v_settings.bakery_lat is null
        or v_settings.bakery_lng is null or v_settings.service_area is null
        or nullif(v_settings.service_area->>'max_km','') is null
        or v_settings.shipping_tiers is null
        then raise exception 'SHIPPING_NOT_CONFIGURED'; end if;
      v_distance:=6371*2*asin(sqrt(least(1,
        power(sin(radians((p_lat-v_settings.bakery_lat)/2)),2)+
        cos(radians(v_settings.bakery_lat))*cos(radians(p_lat))*
        power(sin(radians((p_lng-v_settings.bakery_lng)/2)),2))));
      if v_distance>(v_settings.service_area->>'max_km')::numeric then
        raise exception 'OUTSIDE_DELIVERY_AREA'; end if;
      v_fee:=null;
      for v_shipping_tier in select value from jsonb_array_elements(v_settings.shipping_tiers)
        order by (value->>'max_km')::numeric loop
        if v_distance<=(v_shipping_tier->>'max_km')::numeric then
          v_fee:=(v_shipping_tier->>'fee')::bigint; exit; end if;
      end loop;
      if v_fee is null or v_fee<0 then raise exception 'SHIPPING_NOT_CONFIGURED'; end if;
    end if;
  end if;

  -- Preserve the approved legacy ID ordering when mapped; otherwise internal UUID text.
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
  if p_points>floor(v_post*0.20/1000)::integer then raise exception 'POINTS_CAP_EXCEEDED'; end if;
  if p_points>0 then
    if p_customer is null then raise exception 'AUTH_REQUIRED_FOR_POINTS'; end if;
    select points into v_balance from public.loyalty_accounts where customer_id=p_customer;
    if v_balance is null or p_points>v_balance then raise exception 'INSUFFICIENT_POINTS'; end if;
  end if;
  return jsonb_build_object('items',v_lines,'subtotal',v_subtotal,
    'discount_amount',v_discount,'promotion_id',v_promotion,
    'points_used',p_points,'points_discount_amount',p_points*1000,
    'shipping_fee',v_fee,'total_amount',v_post-p_points*1000+v_fee,
    'has_custom_cake',v_has_custom);
end $$;

create function private.refresh_daily(p_day date,p_channel text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_total integer;v_completed integer;v_cancelled integer;v_eligible integer;
  v_gross bigint;v_discount bigint;v_points bigint;v_refund bigint;
  v_net bigint;v_ship bigint;v_ship_refund bigint;v_new integer;v_returning integer;
begin
  select count(*) into v_total from public.orders o
    where o.sales_channel=p_channel and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day;
  select count(*) into v_completed from public.orders o
    where o.sales_channel=p_channel and o.order_status='completed'
      and (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day;
  select count(*) into v_cancelled from public.orders o
    where o.sales_channel=p_channel and o.order_status='cancelled'
      and (o.cancelled_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day;
  select count(*),coalesce(sum(o.subtotal),0),coalesce(sum(o.discount_amount),0),
    coalesce(sum(o.points_discount_amount),0),
    coalesce(sum(least(o.subtotal-o.discount_amount-o.points_discount_amount,
      coalesce(r.product_amount,0))),0),
    coalesce(sum(greatest(0,o.subtotal-o.discount_amount-o.points_discount_amount
      -coalesce(r.product_amount,0))),0),
    coalesce(sum(o.shipping_fee),0),coalesce(sum(coalesce(r.shipping_amount,0)),0)
    into v_eligible,v_gross,v_discount,v_points,v_refund,v_net,v_ship,v_ship_refund
    from public.orders o join public.payments c on c.order_id=o.id
      and c.kind='charge' and c.status='paid'
    left join lateral (select sum(product_amount)::bigint product_amount,
      sum(shipping_amount)::bigint shipping_amount from public.payments
      where order_id=o.id and kind='refund' and status='refunded') r on true
    where o.sales_channel=p_channel and o.order_status='completed'
      and (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day;
  with ranked as (
    select o.customer_id,o.sales_channel,o.completed_at,
      row_number() over (partition by o.customer_id order by o.completed_at,o.id) rn
    from public.orders o join public.payments c on c.order_id=o.id
      and c.kind='charge' and c.status='paid'
    where o.order_status='completed' and o.customer_id is not null
  ), bucket as (
    select customer_id,min(rn) first_purchase_rank from ranked
      where sales_channel=p_channel
        and (completed_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day
      group by customer_id
  ) select count(*) filter (where first_purchase_rank=1),
      count(*) filter (where first_purchase_rank>1)
      into v_new,v_returning from bucket;
  insert into public.daily_analytics(day,sales_channel,total_orders,completed_orders,
    cancelled_orders,gross_product_sales,promotion_discount,points_redeemed_amount,
    product_refunded_amount,net_product_revenue,shipping_collected,shipping_refunded,
    average_product_order_value,new_customers,returning_customers,updated_at)
    values(p_day,p_channel,v_total,v_completed,v_cancelled,v_gross,v_discount,v_points,
      v_refund,v_net,v_ship,v_ship_refund,
      case when v_eligible=0 then 0 else floor(v_net::numeric/v_eligible)::bigint end,
      v_new,v_returning,now())
    on conflict(day,sales_channel) do update set
      total_orders=excluded.total_orders,completed_orders=excluded.completed_orders,
      cancelled_orders=excluded.cancelled_orders,gross_product_sales=excluded.gross_product_sales,
      promotion_discount=excluded.promotion_discount,
      points_redeemed_amount=excluded.points_redeemed_amount,
      product_refunded_amount=excluded.product_refunded_amount,
      net_product_revenue=excluded.net_product_revenue,
      shipping_collected=excluded.shipping_collected,
      shipping_refunded=excluded.shipping_refunded,
      average_product_order_value=excluded.average_product_order_value,
      new_customers=excluded.new_customers,returning_customers=excluded.returning_customers,
      updated_at=now();
end $$;
create function private.refresh_for_order(p_order uuid) returns void language plpgsql
security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_later record;
begin
  select * into v_order from public.orders where id=p_order;
  if not found then return; end if;
  perform private.refresh_daily((v_order.created_at at time zone 'Asia/Ho_Chi_Minh')::date,v_order.sales_channel);
  if v_order.completed_at is not null then
    perform private.refresh_daily((v_order.completed_at at time zone 'Asia/Ho_Chi_Minh')::date,v_order.sales_channel);
  end if;
  if v_order.cancelled_at is not null then
    perform private.refresh_daily((v_order.cancelled_at at time zone 'Asia/Ho_Chi_Minh')::date,v_order.sales_channel);
  end if;
  -- A late paid first purchase can reclassify later purchases across both channels.
  if v_order.customer_id is not null and v_order.completed_at is not null then
    for v_later in select distinct
        (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date as completed_day,
        o.sales_channel
      from public.orders o join public.payments p on p.order_id=o.id
        and p.kind='charge' and p.status='paid'
      where o.customer_id=v_order.customer_id and o.order_status='completed'
        and o.completed_at>=v_order.completed_at loop
      perform private.refresh_daily(v_later.completed_day,v_later.sales_channel);
    end loop;
  end if;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_role() to anon,authenticated;
grant execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid) to anon,authenticated;
