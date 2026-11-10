import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { localDbPassword } from './local-db-password.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(file,args=[])=>spawnSync(process.execPath,[path.join(root,'scripts',file),...args],{cwd:root,encoding:'utf8',timeout:30000});
const reset=()=>spawnSync(process.platform==='win32'?'cmd.exe':'npx',process.platform==='win32'?['/d','/s','/c','npx.cmd supabase db reset --local --no-seed']:['supabase','db','reset','--local','--no-seed'],{cwd:root,encoding:'utf8',timeout:180000});
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bobot-approved-import-test-'));
let disposable=false,failure;
try{
 const empty=run('verify-supabase-greenfield.mjs');assert.equal(empty.status,0,empty.stderr);disposable=true;
 const catalog=JSON.parse(await fs.readFile(path.join(root,'reference/production/catalog-approval.json'),'utf8'));
 const options=JSON.parse(await fs.readFile(path.join(root,'reference/production/customization-approval.json'),'utf8'));
 catalog.environment='staging';options.environment='staging';
 const signature={approvalReference:'TEST local fixture only',approvedBy:'TEST runner',approvedAt:'2026-11-06T00:00:00Z'};
 Object.assign(catalog,signature);Object.assign(options,signature);
 const product=catalog.products.find(row=>row.reviewState==='PENDING_APPROVAL'&&!row.customizable);
 Object.assign(product,signature,{reviewState:'APPROVED',saleStatus:'active',approvedPriceVnd:123456,approvedOpeningStock:5,imageReachability:'OK',imageRightsEvidence:'TEST fixture only'});
 const catalogPath=path.join(dir,'catalog.TEST.json'),optionsPath=path.join(dir,'options.TEST.json');
 await fs.writeFile(catalogPath,JSON.stringify(catalog));await fs.writeFile(optionsPath,JSON.stringify(options));
 const base=['--catalog',catalogPath,'--options',optionsPath,'--test-fixture'];
 const preview=run('import-approved-catalog-local.mjs',base);assert.equal(preview.status,0,preview.stderr);
 const first=JSON.parse(preview.stdout);assert.equal(first.approvedProducts,1);assert.equal(first.diff[0].action,'INSERT');
 const apply=run('import-approved-catalog-local.mjs',[...base,'--apply','--confirm-preview',first.previewHash,'--operator','TEST runner']);
 assert.equal(apply.status,0,apply.stderr);assert.match(apply.stdout,/APPLIED_LOCAL_TEST_RECONCILED/);
 await db.connect();
 const inserted=(await db.query('select id,base_price,stock_quantity,status from public.products where source_id=$1',[product.sourceId])).rows[0];
 assert.equal(Number(inserted.base_price),123456);assert.equal(inserted.stock_quantity,5);assert.equal(inserted.status,'active');
 assert.equal((await db.query("select count(*)::integer as n from public.audit_log where action='catalog_approved_local'")).rows[0].n,1);
 await db.query('update public.products set stock_quantity=3 where id=$1',[inserted.id]);
 const stale=run('import-approved-catalog-local.mjs',[...base,'--apply','--confirm-preview',first.previewHash,'--operator','TEST runner']);
 assert.notEqual(stale.status,0);assert.match(stale.stderr,/Preview hash/);
 const previewAgain=run('import-approved-catalog-local.mjs',base);assert.equal(previewAgain.status,0,previewAgain.stderr);
 const second=JSON.parse(previewAgain.stdout);assert.equal(second.diff[0].action,'NO_CHANGE');
 const replay=run('import-approved-catalog-local.mjs',[...base,'--apply','--confirm-preview',second.previewHash,'--operator','TEST runner']);
 assert.equal(replay.status,0,replay.stderr);
 assert.equal((await db.query('select stock_quantity from public.products where id=$1',[inserted.id])).rows[0].stock_quantity,3);
 assert.equal((await db.query("select count(*)::integer as n from public.audit_log where action='catalog_approved_local'")).rows[0].n,1);
 console.log('PASS: TEST-only local approved importer preview/hash, source price override, audit, idempotent replay and operational stock preservation');
}catch(error){failure=error;console.error('FAIL:',error.stack||error.message);}finally{
 await db.end().catch(()=>{});
 await fs.rm(dir,{recursive:true,force:true});
 if(disposable){const clean=reset();if(clean.status===0)console.log('PASS: local TEST import fixture removed by database reset');else{console.error('BLOCKED fixture cleanup:',clean.stderr||clean.stdout);failure||=Error('TEST cleanup failed');}}
}
if(failure)process.exitCode=1;
