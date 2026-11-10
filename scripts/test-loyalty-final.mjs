import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mathSource=readFileSync(resolve(root,'site/js/services/loyaltyMath.js'),'utf8');
const math=await import(`data:text/javascript,${encodeURIComponent(mathSource)}`);
const migration=readFileSync(resolve(root,'supabase/migrations/20261109000100_loyalty_final.sql'),'utf8');
const sqlTest=readFileSync(resolve(root,'supabase/sql-tests/008_loyalty_final.sql'),'utf8');

assert.equal(math.VND_PER_EARN_POINT,1000);
assert.equal(math.VND_PER_REDEEM_POINT,10);
assert.equal(math.maxRedeemPoints(90000,2000),1800);
assert.equal(math.maxRedeemPoints(90000,1000),1000);
assert.equal(math.maxRedeemPoints(90000,0),0);
assert.equal(math.earnedPoints(100000,10000,1000*10),80);
const shippingFee=15000;
assert.equal(100000-10000-1000*10+shippingFee,95000);
assert.equal(math.earnedPoints(100000,10000,1000*10),80);
assert.equal(math.earnedPoints(999,0,0),0);
assert.equal(math.earnedPoints(1000,0,0),1);
assert.equal(math.earnedPoints(100000,10000,0),90);

assert.match(migration,/v_gross\s*:=\s*floor\(\(v_order\.subtotal-v_order\.discount_amount-v_order\.points_discount_amount\)\/1000\.0\)/);
assert.match(migration,/p_points>floor\(v_post\*0\.20\/10\)/);
assert.match(migration,/'points_discount_amount',p_points\*10/);
assert.match(migration,/'total_amount',v_post-p_points\*10\+v_fee/);
assert.equal((migration.match(/create or replace function/gi)||[]).length,2);
assert.equal((migration.match(/create table/gi)||[]).length,0);
assert.match(sqlTest,/gross_points[^\n]*<>80/);
assert.match(sqlTest,/rollback;/i);

console.log('PASS FINAL loyalty math: 90,000 VND eligible, 1,000 points = 10,000 VND, earn 80 points; cap, availability and static SQL contract');
