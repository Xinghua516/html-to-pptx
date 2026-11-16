import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9226;
const HTML = process.argv[2] || 'C:/Users/Administrator/Downloads/省政府奖学金之外-汇报舞台版.html';
const DIR = path.resolve(process.argv[3] || path.join(import.meta.dirname, 'ir'));
fs.mkdirSync(DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
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
await evaluate(`window.__CFG = ${JSON.stringify({ root: process.env.ROOT_SEL || '.litho-vignette' })}`);
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url: 'file:///' + encodeURI(HTML) });
for (let i = 0; i < 80; i++) { if (await evaluate(`document.getElementById('root')?.children.length ?? 0`) > 0) break; await sleep(250); }
await evaluate(`document.fonts.ready.then(() => 1)`);
await sleep(800);

const EXTRACT = fs.readFileSync(path.join(import.meta.dirname, 'extract-page.js'), 'utf8');
await evaluate(EXTRACT);

const assets = {};
const COUNT_JS = process.env.COUNT_JS || `[...document.querySelectorAll('#root button')].filter(b => /^\\d\\d$/.test(b.textContent.trim())).length`;
const CUR_JS = process.env.CUR_JS || `(document.body.innerText.match(/№\\s*(\\d+)\\s*\\/\\s*${total}/) || [])[1]`;
const switchJs = label => process.env.SWITCH_JS ? process.env.SWITCH_JS.split('{label}').join(label) : `[...document.querySelectorAll('#root button')].find(b => b.textContent.trim() === '${label}').click()`;
const total = await evaluate(COUNT_JS);
for (let n = 1; n <= total; n++) {
  const label = String(n).padStart(2, '0');
  await evaluate(switchJs(label));
  await sleep(600);
  await evaluate(`document.fonts.ready.then(() => 1)`);
  await sleep(500);
  await evaluate(`document.fonts.ready.then(() => 1)`);
  const cur = await evaluate(CUR_JS);
  if (cur !== label) throw Error(`mismatch ${label} vs ${cur}`);
  const data = await evaluate(`JSON.stringify(window.__extract())`);
  const obj = JSON.parse(data);
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