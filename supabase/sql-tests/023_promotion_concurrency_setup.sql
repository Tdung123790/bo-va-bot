-- Disposable LOCAL fixture. Depends on 020 stock setup for the category/hours.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
 ('aaaaaaaa-ffff-4aaa-8aaa-aaaaaaaaaaa1',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-promo-race-a@example.invalid','test',now()),
 ('bbbbbbbb-ffff-4bbb-8bbb-bbbbbbbbbbb2',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sprint2-promo-race-b@example.invalid','test',now());
insert into public.products(id,category_id,name,base_price,stock_quantity)
values('99999999-aaaa-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888','Promo race item',100000,2);
insert into public.promotions(id,name,discount_type,discount_value,target_type,
  starts_at,ends_at,status,usage_limit,usage_per_customer)
values('44444444-aaaa-4444-8444-444444444444','Promo race',
  'FIXED',10000,'ALL',now()-interval '1 day',now()+interval '1 day','active',1,1);
