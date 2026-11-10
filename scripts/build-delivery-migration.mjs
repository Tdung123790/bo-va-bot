import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const loyalty=readFileSync(resolve(root,'supabase/migrations/20261109000100_loyalty_final.sql'),'utf8');
const orders=readFileSync(resolve(root,'supabase/migrations/20261104000300_order_rpc.sql'),'utf8');
function extract(text,head){const start=text.indexOf(head);if(start<0)throw Error(`Missing ${head}`);const end=text.indexOf('end $$;',start);if(end<0)throw Error(`Missing end ${head}`);return text.slice(start,end+7);}
function one(text,before,after){const first=text.indexOf(before);if(first<0||text.indexOf(before,first+1)>=0)throw Error(`Replacement not unique: ${before.slice(0,70)}`);return text.replace(before,after);}

let quote=extract(loyalty,'create or replace function private.quote_core(');
quote=one(quote,'create or replace function private.quote_core(','create function private.quote_core(');
quote=one(quote,'p_lat numeric,p_lng numeric,p_points integer,p_customer uuid)','p_lat numeric,p_lng numeric,p_points integer,p_customer uuid,p_request jsonb)');
quote=one(quote,'v_post bigint; v_balance integer; v_line_item jsonb;','v_post bigint; v_balance integer; v_line_item jsonb; v_proof private.delivery_proofs%rowtype;');
quote=one(quote,"  if p_fulfillment='delivery' then\n    raise exception 'DELIVERY_LOCATION_NOT_VERIFIED' using errcode='22023';\n  end if;", "  if p_fulfillment='delivery' then\n    v_proof:=private.require_delivery_proof(p_request,p_customer);\n    p_lat:=v_proof.latitude;p_lng:=v_proof.longitude;\n  end if;");
const timeStart=quote.indexOf("    if p_requested_at is null or p_requested_at<=now() then");
const timeEnd=quote.indexOf('\n  end if;\n\n  for v_promo',timeStart);
if(timeStart<0||timeEnd<0)throw Error('Quote time block missing');
quote=quote.slice(0,timeStart)+`    perform private.delivery_window(p_requested_at,v_has_custom,p_fulfillment,now());
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
    end if;`+quote.slice(timeEnd);
quote=one(quote,"'shipping_fee',v_fee,'total_amount',v_post-p_points*10+v_fee,","'shipping_fee',v_fee,'shipping_distance_km',v_distance,\n    'total_amount',v_post-p_points*10+v_fee,");

let place=extract(orders,'create function private.place_order(');
place=one(place,'create function private.place_order(','create or replace function private.place_order(');
place=one(place,"  v_quote:=private.quote_core(v_items,v_fulfillment,v_requested,\n    (p_request->>'delivery_lat')::numeric,(p_request->>'delivery_lng')::numeric,\n    v_points,v_customer);", "  v_quote:=private.quote_core(v_items,v_fulfillment,v_requested,\n    null,null,v_points,v_customer,p_request);");
place=one(place,"  for v_line in select value from jsonb_array_elements(v_quote->'items') loop",`  if v_fulfillment='delivery' then
    update private.delivery_proofs set used_order_id=v_id
      where id=(p_request->>'delivery_proof_id')::uuid and used_order_id is null
        and expires_at>now();
    if not found then raise exception 'DELIVERY_PROOF_USED_OR_EXPIRED'; end if;
    insert into public.audit_log(actor_user_id,actor_type,action,entity_type,entity_id,request_id,new_value)
      values(v_actor,'customer','delivery_proof_consumed','order',v_id,v_request_id,
        jsonb_build_object('proof_id',p_request->>'delivery_proof_id'));
  end if;
  for v_line in select value from jsonb_array_elements(v_quote->'items') loop`);

const preamble=`alter table public.store_settings add column if not exists delivery_origin_approved_at timestamptz;
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

`;
const wrappers=`create or replace function public.quote_order(p_request jsonb) returns jsonb language sql
security invoker set search_path = '' as $$
  select private.quote_core(p_request->'items',p_request->>'fulfillment_type',
    (p_request->>'requested_at')::timestamptz,null,null,
    coalesce((p_request->>'points_used')::integer,0),
    case when private.active_role()='customer' then auth.uid() else null end,p_request)
$$;
revoke all on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid,jsonb) to anon,authenticated;
revoke execute on function private.quote_core(jsonb,text,timestamptz,numeric,numeric,integer,uuid) from anon,authenticated;
`;
writeFileSync(resolve(root,'supabase/migrations/20261109000200_delivery_verified.sql'),preamble+quote+'\n\n'+place+'\n\n'+wrappers);
console.log('Generated additive delivery migration');
