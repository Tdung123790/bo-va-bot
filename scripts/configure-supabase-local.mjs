import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['supabase', 'status', '-o', 'json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  throw new Error('Không đọc được trạng thái Supabase local. Hãy chạy npx supabase start.');
}
const status = JSON.parse(result.stdout);
const url = new URL(status.API_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
  throw new Error('Chỉ được cấu hình Supabase local tại 127.0.0.1:54321.');
}
if (!/^sb_publishable_/.test(status.PUBLISHABLE_KEY || '')) {
  throw new Error('Supabase local chưa cung cấp publishable key hợp lệ.');
}
const config = {
  mode: 'supabase',
  url: url.origin,
  publishableKey: status.PUBLISHABLE_KEY,
};
fs.writeFileSync(path.join(root, 'site', 'backend-config.local.json'),
  JSON.stringify(config, null, 2) + '\n');
console.log('Đã ghi cấu hình công khai Supabase local cho storefront.');
