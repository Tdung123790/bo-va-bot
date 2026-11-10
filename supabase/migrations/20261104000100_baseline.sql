-- Bơ & Bột: approved 18 application tables. Local-only migration; no seed.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  legacy_contact_id text unique,
  role text not null default 'customer' check (role in ('customer','staff','admin')),
  status text not null default 'active' check (status in ('active','blocked')),
  full_name text not null default '', phone text,
  date_of_birth date, gender text, avatar_url text,
  address_line text, ward text, district text, city text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(), source_id text unique,
  name text not null, slug text unique, description text, image_url text,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), source_id text unique,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null, slug text unique, description text, image_url text,
  base_price bigint check (base_price > 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  status text not null default 'active' check (status in ('active','inactive')),
  is_featured boolean not null default false, is_best_seller boolean not null default false,
  is_customizable boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), source_id text unique, source_legacy_id text unique,
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null, price_modifier bigint not null default 0,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customization_categories (
  id uuid primary key default gen_random_uuid(), source_key text not null unique,
  name text not null, pricing_role text not null unique
    check (pricing_role in ('size','flavor','cream','font','color')),
  display_order integer not null default 0, is_required boolean not null default true,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customization_options (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.customization_categories(id) on delete restrict,
  source_key text not null, name text not null,
  base_price bigint check (base_price >= 0), price_modifier bigint not null default 0,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (category_id, source_key)
);
create table public.promotions (
  id uuid primary key default gen_random_uuid(), source_id text unique,
  name text not null, description text,
  discount_type text not null check (discount_type in ('PERCENT','FIXED')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  min_order_value bigint not null default 0 check (min_order_value >= 0),
  max_discount bigint check (max_discount >= 0),
  target_type text not null check (target_type in ('ALL','PRODUCT','CATEGORY')),
  target_product_id uuid references public.products(id) on delete restrict,
  target_category_id uuid references public.categories(id) on delete restrict,
  voucher_code text, usage_limit integer check (usage_limit >= 0),
  usage_per_customer integer check (usage_per_customer >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'inactive' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((discount_type = 'PERCENT' and discount_value <= 100)
      or (discount_type = 'FIXED' and discount_value = trunc(discount_value))),
  check ((target_type = 'ALL' and target_product_id is null and target_category_id is null)
      or (target_type = 'PRODUCT' and target_product_id is not null and target_category_id is null)
      or (target_type = 'CATEGORY' and target_category_id is not null and target_product_id is null)),
  check (usage_limit is null or used_count <= usage_limit)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_code text not null unique,
  customer_id uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  sales_channel text not null check (sales_channel in ('online','offline')),
  fulfillment_type text not null check (fulfillment_type in ('delivery','pickup','counter')),
  client_request_id text not null check (length(client_request_id) between 1 and 200),
  request_payload jsonb not null,
  promotion_id uuid references public.promotions(id) on delete restrict,
  promotion_usage_claimed boolean not null default false,
  stock_released boolean not null default false,
  points_restored boolean not null default false,
  ship_recipient text, ship_phone text, ship_address text,
  ship_ward text, ship_district text, ship_city text,
  requested_at timestamptz, notes text,
  subtotal bigint not null check (subtotal >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  points_used integer not null default 0 check (points_used >= 0),
  points_discount_amount bigint not null default 0 check (points_discount_amount >= 0),
  shipping_fee bigint not null default 0 check (shipping_fee >= 0),
  total_amount bigint not null check (total_amount >= 0),
  order_status text not null default 'pending'
    check (order_status in ('pending','confirmed','preparing','shipping','completed','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  created_at timestamptz not null default now(), confirmed_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
  unique (sales_channel, created_by, client_request_id),
  check (discount_amount + points_discount_amount <= subtotal),
  check (total_amount = subtotal - discount_amount - points_discount_amount + shipping_fee),
  check ((sales_channel = 'online' and customer_id = created_by
    and fulfillment_type in ('delivery','pickup') and requested_at is not null)
    or (sales_channel = 'offline' and fulfillment_type = 'counter')),
  check (fulfillment_type <> 'delivery' or nullif(trim(ship_address),'') is not null)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  product_id uuid references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  product_name_snapshot text not null, variant_name_snapshot text,
  unit_price bigint not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  subtotal bigint not null check (subtotal = unit_price * quantity),
  customization_data jsonb, unique (order_id, line_no)
);
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status text, to_status text not null, changed_by uuid references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('customer','staff','admin','system')),
  note text, event_key text not null,
  created_at timestamptz not null default now(), unique (order_id, event_key),
  check (actor_type = 'system' or changed_by is not null)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null check (kind in ('charge','refund')),
  parent_payment_id uuid references public.payments(id) on delete restrict,
  payment_method text not null check (payment_method in ('cod','bank_transfer_demo','cash_demo')),
  status text not null check (status in ('unpaid','pending','paid','failed','refunded')),
  amount bigint not null check (amount >= 0),
  product_amount bigint not null check (product_amount >= 0),
  shipping_amount bigint not null check (shipping_amount >= 0),
  request_id text not null, transaction_code text,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), paid_at timestamptz, refunded_at timestamptz,
  unique (order_id, kind, request_id),
  check (amount = product_amount + shipping_amount),
  check ((kind = 'charge' and parent_payment_id is null and status <> 'refunded')
    or (kind = 'refund' and parent_payment_id is not null and status in ('pending','refunded','failed')))
);
create unique index payments_one_charge_per_order on public.payments(order_id) where kind = 'charge';
create table public.loyalty_accounts (
  customer_id uuid primary key references public.profiles(id) on delete restrict,
  points integer not null default 0 check (points >= 0),
  point_debt integer not null default 0 check (point_debt >= 0),
  total_earned integer not null default 0 check (total_earned >= 0),
  total_redeemed integer not null default 0 check (total_redeemed >= 0),
  tier text not null default 'BRONZE', updated_at timestamptz not null default now()
);
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  points integer not null, debt_delta integer not null default 0,
  gross_points integer not null default 0 check (gross_points >= 0),
  transaction_type text not null check (transaction_type in ('REDEEM','RESTORE','EARN','CLAWBACK')),
  event_key text not null,
  related_transaction_id uuid references public.loyalty_transactions(id) on delete restrict,
  description text, created_at timestamptz not null default now(),
  unique (customer_id, event_key)
);
create unique index loyalty_one_earn_per_order on public.loyalty_transactions(order_id)
  where transaction_type = 'EARN';
create unique index loyalty_one_clawback_per_order on public.loyalty_transactions(order_id)
  where transaction_type = 'CLAWBACK';
create table public.wishlist_items (
  customer_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(), primary key (customer_id, product_id)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), source_id text unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  content text not null, image_url text,
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (customer_id, order_id, product_id)
);
create table public.daily_analytics (
  day date not null, sales_channel text not null check (sales_channel in ('online','offline')),
  total_orders integer not null default 0 check (total_orders >= 0),
  completed_orders integer not null default 0 check (completed_orders >= 0),
  cancelled_orders integer not null default 0 check (cancelled_orders >= 0),
  gross_product_sales bigint not null default 0 check (gross_product_sales >= 0),
  promotion_discount bigint not null default 0 check (promotion_discount >= 0),
  points_redeemed_amount bigint not null default 0 check (points_redeemed_amount >= 0),
  product_refunded_amount bigint not null default 0 check (product_refunded_amount >= 0),
  net_product_revenue bigint not null default 0 check (net_product_revenue >= 0),
  shipping_collected bigint not null default 0 check (shipping_collected >= 0),
  shipping_refunded bigint not null default 0 check (shipping_refunded >= 0),
  average_product_order_value bigint not null default 0 check (average_product_order_value >= 0),
  new_customers integer not null default 0 check (new_customers >= 0),
  returning_customers integer not null default 0 check (returning_customers >= 0),
  updated_at timestamptz not null default now(), primary key (day, sales_channel)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('customer','staff','admin','system')),
  action text not null, entity_type text not null, entity_id uuid not null,
  request_id text, old_value jsonb, new_value jsonb,
  created_at timestamptz not null default now(),
  check (actor_type = 'system' or actor_user_id is not null)
);
create table public.store_settings (
  store_key text primary key check (store_key = 'main'),
  timezone text not null default 'Asia/Ho_Chi_Minh' check (timezone = 'Asia/Ho_Chi_Minh'),
  bakery_lat numeric(9,6), bakery_lng numeric(9,6),
  pickup_hours jsonb, delivery_hours jsonb,
  service_area jsonb, shipping_tiers jsonb,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check ((bakery_lat is null and bakery_lng is null)
    or (bakery_lat between -90 and 90 and bakery_lng between -180 and 180))
);

create index products_category_status on public.products(category_id,status);
create index variants_product_status on public.product_variants(product_id,status);
create index promotions_active_window on public.promotions(status,starts_at,ends_at);
create index orders_customer_created on public.orders(customer_id,created_at desc);
create index orders_channel_completed on public.orders(sales_channel,completed_at);
create index orders_status_created on public.orders(order_status,created_at);
create index order_items_product on public.order_items(product_id);
create index status_history_order_time on public.order_status_history(order_id,created_at desc);
create index payment_order_kind on public.payments(order_id,kind);
create index loyalty_tx_customer_time on public.loyalty_transactions(customer_id,created_at desc);
create index review_product_status on public.reviews(product_id,status);
create index audit_entity_time on public.audit_log(entity_type,entity_id,created_at desc);

-- RLS and grants: default deny all writes from Data API. Functions added in next migration.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

create function private.active_role() returns text language sql stable
security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
$$;
revoke all on function private.active_role() from public, anon, authenticated;
grant execute on function private.active_role() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customization_categories enable row level security;
alter table public.customization_options enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.reviews enable row level security;
alter table public.daily_analytics enable row level security;
alter table public.audit_log enable row level security;
alter table public.store_settings enable row level security;

grant select on public.categories, public.products, public.product_variants,
  public.customization_categories, public.customization_options,
  public.promotions to anon, authenticated;
-- Public reviews expose content, never customer/order identifiers.
grant select (id,source_id,product_id,rating,content,image_url,status,created_at,updated_at)
  on public.reviews to anon, authenticated;
grant select (store_key,timezone,bakery_lat,bakery_lng,pickup_hours,delivery_hours,
  service_area,shipping_tiers) on public.store_settings to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items,
  public.order_status_history, public.payments, public.loyalty_accounts,
  public.loyalty_transactions, public.wishlist_items, public.daily_analytics,
  public.audit_log to authenticated;
grant update (full_name,phone,date_of_birth,gender,avatar_url,address_line,ward,district,city)
  on public.profiles to authenticated;
grant insert (customer_id,product_id) on public.wishlist_items to authenticated;
grant delete on public.wishlist_items to authenticated;

create policy categories_public on public.categories for select to anon,authenticated
  using (status='active' or (select private.active_role())='admin');
create policy products_public on public.products for select to anon,authenticated
  using (status='active' or (select private.active_role()) in ('staff','admin'));
create policy variants_public on public.product_variants for select to anon,authenticated
  using (status='active' or (select private.active_role()) in ('staff','admin'));
create policy custom_categories_public on public.customization_categories for select to anon,authenticated
  using (status='active' or (select private.active_role())='admin');
create policy custom_options_public on public.customization_options for select to anon,authenticated
  using (status='active' or (select private.active_role())='admin');
create policy promotions_public on public.promotions for select to anon,authenticated
  using (status='active' or (select private.active_role())='admin');
create policy reviews_public on public.reviews for select to anon,authenticated
  using (status='published' or customer_id=(select auth.uid())
    or (select private.active_role())='admin');
create policy store_settings_public on public.store_settings for select to anon,authenticated using (true);
create policy profiles_select on public.profiles for select to authenticated
  using (id=(select auth.uid()) or (select private.active_role())='admin');
create policy profiles_update_self on public.profiles for update to authenticated
  using (id=(select auth.uid()) and status='active')
  with check (id=(select auth.uid()) and status='active');
create policy orders_select on public.orders for select to authenticated
  using (customer_id=(select auth.uid()) or (select private.active_role()) in ('staff','admin'));
create policy order_items_select on public.order_items for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id
    and (o.customer_id=(select auth.uid()) or (select private.active_role()) in ('staff','admin'))));
create policy order_history_select on public.order_status_history for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id
    and (o.customer_id=(select auth.uid()) or (select private.active_role()) in ('staff','admin'))));
create policy payments_select on public.payments for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id
    and (o.customer_id=(select auth.uid()) or (select private.active_role()) in ('staff','admin'))));
create policy loyalty_select on public.loyalty_accounts for select to authenticated
  using (customer_id=(select auth.uid()) or (select private.active_role())='admin');
create policy loyalty_transactions_select on public.loyalty_transactions for select to authenticated
  using (customer_id=(select auth.uid()) or (select private.active_role())='admin');
create policy wishlist_select on public.wishlist_items for select to authenticated
  using (customer_id=(select auth.uid()));
create policy wishlist_insert on public.wishlist_items for insert to authenticated
  with check (customer_id=(select auth.uid()) and (select private.active_role())='customer');
create policy wishlist_delete on public.wishlist_items for delete to authenticated
  using (customer_id=(select auth.uid()) and (select private.active_role())='customer');
create policy analytics_admin on public.daily_analytics for select to authenticated
  using ((select private.active_role())='admin');
create policy audit_admin on public.audit_log for select to authenticated
  using ((select private.active_role())='admin');
