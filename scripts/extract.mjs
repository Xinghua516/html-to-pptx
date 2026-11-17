import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9226;
const HTML = process.argv[2];
if (!HTML) { console.error('usage: node extract.mjs <html-path> [ir-dir] [deck.config.json]'); process.exit(1); }
const DIR = path.resolve(process.argv[3] || path.join(import.meta.dirname, 'ir'));
fs.mkdirSync(DIR, { recursive: true });

const DEFAULTS = {
  canvas: [1600, 900], slideIn: [13.333333, 7.5], rootSelector: 'body', labelPad: 2, settleMs: 600,
  countJs: '1', switchJs: 'void 0', curJs: "String(1).padStart(2,'0')",
  fonts: { eaMap: {}, defaultEa: 'Noto Sans SC' }, rasterScale: 2.4,
  dropBlend: ['multiply'], skipSvgContaining: ['feTurbulence']
};
const cfgPath = process.argv[4] || process.env.DECK_CONFIG;
const CFG = { ...DEFAULTS, ...(cfgPath ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {}) };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) throw Error('no page target; start headless Chromium with --remote-debugging-port=' + PORT);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  return r.result.result.value;
};

await send('Page.enable'); await send('Runtime.enable');
await evaluate(`window.__CFG = ${JSON.stringify({ root: CFG.rootSelector })}`);
await send('Emulation.setDeviceMetricsOverride', { width: CFG.canvas[0], height: CFG.canvas[1], deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url: 'file:///' + encodeURI(path.resolve(HTML).replace(/\\/g, '/')) });
for (let i = 0; i < 80; i++) { if (await evaluate(`document.getElementById('root')?.children.length ?? document.body.children.length`) > 0) break; await sleep(250); }
await evaluate(`document.fonts.ready.then(() => 1)`);
await sleep(800);

const EXTRACT = fs.readFileSync(path.join(import.meta.dirname, 'extract-page.js'), 'utf8');
await evaluate(EXTRACT);
fs.writeFileSync(path.join(DIR, 'config.json'), JSON.stringify(CFG, null, 2));

const assets = {};
const total = await evaluate(fill(CFG.countJs, {}));
for (let n = 1; n <= total; n++) {
  const label = String(n).padStart(CFG.labelPad, '0');
  await evaluate(fill(CFG.switchJs, { label }));
  await sleep(CFG.settleMs);
  await evaluate(`document.fonts.ready.then(() => 1)`);
  await sleep(500);
  await evaluate(`document.fonts.ready.then(() => 1)`);
  const cur = await evaluate(fill(CFG.curJs, { total }));
  if (String(cur) !== label) throw Error(`slide mismatch want ${label} got ${cur}`);
  const obj = JSON.parse(await evaluate(`JSON.stringify(window.__extract())`));
  for (const [aid, url] of obj.assets) assets[aid] = url;
  fs.writeFileSync(path.join(DIR, `S${label}.json`), JSON.stringify(obj.recs));
  const kinds = {};
  for (const r of obj.recs) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  console.log(`S${label}`, JSON.stringify(kinds), 'recs=' + obj.recs.length);
}
fs.writeFileSync(path.join(DIR, 'assets.json'), JSON.stringify(assets));
console.log('assets:', Object.keys(assets).length);
ws.close();
console.log('EXTRACT_DONE');
process.exit(0);