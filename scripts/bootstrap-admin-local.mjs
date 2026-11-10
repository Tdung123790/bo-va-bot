import assert from 'node:assert/strict';
import {Client} from 'pg';
import {localDbPassword} from './local-db-password.mjs';

const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const userId=value('--user-id');
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId||''))throw Error('Cần --user-id là UUID của tài khoản đã tạo qua Supabase Auth local.');
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query('begin');
 await db.query('select pg_advisory_xact_lock($1::bigint)',[4000044001]);
 const user=(await db.query(`select u.id,u.email_confirmed_at,p.role,p.status from auth.users u
   join public.profiles p on p.id=u.id where u.id=$1 for update of p`,[userId])).rows[0];
 if(!user)throw Error('Không tìm thấy tài khoản Auth và profile tương ứng.');
 if(!user.email_confirmed_at)throw Error('Email của tài khoản chưa được xác nhận.');
 if(user.role!=='customer'||user.status!=='active')throw Error('Chỉ bootstrap Customer active đã xác minh.');
 const existing=Number((await db.query("select count(*)::integer as n from public.profiles where role='admin' and status='active'")).rows[0].n);
 if(existing)throw Error('Đã có Admin active; dùng RPC admin_assign_role của Admin hiện hữu.');
 if(!flag('--apply')){
  console.log(`DRY RUN: first Admin candidate ${userId}; Auth email confirmed; no write.`);
  await db.query('rollback');
 }else{
  assert.equal(value('--confirm-id'),userId,'--confirm-id phải trùng chính xác --user-id');
  const operator=String(value('--operator')||'').trim(),reason=String(value('--reason')||'').trim();
  if(operator.length<3||reason.length<8)throw Error('Cần --operator và --reason đủ rõ để ghi audit.');
  await db.query("update public.profiles set role='admin',updated_at=now() where id=$1",[userId]);
  await db.query(`insert into public.audit_log(actor_type,action,entity_type,entity_id,request_id,old_value,new_value)
    values('system','first_admin_bootstrap','profile',$1,$2,$3,$4)`,
   [userId,`bootstrap:${userId}`,{role:'customer',status:'active'},{role:'admin',status:'active',operator,reason}]);
  await db.query('commit');
  console.log(`PASS: first Admin granted locally to ${userId}; system audit written.`);
 }
}catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{await db.end();}
