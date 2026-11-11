import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../supabase/migrations/20261111000300_refund_rejection.sql');
const prior=read('../supabase/migrations/20261111000200_cancellation_refund_approval.sql');
const service=read('../site/js/services/operationsService.js');
const staff=read('../site/js/pages/staff-orders.js');
const admin=read('../site/js/pages/admin-orders.js');
const profile=read('../site/js/pages/profile.js');
const debtTest=read('../supabase/sql-tests/009_refund_point_debt.sql');
const cancelTest=read('../supabase/sql-tests/010_cancellation_flow.sql');

assert.match(prior,/create function public\.execute_demo_refund\(p_refund uuid,p_reference text\)/);
assert.match(prior,/cancel_request_status='pending'.*ORDER_CANCELLATION_PENDING/s);
assert.match(migration,/private\.require_actor\(array\['admin'\]\)/);
assert.match(migration,/v_refund\.status<>'pending' or v_refund\.refund_approved_at is not null/);
assert.match(migration,/update public\.payments set status='failed',refund_rejected_by=v_actor/);
assert.match(migration,/demo_refund_rejected/);
assert.match(migration,/grant execute on function public\.reject_demo_refund\(uuid,text\) to authenticated/);
assert.match(service,/export const rejectDemoRefund=/);
assert.match(staff,/rejectDemoRefund\(refund\.id,reason\.trim\(\)\)/);
assert.match(admin,/rejectDemoRefund\(refund\.id,reason\.trim\(\)\)/);
assert.match(profile,/balance\.point_debt/);
assert.match(profile,/item\.debt_delta/);
assert.match(debtTest,/public\.execute_demo_refund\(v_refund,'TEST-RECEIPT-350'\)/);
assert.match(debtTest,/v_points<>0 or v_debt<>300/);
assert.match(debtTest,/v_points<>0 or v_debt<>180/);
assert.match(debtTest,/v_points<>70 or v_debt<>0/);
assert.match(cancelTest,/public\.resolve_order_cancel_request\(v_request,false/);
assert.match(cancelTest,/public\.resolve_order_cancel_request\(v_request,true/);
assert.equal((migration.match(/create table\b/gi)||[]).length,0);
assert.match(debtTest,/^begin;[\s\S]*rollback;\s*$/);
assert.match(cancelTest,/^begin;[\s\S]*rollback;\s*$/);

console.log('PASS cancellation/refund structural contract; PostgreSQL/RPC integration NOT RUN');
