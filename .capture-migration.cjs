const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = path.resolve('reference/migration-verification');
const pageName = process.argv[2];
const width = Number(process.argv[3]);
const height = Number(process.argv[4]);
const scrollSelector = process.argv[5] && process.argv[5] !== '-' ? process.argv[5] : '';
const pageQuery = process.argv[6] || '';
if (!pageName || !Number.isInteger(width) || !Number.isInteger(height)) throw Error('Usage: page width height');
const profile = path.resolve('.capture-migration-profile-' + pageName + '-' + width + '-' + process.pid);
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--force-device-scale-factor=1',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); break; }
    await sleep(100);
  }
  if (!port) throw Error('Chrome DevTools port unavailable');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(item => item.type === 'page');
  if (!target) throw Error('No page target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(Error(message.error.message));
    else item.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  await send('Page.enable');
  console.log('cdp-ready');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' + pageName + '.html' + pageQuery });
  console.log('navigated');
  await sleep(500);
  await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll(\'img[loading="lazy"]\').forEach(image => image.loading = "eager")',
  });
  await sleep(4000);
  await send('Runtime.evaluate', { expression: 'Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))])', awaitPromise: true });
  console.log('fonts-ready');
  await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll(".reveal").forEach(element => element.classList.add("is-visible")); window.scrollTo(0, 0)',
  });
  if (scrollSelector) await send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(scrollSelector)})?.scrollIntoView({behavior:'instant',block:'start'})`,
  });
  await sleep(800);
  const viewport = await send('Runtime.evaluate', {
    expression: '({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight})',
    returnByValue: true,
  });
  const metrics = await send('Page.getLayoutMetrics');
  console.log('metrics-ready');
  const pageHeight = height;
  const shotY = scrollSelector ? (await send('Runtime.evaluate', {expression:'window.scrollY',returnByValue:true})).result.value : 0;
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: shotY, width, height: pageHeight, scale: 1 },
  });
  console.log('shot-ready');
  const file = path.join(outputDir, pageName + '-' + width + (scrollSelector ? '-section' : '') + (pageQuery ? '-data' : '') + '.png');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ file, viewport: viewport.result.value, pageHeight }));
  socket.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => chrome.kill());
