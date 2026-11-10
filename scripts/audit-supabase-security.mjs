import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { localDbPassword } from './local-db-password.mjs';

const client = new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
const expected = ['profiles','categories','products','product_variants','customization_categories','customization_options','promotions','orders','order_items','order_status_history','payments','loyalty_accounts','loyalty_transactions','wishlist_items','reviews','daily_analytics','audit_log','store_settings'];
try {
  await client.connect();
  const tables = (await client.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relname=any($1::text[])",[expected])).rows;
  if(tables.length!==18 || tables.some(row=>!row.relrowsecurity)) throw Error('RLS missing on expected application table');
  const sensitive=['profiles','products','product_variants','promotions','orders','order_items','order_status_history','payments','loyalty_accounts','loyalty_transactions','daily_analytics','audit_log','store_settings'];
  const grants=(await client.query("select relname,has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') as anon_write,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as auth_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relname=any($1::text[])",[sensitive])).rows;
  if(grants.length!==sensitive.length || grants.some(row=>row.anon_write || row.auth_write)) throw Error('Direct sensitive table write grant found');
  const functions=(await client.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by n.nspname,p.proname")).rows;
  const badDefiner=functions.filter(row=>row.prosecdef && (row.nspname!=='private' || !(row.proconfig||[]).some(value=>value==='search_path=""')));
  if(badDefiner.length) throw Error(`Exposed/unsafe SECURITY DEFINER: ${badDefiner.map(row=>row.proname).join(',')}`);
  const anonSensitive=functions.filter(row=>row.nspname==='public' && row.anon_execute && row.proname!=='quote_order');
  if(anonSensitive.length) throw Error(`Anonymous EXECUTE on exposed RPC: ${anonSensitive.map(row=>row.proname).join(',')}`);
  const owners=[...new Set(functions.filter(row=>row.prosecdef).map(row=>row.owner))];
  const exposed=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8').match(/^schemas\s*=\s*\[([^\]]+)\]/m)?.[1];
  if(!exposed || exposed.includes('private')) throw Error('Private schema is exposed by local API config');
  const anonPrivate=functions.filter(row=>row.nspname==='private' && row.anon_execute && !['active_role','quote_core'].includes(row.proname));
  if(anonPrivate.length) throw Error(`Anonymous EXECUTE on private helper: ${anonPrivate.map(row=>row.proname).join(',')}`);
  const migrations=(await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row=>row.version);
  if(migrations.length!==6) throw Error(`Expected 6 applied local migrations, found ${migrations.length}`);
  console.log(JSON.stringify({status:'PASS',rlsTables:tables.length,protectedTables:grants.length,functions:functions.length,definerFunctions:functions.filter(row=>row.prosecdef).length,definerOwners:owners,privateSchemaExposed:false,appliedMigrations:migrations}));
} finally {
  await client.end().catch(()=>{});
}
