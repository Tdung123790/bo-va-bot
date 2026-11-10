import { Client } from 'pg';
import {localDbPassword} from './local-db-password.mjs';

const expected = [
  'profiles', 'categories', 'products', 'product_variants',
  'customization_categories', 'customization_options', 'promotions',
  'orders', 'order_items', 'order_status_history', 'payments',
  'loyalty_accounts', 'loyalty_transactions', 'wishlist_items', 'reviews',
  'daily_analytics', 'audit_log', 'store_settings',
];
const client = new Client({
  host: '127.0.0.1',
  port: 54322,
  user: 'postgres',
  password: localDbPassword(),
  database: 'postgres',
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  const tables = await client.query(
    "select tablename from pg_tables where schemaname='public' and tablename=any($1::text[])",
    [expected]);
  if (tables.rowCount !== 18) throw new Error(`Expected 18 tables, found ${tables.rowCount}`);
  for (const table of expected) {
    const result = await client.query(`select count(*)::integer as count from public.${table}`);
    if (result.rows[0].count !== 0) {
      throw new Error(`${table} has ${result.rows[0].count} rows in Supabase LOCAL`);
    }
  }
  const users = await client.query('select count(*)::integer as count from auth.users');
  if (users.rows[0].count !== 0) throw new Error('Synthetic Auth users remain');
  console.log('PASS: all 18 application tables and auth.users are empty in Supabase LOCAL');
} finally {
  await client.end().catch(() => {});
}
