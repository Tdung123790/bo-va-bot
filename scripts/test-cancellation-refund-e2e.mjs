import {Client} from 'pg';
import {readFile} from 'node:fs/promises';

const password=process.env.BOBOT_LOCAL_DB_PASSWORD;
if(!password){
 console.log('BLOCKED: BOBOT_LOCAL_DB_PASSWORD is not set for local PostgreSQL.');
 process.exit(2);
}

const client=new Client({host:'127.0.0.1',port:54322,user:'postgres',password,database:'postgres',connectionTimeoutMillis:5000});
client.on('notice',notice=>{if(notice.message?.startsWith('EVIDENCE '))console.log(notice.message);});
const files=['010_cancellation_flow.sql','009_refund_point_debt.sql'];
let currentFile='preflight';
try{
 await client.connect();
 const {rows}=await client.query(`select version from supabase_migrations.schema_migrations where version = any($1::text[])`,[['20261111000200','20261111000300']]);
 if(rows.length!==2)throw Error('REQUIRED_MIGRATION_NOT_APPLIED');
 const signatures=await client.query(`select
   to_regprocedure('public.submit_order_cancel_request(uuid,text)') is not null as cancel_request,
   to_regprocedure('public.resolve_order_cancel_request(uuid,boolean,text,boolean)') is not null as cancel_resolve,
   to_regprocedure('public.execute_demo_refund(uuid,text)') is not null as refund_execute,
   to_regprocedure('public.reject_demo_refund(uuid,text)') is not null as refund_reject,
   has_function_privilege('authenticated','public.execute_demo_refund(uuid,text)','execute') as refund_execute_granted,
   not has_function_privilege('authenticated','public.execute_demo_refund(uuid)','execute') as old_refund_execute_revoked`);
 if(Object.values(signatures.rows[0]).some(value=>value!==true))throw Error('RPC_SIGNATURE_OR_GRANT_MISMATCH');
 for(const file of files){
  currentFile=file;
  const sql=await readFile(new URL(`../supabase/sql-tests/${file}`,import.meta.url),'utf8');
  await client.query(sql);
  console.log(`PASS: ${file} on local PostgreSQL; transaction rolled back.`);
 }
}catch(error){
 const blocked=['REQUIRED_MIGRATION_NOT_APPLIED','RPC_SIGNATURE_OR_GRANT_MISMATCH'].includes(error.message)||['ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(error.code);
 const code=error.code||(['REQUIRED_MIGRATION_NOT_APPLIED','RPC_SIGNATURE_OR_GRANT_MISMATCH'].includes(error.message)?error.message:'LOCAL_POSTGRES_UNAVAILABLE');
 console.error(`${blocked?'BLOCKED':'FAIL'}: ${currentFile} ${code}${error.code?` ${error.message}`:''}`);
 process.exitCode=1;
}finally{
 await client.end().catch(()=>{});
}
