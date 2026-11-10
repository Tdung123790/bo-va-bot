import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {distanceKm,normalizeAddress,shippingFee,validateProviderMatch} from '../supabase/functions/_shared/delivery.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const address='12 TEST Street, Ho Chi Minh City';
const pin={lat:10.8,lng:106.7};
const match={lat:10.8001,lng:106.7001,house_number:'12',road:'TEST Street',city:'Ho Chi Minh City',country_code:'VN',provider_ref:'TEST_PLACE_1'};
assert.equal(normalizeAddress('  12  TEST Street  '),'12 test street');
assert.ok(distanceKm(pin.lat,pin.lng,match.lat,match.lng)<0.1);
assert.equal(validateProviderMatch(address,pin,match).providerRef,'TEST_PLACE_1');
assert.equal(validateProviderMatch('12 TEST Street, Quận 1, Ho Chi Minh City',pin,match).providerRef,'TEST_PLACE_1');
assert.equal(validateProviderMatch('12/3 TEST Street, Ho Chi Minh City',pin,{...match,house_number:'12/3'}).providerRef,'TEST_PLACE_1');
for(const [badAddress,badPin,badMatch] of [
 ['999 Fake Road, Ho Chi Minh City',pin,match],
 ['13 TEST Street, Ho Chi Minh City',pin,match],
 ['12 TEST Street, Da Nang',pin,match],
 [address,{lat:10.9,lng:106.7},match],
 [address,pin,{...match,house_number:null}],
 [address,pin,{...match,road:'Other Street'}],
 [address,pin,{...match,country_code:'US'}],
 [address,pin,{...match,provider_ref:'bad address'}]
])assert.throws(()=>validateProviderMatch(badAddress,badPin,badMatch));
assert.equal(shippingFee(0),20000);
assert.equal(shippingFee(3),20000);
assert.equal(shippingFee(3.000001),30000);
assert.equal(shippingFee(5),30000);
assert.equal(shippingFee(5.000001),50000);
assert.equal(shippingFee(10),50000);
assert.throws(()=>shippingFee(10.000001));

const migration=readFileSync(resolve(root,'supabase/migrations/20261109000200_delivery_verified.sql'),'utf8');
assert.match(migration,/create table private\.delivery_proofs/);
assert.match(migration,/delivery_origin_approved_at is null/);
assert.match(migration,/p_request \?\| array\['delivery_lat','delivery_lng','shipping_fee'/);
assert.match(migration,/address_hash is distinct from\s*private\.delivery_address_hash\(v_proof\.address_salt,v_address\)/);
assert.match(migration,/request_id=p_request->>'request_id'/);
assert.match(migration,/used_order_id is null/);
assert.match(migration,/expires_at>now\(\)/);
assert.match(migration,/SAME_DAY_DELIVERY_CUTOFF/);
assert.match(migration,/REGULAR_CAKE_REQUIRES_2_HOURS/);
assert.match(migration,/CUSTOM_CAKE_REQUIRES_24_HOURS/);
assert.match(migration,/when v_distance<=3 then 20000 when v_distance<=5 then 30000 else 50000/);
assert.match(migration,/v_quote:=private\.quote_core\(v_items,v_fulfillment,v_requested,\s*null,null,v_points,v_customer,p_request\)/);
assert.equal((migration.match(/create table public\./g)||[]).length,0);

const environment={SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_ANON_KEY:'TEST_PUBLIC',SUPABASE_SERVICE_ROLE_KEY:'TEST_SERVICE',BOBOT_NOMINATIM_URL:'http://127.0.0.1:45678/search',BOBOT_NOMINATIM_CONTACT_URL:'https://example.test/bobot',BOBOT_DELIVERY_TEST_MODE:'isolated'};
let handler,providerState='valid',profileState='active',reservationState='valid',rpcCalls=0,geocoderCalls=0,reservationCalls=0;
const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
globalThis.Deno={env:{get:name=>environment[name]||''},serve:callback=>{handler=callback;}};
globalThis.fetch=async (input,options)=>{
 const url=String(input);
 if(url.includes('/auth/v1/user'))return Response.json({id:'TEST_USER'});
 if(url.includes('/rest/v1/profiles'))return Response.json([{id:'TEST_USER',role:'customer',status:profileState}]);
 if(url.includes('/rest/v1/store_settings'))return Response.json([{delivery_origin_approved_at:'2026-11-09T00:00:00Z',delivery_origin_approval_source:'TEST_APPROVED_FIXTURE'}]);
 if(url.includes('/rest/v1/rpc/reserve_nominatim_request')){reservationCalls++;return reservationState==='blocked'?Response.json({error:'rate'},{status:429}):Response.json({reserved:true});}
 if(url.includes('/search')){geocoderCalls++;assert.equal(new URL(url).searchParams.get('limit'),'1');assert.match(options.headers['User-Agent'],/BoBotDeliveryDemo/);return providerState==='error'?Response.json({error:'down'},{status:503}):Response.json([{lat:match.lat,lon:match.lng,address:{house_number:match.house_number,road:match.road,city:match.city,country_code:'vn'},osm_type:'way',osm_id:123}]);}
 if(url.includes('/rest/v1/rpc/issue_delivery_proof')){rpcCalls++;return Response.json({proof_id:'TEST_PROOF',expires_at:'2026-11-09T00:05:00Z'});}
 throw Error(`Unexpected mock URL: ${url}`);
};
try{
 await import('../supabase/functions/delivery-verify/index.js');
 const request=pinValue=>new Request('http://local/functions/v1/delivery-verify',{method:'POST',headers:{Authorization:'Bearer TEST.JWT','Content-Type':'application/json'},body:JSON.stringify({address,pin:pinValue,request_id:'TEST_REQUEST'})});
 let response=await handler(request(pin));assert.equal(response.status,200);assert.equal((await response.json()).proof_id,'TEST_PROOF');assert.equal(rpcCalls,1);
 assert.equal(geocoderCalls,1);
 assert.equal(reservationCalls,1);
 profileState='blocked';response=await handler(request(pin));assert.equal(response.status,403);assert.equal(rpcCalls,1);profileState='active';
 assert.equal(geocoderCalls,1);
 reservationState='blocked';response=await handler(request(pin));assert.equal(response.status,503);assert.equal(geocoderCalls,1);reservationState='valid';
 response=await handler(request({lat:10.9,lng:106.7}));assert.equal(response.status,400);assert.equal(rpcCalls,1);
 providerState='error';response=await handler(request(pin));assert.equal(response.status,503);assert.equal(rpcCalls,1);
 delete environment.BOBOT_NOMINATIM_CONTACT_URL;response=await handler(request(pin));assert.equal(response.status,503);assert.equal(rpcCalls,1);
}finally{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;}
console.log('PASS delivery mock Edge: identity, backend provider, bad pin, provider down, missing config; fees and SQL guard structure');
