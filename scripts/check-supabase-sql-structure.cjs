const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'supabase', 'migrations');
const files = fs.readdirSync(folder).filter((name) => name.endsWith('.sql')).sort();
assert.ok(files.length >= 4, 'Expected versioned SQL migrations');

function scan(text, name) {
  let state = 'normal';
  let tag = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'line') {
      if (c === '\n') state = 'normal';
    } else if (state === 'block') {
      if (c === '*' && n === '/') { state = 'normal'; i++; }
    } else if (state === 'single') {
      if (c === "'" && n === "'") i++;
      else if (c === "'") state = 'normal';
    } else if (state === 'dollar') {
      if (text.startsWith(tag, i)) { i += tag.length - 1; state = 'normal'; }
    } else if (c === '-' && n === '-') { state = 'line'; i++; }
    else if (c === '/' && n === '*') { state = 'block'; i++; }
    else if (c === "'") state = 'single';
    else if (c === '$') {
      const match = text.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) { tag = match[0]; state = 'dollar'; i += tag.length - 1; }
    } else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      assert.ok(depth >= 0, `${name}: unmatched closing parenthesis near ${i}`);
    }
  }
  assert.ok(state === 'normal' || state === 'line', `${name}: unterminated ${state}`);
  assert.equal(depth, 0, `${name}: unbalanced parentheses`);
}

const sql = files.map((name) => {
  const text = fs.readFileSync(path.join(folder, name), 'utf8');
  scan(text, name);
  for (const match of text.matchAll(/create function\b[\s\S]*?\$\$[\s\S]*?\$\$;/gi)) {
    if (/security definer/i.test(match[0])) {
      assert.match(match[0], /security definer\s+set search_path\s*=\s*''/i,
        `${name}: SECURITY DEFINER must have empty search_path`);
    }
  }
  return text;
}).join('\n');
const tests = path.join(root, 'supabase', 'sql-tests');
for (const name of fs.readdirSync(tests).filter((value) => value.endsWith('.sql'))) {
  scan(fs.readFileSync(path.join(tests, name), 'utf8'), name);
}
const tables = [...sql.matchAll(/create table public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
assert.equal(tables.length, 19, `Expected 19 tables, found ${tables.length}`);
assert.equal(new Set(tables).size, 19, 'Duplicate application table');
for (const table of tables) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`),
    `RLS missing: ${table}`);
}
console.log(`PASS: ${files.length} migration files, 19 unique application tables, RLS, lexical balance`);
console.log('This is a structural check, not a PostgreSQL parse or execution.');
