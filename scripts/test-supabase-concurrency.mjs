import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {spawnSync} from 'node:child_process';
import {localDbPassword} from './local-db-password.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSql = (name) => fs.readFile(
  path.join(root, 'supabase', 'sql-tests', name), 'utf8');
const database = {
  host: '127.0.0.1',
  port: 54322,
  user: 'postgres',
  password: localDbPassword(),
  database: 'postgres',
  connectionTimeoutMillis: 5000,
};

async function runStandalone(name) {
  const client = new Client(database);
  try {
    await client.connect();
    return await client.query(await readSql(name));
  } finally {
    await client.end().catch(() => {});
  }
}

const preflight=spawnSync(process.execPath,[path.join(root,'scripts','verify-supabase-greenfield.mjs')],{cwd:root,encoding:'utf8'});
if(preflight.status!==0)throw Error('LOCAL_DB_NOT_EMPTY_TEST_ABORTED');
try{
await runStandalone('020_concurrency_setup.sql');
const clients = [new Client(database), new Client(database)];
const outcomes = [];
try {
  await Promise.all(clients.map((client) => client.connect()));
  await Promise.all(clients.map(async (client, index) => {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true)",
      ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5']);
    await client.query(
      "select set_config('bobot.test_request_id',$1,true)",
      [index === 0 ? 'race-a' : 'race-b']);
  }));
  const sql = await readSql('021_concurrency_client.sql');
  // Commit each completed transaction immediately so the waiting session can
  // acquire the advisory lock; waiting for both queries first deadlocks the runner.
  const results = await Promise.all(clients.map(async (client) => {
    try {
      await client.query(sql);
      await client.query('commit');
      return 'committed';
    } catch (error) {
      await client.query('rollback');
      return `rolled back: ${error.code ?? 'unknown'}`;
    }
  }));
  outcomes.push(...results);
} finally {
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
}
if (outcomes.filter((value) => value === 'committed').length !== 1) {
  throw new Error(`Expected one committed order, got ${outcomes.join(', ')}`);
}
await runStandalone('022_concurrency_verify.sql');
console.log(`PASS: stock=1 concurrent requests: ${outcomes.join(', ')}; stock/payment/history verified`);

await runStandalone('023_promotion_concurrency_setup.sql');
const promoClients = [new Client(database), new Client(database)];
const promoOutcomes = [];
try {
  await Promise.all(promoClients.map((client) => client.connect()));
  await Promise.all(promoClients.map(async (client, index) => {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      index === 0 ? 'aaaaaaaa-ffff-4aaa-8aaa-aaaaaaaaaaa1'
        : 'bbbbbbbb-ffff-4bbb-8bbb-bbbbbbbbbbb2',
    ]);
    await client.query("select set_config('bobot.test_request_id',$1,true)", [
      index === 0 ? 'promo-a' : 'promo-b',
    ]);
  }));
  const sql = await readSql('024_promotion_concurrency_client.sql');
  promoOutcomes.push(...await Promise.all(promoClients.map(async (client) => {
    try {
      await client.query(sql);
      await client.query('commit');
      return 'committed';
    } catch (error) {
      await client.query('rollback');
      return `rolled back: ${error.code ?? 'unknown'} ${error.message}`;
    }
  })));
} finally {
  await Promise.all(promoClients.map((client) => client.end().catch(() => {})));
}
if (promoOutcomes.some((value) => value !== 'committed')) {
  throw new Error(`Both independent promo requests should commit: ${promoOutcomes.join(', ')}`);
}
await runStandalone('025_promotion_concurrency_verify.sql');
console.log('PASS: concurrent promotion limit=1 chose one discount; E-01 cancel/retry released and reused quota once');
}finally{
 const cleanup=spawnSync(process.execPath,[path.join(root,'scripts','cleanup-supabase-concurrency.mjs')],{cwd:root,encoding:'utf8'});
 if(cleanup.status!==0)throw Error(`CONCURRENCY_TEST_FIXTURE_CLEANUP_FAILED: ${cleanup.stderr||cleanup.stdout}`);
 console.log(cleanup.stdout.trim());
}
