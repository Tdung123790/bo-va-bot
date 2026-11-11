import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {localDbPassword} from './local-db-password.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = {
  host: '127.0.0.1',
  port: 54322,
  user: 'postgres',
  password: localDbPassword(),
  database: 'postgres',
  connectionTimeoutMillis: 5000,
};

const files = [
  '001_security_and_orders.sql',
  '003_shipping_kpi.sql',
  '004_customer_classification.sql',
  '005_unverified_delivery.sql',
  '006_admin_dashboard.sql',
  '007_vnpay_gateway.sql',
  '008_loyalty_final.sql',
];
const requested = process.argv.slice(2);
if (requested.some((name) => !files.includes(name))) throw Error('Unknown SQL test file');
for (const name of requested.length ? requested : files) {
  const file = path.join(root, 'supabase', 'sql-tests', name);
  const sql = await fs.readFile(file, 'utf8');
  const client = new Client(database);
  try {
    await client.connect();
    await client.query(sql);
    console.log(`PASS: ${name} on PostgreSQL local 127.0.0.1:54322`);
  } catch (error) {
    console.error(`FAIL: ${name} SQLSTATE ${error.code ?? 'unknown'}: ${error.message}`);
    if (error.where) console.error(error.where);
    if (error.position) {
      const line = sql.slice(0, Number(error.position) - 1).split('\n').length;
      console.error(`Query position: ${name}:${line}`);
    }
    process.exitCode = 1;
    break;
  } finally {
    await client.end().catch(() => {});
  }
}
