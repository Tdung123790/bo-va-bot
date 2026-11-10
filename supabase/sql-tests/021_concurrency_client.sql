select public.create_online_order(jsonb_build_object(
  'request_id',current_setting('bobot.test_request_id'),
  'fulfillment_type','pickup','payment_method','cod',
  'requested_at',((date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh')+interval '3 days 12 hours') at time zone 'Asia/Ho_Chi_Minh'),'recipient_name','Race fixture',
  'recipient_phone','0123456789','items',jsonb_build_array(jsonb_build_object(
    'product_id','99999999-9999-4999-8999-999999999999','quantity',1))));
