create table public.customer_carts (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint customer_carts_items_valid check (
    jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 100
    and pg_column_size(items) <= 262144
  )
);

alter table public.customer_carts enable row level security;

create policy customer_carts_select_own on public.customer_carts
for select to authenticated
using (
  customer_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = customer_id and p.role = 'customer' and p.status = 'active'
  )
);

revoke all on public.customer_carts from public, anon, authenticated;
grant select on public.customer_carts to authenticated;

create function public.customer_cart_mutate(
  p_action text,
  p_item jsonb default null,
  p_key text default null,
  p_quantity integer default null,
  p_items jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_rows jsonb;
  v_row jsonb;
  v_found jsonb;
  v_key text;
  v_qty integer;
  v_existing_qty integer;
  v_version bigint;
begin
  v_actor := private.require_actor(array['customer']);
  if p_action is null or p_action not in ('add','set','remove','clear','import') then
    raise exception 'CART_ACTION_INVALID';
  end if;
  insert into public.customer_carts(customer_id) values (v_actor)
  on conflict(customer_id) do nothing;
  select items into v_rows from public.customer_carts
    where customer_id = v_actor for update;

  if p_action = 'add' then
    if p_item is null or jsonb_typeof(p_item) <> 'object' then
      raise exception 'CART_ITEM_INVALID';
    end if;
    v_key := p_item->>'key';
    if v_key is null or length(v_key) < 1 or length(v_key) > 300
       or nullif(p_item->>'productId','') is null
       or nullif(p_item->>'quantity','') is null
       or (p_item->>'quantity') !~ '^[0-9]{1,2}$'
       or pg_column_size(p_item) > 32768 then
      raise exception 'CART_ITEM_INVALID';
    end if;
    v_qty := (p_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'CART_QUANTITY_INVALID'; end if;
    select value into v_found from jsonb_array_elements(v_rows) value
      where value->>'key' = v_key limit 1;
    if v_found is null then
      v_rows := v_rows || jsonb_build_array(p_item);
    else
      v_existing_qty := (v_found->>'quantity')::integer;
      if v_existing_qty + v_qty > 99 then raise exception 'CART_QUANTITY_INVALID'; end if;
      select coalesce(jsonb_agg(
        case when value->>'key' = v_key then
          jsonb_set(p_item,'{quantity}',to_jsonb(v_existing_qty+v_qty),true)
        else value end order by ord), '[]'::jsonb)
      into v_rows from jsonb_array_elements(v_rows) with ordinality as t(value,ord);
    end if;
  elsif p_action = 'set' then
    if p_key is null or length(p_key) < 1 or length(p_key) > 300
       or p_quantity is null or p_quantity < 1 or p_quantity > 99 then
      raise exception 'CART_QUANTITY_INVALID';
    end if;
    if not exists(select 1 from jsonb_array_elements(v_rows) r where r->>'key' = p_key) then
      raise exception 'CART_ITEM_NOT_FOUND';
    end if;
    select coalesce(jsonb_agg(
      case when value->>'key' = p_key then
        jsonb_set(value,'{quantity}',to_jsonb(p_quantity),true)
      else value end order by ord),'[]'::jsonb)
    into v_rows from jsonb_array_elements(v_rows) with ordinality as t(value,ord);
  elsif p_action = 'remove' then
    if p_key is null or length(p_key) < 1 or length(p_key) > 300 then
      raise exception 'CART_ITEM_INVALID';
    end if;
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb)
    into v_rows from jsonb_array_elements(v_rows) with ordinality as t(value,ord)
    where value->>'key' is distinct from p_key;
  elsif p_action = 'clear' then
    v_rows := '[]'::jsonb;
  elsif p_action = 'import' then
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) > 100 then raise exception 'CART_IMPORT_INVALID'; end if;
    for v_row in select value from jsonb_array_elements(p_items) value loop
      if jsonb_typeof(v_row) <> 'object'
         or nullif(v_row->>'key','') is null
         or length(v_row->>'key') > 300
         or nullif(v_row->>'productId','') is null
         or nullif(v_row->>'quantity','') is null
         or (v_row->>'quantity') !~ '^[0-9]{1,2}$'
         or pg_column_size(v_row) > 32768 then
        raise exception 'CART_IMPORT_INVALID';
      end if;
      v_qty := (v_row->>'quantity')::integer;
      if v_qty < 1 or v_qty > 99 then raise exception 'CART_IMPORT_INVALID'; end if;
      v_key := v_row->>'key';
      select value into v_found from jsonb_array_elements(v_rows) value
        where value->>'key' = v_key limit 1;
      if v_found is null then
        v_rows := v_rows || jsonb_build_array(v_row);
      else
        v_existing_qty := (v_found->>'quantity')::integer;
        select coalesce(jsonb_agg(
          case when value->>'key' = v_key then
            jsonb_set(value,'{quantity}',to_jsonb(least(99,v_existing_qty+v_qty)),true)
          else value end order by ord),'[]'::jsonb)
        into v_rows from jsonb_array_elements(v_rows) with ordinality as t(value,ord);
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_rows) > 100 or pg_column_size(v_rows) > 262144 then
    raise exception 'CART_CAPACITY_EXCEEDED';
  end if;
  update public.customer_carts
    set items = v_rows, version = version+1, updated_at = now()
    where customer_id = v_actor
    returning version into v_version;
  return jsonb_build_object('items',v_rows,'version',v_version);
end $$;

revoke all on function public.customer_cart_mutate(text,jsonb,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.customer_cart_mutate(text,jsonb,text,integer,jsonb) to authenticated;

DO $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_carts') then
    alter publication supabase_realtime add table public.customer_carts;
  end if;
end $$;

notify pgrst, 'reload schema';
