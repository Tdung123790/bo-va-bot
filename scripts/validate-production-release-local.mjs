import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { localDbPassword } from './local-db-password.mjs';
import { validateEnvironmentSeparation,validateProductionPromotions } from './production-release-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,'reference/production',name),'utf8'));
const environments=await read('release-environments.json');
const promotions=await read('promotion-approval.json');
const checks=[];
try{validateEnvironmentSeparation(environments);checks.push({gate:'environment_isolation',status:'PASS'});}catch(error){checks.push({gate:'environment_isolation',status:'BLOCKED',reason:error.message});}
const client=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
await client.connect();
try{
 const active=(await client.query("select id,source_id,name,description,discount_type,discount_value,min_order_value,max_discount,target_type,target_product_id,target_category_id,voucher_code,usage_limit,usage_per_customer,starts_at,ends_at from public.promotions where status='active'")).rows;
 try{validateProductionPromotions(active,promotions);checks.push({gate:'production_promotions',status:'PASS',active:active.length});}
 catch(error){checks.push({gate:'production_promotions',status:'BLOCKED',reason:error.message});}
 const testData=(await client.query("select (select count(*) from auth.users where email like '%@example.invalid')::integer as users,(select count(*) from public.products where source_id is null or source_id like 'TEST-%')::integer as products,(select count(*) from public.promotions where source_id like 'TEST-%' or name ~* '(^|[^[:alpha:]])(TEST|DEMO)([^[:alpha:]]|$)')::integer as promotions")).rows[0];
 checks.push({gate:'test_data_absent',status:Object.values(testData).every(count=>count===0)?'PASS':'BLOCKED',counts:testData});
 const counts=(await client.query("select (select count(*) from public.products where status='active')::integer as products,(select count(*) from public.customization_options where status='active')::integer as options,(select count(*) from public.store_settings where pickup_hours is not null)::integer as stores")).rows[0];
 checks.push({gate:'approved_catalog_and_store',status:counts.products>0&&counts.stores>0?'REQUIRES_MANIFEST_RECONCILIATION':'BLOCKED',counts});
}finally{await client.end();}
checks.push({gate:'payment_reconciliation',status:environments.production.paymentReconciliationApproved?'REQUIRES_MANUAL_EVIDENCE':'BLOCKED'});
checks.push({gate:'release_authorization',status:environments.production.releaseApproved?'REQUIRES_MANUAL_EVIDENCE':'BLOCKED'});
console.log(JSON.stringify({environment:'LOCAL_READ_ONLY_PRODUCTION_SIMULATION',checks},null,2));
if(checks.some(check=>check.status==='BLOCKED'))process.exitCode=2;
