-- Destructive fixture for a disposable LOCAL database after supabase db reset.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-race@example.invalid','test',now());
insert into public.categories(id,name)
values('88888888-8888-4888-8888-888888888888','Concurrency fixture');
insert into public.products(id,category_id,name,base_price,stock_quantity)
values('99999999-9999-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888','One in stock',100000,1);
insert into public.store_settings(store_key,pickup_hours)
values('main','{"1":[{"start":"00:00","end":"24:00"}],
  "2":[{"start":"00:00","end":"24:00"}],
  "3":[{"start":"00:00","end":"24:00"}],
  "4":[{"start":"00:00","end":"24:00"}],
  "5":[{"start":"00:00","end":"24:00"}],
  "6":[{"start":"00:00","end":"24:00"}],
  "7":[{"start":"00:00","end":"24:00"}]}'::jsonb);
