create function private.admin_dashboard_core(p_from date,p_to date,p_channel text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_daily jsonb;v_top jsonb;v_summary jsonb;v_customers jsonb;
  v_paid_orders integer;
begin
  perform private.require_actor(array['admin']);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366
    or p_channel is null or p_channel not in ('all','online','offline') then
    raise exception 'INVALID_DASHBOARD_FILTER';
  end if;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.day,d.sales_channel),'[]'::jsonb)
    into v_daily from public.daily_analytics d
    where d.day between p_from and p_to
      and (p_channel='all' or d.sales_channel=p_channel);
  select jsonb_build_object(
      'online_revenue',coalesce(sum(d.net_product_revenue) filter (where d.sales_channel='online'),0),
      'offline_revenue',coalesce(sum(d.net_product_revenue) filter (where d.sales_channel='offline'),0),
      'product_revenue',coalesce(sum(d.net_product_revenue),0),
      'shipping_collected',coalesce(sum(d.shipping_collected),0),
      'shipping_refunded',coalesce(sum(d.shipping_refunded),0),
      'total_orders',coalesce(sum(d.total_orders),0),
      'completed_orders',coalesce(sum(d.completed_orders),0),
      'cancelled_orders',coalesce(sum(d.cancelled_orders),0))
    into v_summary from public.daily_analytics d
    where d.day between p_from and p_to
      and (p_channel='all' or d.sales_channel=p_channel);
  with ranked as (
    select o.customer_id,o.sales_channel,o.completed_at,o.id,
      row_number() over(partition by o.customer_id order by o.completed_at,o.id) as purchase_rank
    from public.orders o join public.payments c on c.order_id=o.id
      and c.kind='charge' and c.status='paid'
    where o.order_status='completed' and o.customer_id is not null
  ), period_customers as (
    select customer_id,min(purchase_rank) first_rank from ranked
    where (completed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_channel='all' or sales_channel=p_channel)
    group by customer_id
  ) select jsonb_build_object('unique_customers',count(*),
      'new_customers',count(*) filter (where first_rank=1),
      'returning_customers',count(*) filter (where first_rank>1))
    into v_customers from period_customers;
  select count(*) into v_paid_orders from public.orders o
    join public.payments c on c.order_id=o.id and c.kind='charge' and c.status='paid'
    where o.order_status='completed'
      and (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_channel='all' or o.sales_channel=p_channel);
  v_summary:=v_summary||v_customers||jsonb_build_object(
    'paid_completed_orders',v_paid_orders,
    'average_product_order_value',case when v_paid_orders=0 then 0
      else floor((v_summary->>'product_revenue')::numeric/v_paid_orders)::bigint end);
  with paid_orders as (
    select o.id,o.subtotal,
      greatest(0,o.subtotal-o.discount_amount-o.points_discount_amount
        -coalesce((select sum(p.product_amount) from public.payments p
          where p.order_id=o.id and p.kind='refund' and p.status='refunded'),0)) as net
    from public.orders o join public.payments c on c.order_id=o.id
      and c.kind='charge' and c.status='paid'
    where o.order_status='completed'
      and (o.completed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_channel='all' or o.sales_channel=p_channel)
  ), basis as (
    select i.order_id,i.product_id,i.product_name_snapshot,i.quantity,i.line_no,o.net,
      case when o.subtotal=0 then 0
        else floor(o.net::numeric*i.subtotal/o.subtotal)::bigint end as base
    from paid_orders o join public.order_items i on i.order_id=o.id
  ), allocated as (
    select b.*,
      b.base+case when row_number() over(partition by b.order_id order by b.line_no)
        <= b.net-sum(b.base) over(partition by b.order_id) then 1 else 0 end as net_line
    from basis b
  ), products as (
    select product_id,max(product_name_snapshot) name,
      sum(case when net>0 then quantity else 0 end) quantity,
      sum(net_line) product_revenue
    from allocated group by product_id
  ) select coalesce(jsonb_agg(to_jsonb(t) order by t.product_revenue desc,t.quantity desc,t.name),'[]'::jsonb)
    into v_top from (
      select product_id,name,quantity,product_revenue from products
      where quantity>0 order by product_revenue desc,quantity desc,name limit 10
    ) t;
  return jsonb_build_object('summary',v_summary,'daily',v_daily,'top_products',v_top);
end $$;

create function public.admin_dashboard(p_from date,p_to date,p_channel text default 'all')
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_dashboard_core(p_from,p_to,p_channel)
$$;

revoke all on function private.admin_dashboard_core(date,date,text) from public,anon,authenticated;
revoke all on function public.admin_dashboard(date,date,text) from public,anon,authenticated;
grant execute on function private.admin_dashboard_core(date,date,text) to authenticated;
grant execute on function public.admin_dashboard(date,date,text) to authenticated;
