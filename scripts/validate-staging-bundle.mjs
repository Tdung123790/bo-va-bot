import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=path.join(root,'staging');
const manifestPath=path.join(root,'STAGING_DEPLOY_MANIFEST.json');
const allowed=['404.html','_headers','assets/staging.css','favicon.svg','index.html','robots.txt'];
async function list(directory,prefix=''){
 const entries=await fs.readdir(directory,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  assert.ok(!entry.isSymbolicLink(),'STAGING_SYMLINK_FORBIDDEN');
  const relative=prefix?`${prefix}/${entry.name}`:entry.name;
  if(entry.isDirectory())files.push(...await list(path.join(directory,entry.name),relative));
  else if(entry.isFile())files.push(relative);
  else throw Error('STAGING_UNSUPPORTED_ENTRY');
 }
 return files;
}
const actual=(await list(bundle)).sort();
assert.deepEqual(actual,allowed,'STAGING_FILE_ALLOWLIST_MISMATCH');
const contents=new Map();
const files=[];
for(const name of actual){
 const bytes=await fs.readFile(path.join(bundle,name));
 const source=bytes.toString('utf8');
 assert.ok(!/(?:sb_secret_[A-Za-z0-9_-]{12,}|service.role|hashsecret|postgres(?:ql)?:\/\/|cloudflare.api.token|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|eyJ[A-Za-z0-9_-]{30,})/i.test(source),`STAGING_SECRET_PATTERN: ${name}`);
 const inspected=name==='favicon.svg'?source.replace('http://www.w3.org/2000/svg',''):source;
 assert.ok(!/https?:\/\/|127\.0\.0\.1|localhost|supabase|api\.cloudflare/i.test(inspected),`STAGING_EXTERNAL_OR_BACKEND_REFERENCE: ${name}`);
 if(name!=='index.html')assert.ok(!/vnpay/i.test(source),`STAGING_GATEWAY_REFERENCE: ${name}`);
 contents.set(name,source);
 files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(const name of ['index.html','404.html']){
 const html=contents.get(name);
 assert.ok(html.includes('Môi trường thử nghiệm — Không nhận đơn hàng thực tế'),`STAGING_LABEL_MISSING: ${name}`);
 assert.ok(!/<\s*(?:script|form|iframe|img)\b/i.test(html),`STAGING_ACTIVE_OR_UNLICENSED_CONTENT: ${name}`);
 assert.ok(!/\b(?:href|src)\s*=\s*["'](?:https?:|\/\/|javascript:)/i.test(html),`STAGING_EXTERNAL_LINK: ${name}`);
}
assert.ok(contents.get('index.html').includes('href="assets/staging.css"'));
assert.ok(contents.get('404.html').includes('href="/assets/staging.css"'));
for(const anchor of ['gioi-thieu','trang-thai'])assert.ok(contents.get('index.html').includes(`id="${anchor}"`));
assert.ok(!/@import|url\s*\(/i.test(contents.get('assets/staging.css')),'STAGING_CSS_EXTERNAL_ASSET');
const headers=contents.get('_headers');
for(const rule of ["default-src 'none'","script-src 'none'","connect-src 'none'","form-action 'none'","frame-ancestors 'none'"])assert.ok(headers.includes(rule),`STAGING_HEADER_MISSING: ${rule}`);
const manifest={project:'bo-va-bot-staging',root:'staging',mode:'static-isolated',files};
if(process.argv.includes('--write-manifest'))await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
else assert.deepEqual(JSON.parse(await fs.readFile(manifestPath,'utf8')),manifest,'STAGING_MANIFEST_HASH_MISMATCH');
console.log(`PASS staging bundle: ${files.length} allowlisted files, hashes, links, CSP, no active code or external assets`);
