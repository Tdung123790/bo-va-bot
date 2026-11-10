const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '../site');
const routes = [
  'index.html', 'menu.html', 'product.html', 'wishlist.html',
  'about.html', 'promotions.html', 'reviews.html', 'customize.html',
  'contact.html', 'profile.html', 'admin-orders.html', 'promotion-detail.html'
];
const errors = [];
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (item.isFile()) files.push(file);
  }
}
function localReference(file, value) {
  if (!value || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(value)) return;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return;
  const base = path.dirname(file) === path.join(root, 'partials') ? root : path.dirname(file);
  const resolved = clean.startsWith('/')
    ? path.resolve(root, '.' + clean)
    : path.resolve(base, clean);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    errors.push(`Outside site: ${path.relative(root, file)} -> ${value}`);
  } else if (!fs.existsSync(resolved)) {
    errors.push(`Missing: ${path.relative(root, file)} -> ${value}`);
  }
}

walk(root);
for (const route of routes) {
  if (!fs.existsSync(path.join(root, route))) errors.push(`Missing Router route target: ${route}`);
}
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!['.html', '.css', '.js', '.json'].includes(extension)) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (extension === '.json') {
    try { JSON.parse(content); } catch (error) { errors.push(`Invalid JSON: ${path.relative(root, file)}: ${error.message}`); }
  }
  if (extension === '.js') {
    const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    if (result.status !== 0) errors.push(`Invalid JS: ${path.relative(root, file)}: ${result.stderr.trim()}`);
    for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
      localReference(file, match[1]);
    }
  }
  if (extension === '.html') {
    for (const match of content.matchAll(/\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)) {
      localReference(file, match[1]);
    }
  }
  if (extension === '.css' && path.basename(file) !== 'fonts.css') {
    for (const match of content.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)) {
      localReference(file, match[1].trim());
    }
  }
}

const data = path.join(root, 'data');
for (const required of ['products.json', 'cake-options.json', 'promotions.json', 'reviews.json']) {
  if (!fs.existsSync(path.join(data, required))) errors.push(`Missing runtime data: ${required}`);
}
console.log(`Checked ${routes.length} Router route targets and ${files.length} site files.`);
if (errors.length) { for (const error of errors) console.error(error); process.exitCode = 1; }
else console.log('Local references, JS syntax, and JSON parse: OK.');
