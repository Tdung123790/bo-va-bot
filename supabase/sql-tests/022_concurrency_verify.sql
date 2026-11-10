do $$
begin
  if (select stock_quantity from public.products
      where id='99999999-9999-4999-8999-999999999999')<>0
    then raise exception 'Concurrent stock did not settle at zero'; end if;
  if (select count(*) from public.orders
      where customer_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')<>1
    then raise exception 'Expected exactly one committed order'; end if;
  if (select count(*) from public.payments p join public.orders o on o.id=p.order_id
      where o.customer_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')<>1
    then raise exception 'Failed order left payment side effect'; end if;
  if (select count(*) from public.order_status_history h
      join public.orders o on o.id=h.order_id
      where o.customer_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')<>1
    then raise exception 'Failed order left history side effect'; end if;
  if (select count(*) from public.loyalty_transactions
      where customer_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')<>0
    or (select count(*) from public.audit_log
      where actor_user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')<>0
    then raise exception 'Failed order left loyalty/audit side effect'; end if;
end $$;
