create function private.my_reviews_core() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_rows jsonb;
begin
  v_actor:=private.require_actor(array['customer']);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'order_code',o.order_code,'product_name',i.product_name_snapshot,
    'rating',r.rating,'content',r.content,'status',r.status,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_rows
  from public.reviews r
  join public.orders o on o.id=r.order_id
  join public.order_items i on i.id=r.order_item_id
  where r.customer_id=v_actor;
  return v_rows;
end $$;

create function public.my_reviews() returns jsonb
language sql security invoker set search_path='' as $$
  select private.my_reviews_core()
$$;

revoke all on function private.my_reviews_core() from public,anon,authenticated;
revoke all on function public.my_reviews() from public,anon,authenticated;
grant execute on function private.my_reviews_core() to authenticated;
grant execute on function public.my_reviews() to authenticated;
