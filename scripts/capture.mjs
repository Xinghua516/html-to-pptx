import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9224;
const HTML = process.argv[2];
if (!HTML) { console.error('usage: node capture.mjs <html-path> [tiles-dir] [deck.config.json]'); process.exit(1); }
const OUT_DIR = path.resolve(process.argv[3] || path.join(import.meta.dirname, 'slides', 'tiles'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const DEFAULTS = {
  canvas: [1600, 900], slideIn: [13.333333, 7.5], rootSelector: 'body', labelPad: 2, settleMs: 600,
  countJs: '1', switchJs: 'void 0', curJs: "String(1).padStart(2,'0')",
  fonts: { eaMap: {}, defaultEa: 'Noto Sans SC' }, rasterScale: 2.4,
  dropBlend: ['multiply'], skipSvgContaining: ['feTurbulence']
};
const cfgPath = process.argv[4] || process.env.DECK_CONFIG;
const CFG = { ...DEFAULTS, ...(cfgPath ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {}) };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const W = Math.round(CFG.canvas[0] * CFG.rasterScale);
const H = Math.round(CFG.canvas[1] * CFG.rasterScale);
const TW = Math.round(W / 2), TH = Math.round(H / 2);
const TILES = [[0, 0], [TW, 0], [0, TH], [TW, TH]];
fs.writeFileSync(path.join(OUT_DIR, '..', 'config.json'), JSON.stringify(CFG, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let session = null;
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw Error('no page target; start headless Chromium with --remote-debugging-port=' + PORT);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(Error('ws connect error')); });
  let id = 0; const pending = new Map();
  const s = { ws, dead: false };
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m); pending.delete(m.id); } };
  ws.onclose = () => { s.dead = true; for (const [, p] of pending) p.rej(Error('ws closed')); pending.clear(); };
  s.send = (method, params = {}, timeout = 90000) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); rej(Error('timeout ' + method)); }, timeout);
    pending.set(i, { res: m => { clearTimeout(timer); res(m); }, rej: e => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  s.evaluate = async (expression) => {
    const r = await s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  session = s;
  return s;
}
async function cmd(method, params) {
  let fails = 0;
  for (;;) {
    if (!session || session.dead) await connect();
    try { return await session.send(method, params); }
    catch (e) {
      session.dead = true; try { session.ws.close(); } catch {}
      session = null;
      if (++fails > 4) throw e;
      console.log('retry', method, '-', e.message);
      await sleep(1500);
    }
  }
}
const evaluate = e => cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }).then(r => {
  if (r.result.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
});

await connect();
await cmd('Page.navigate', { url: 'file:///' + encodeURI(path.resolve(HTML).replace(/\\/g, '/')) });
for (let i = 0; i < 80; i++) { if (await evaluate(`document.getElementById('root')?.children.length ?? document.body.children.length`) > 0) break; await sleep(250); }
console.log('fonts:', await evaluate(`document.fonts.ready.then(() => document.fonts.status)`));
await sleep(1500);
const tileShot = (x, y) => cmd('Page.captureScreenshot', { format: 'png', clip: { x, y, width: TW, height: TH, scale: 1 } });
await tileShot(0, 0);
console.log('warmup shot ok');

const total = await evaluate(fill(CFG.countJs, {}));
console.log('slides:', total, 'raster:', W + 'x' + H);
for (let n = 1; n <= total; n++) {
  const label = String(n).padStart(CFG.labelPad, '0');
  let cur = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await evaluate(fill(CFG.switchJs, { label }));
    await sleep(CFG.settleMs);
    await evaluate(`document.fonts.ready.then(() => 1)`);
    await sleep(400);
    cur = await evaluate(fill(CFG.curJs, { total }));
    if (String(cur) === label) break;
  }
  if (String(cur) !== label) throw Error(`slide mismatch want ${label} got ${cur}`);
  let totalBytes = 0;
  for (const [x, y] of TILES) {
    const r = await tileShot(x, y);
    const file = path.join(OUT_DIR, `S${label}_${x}_${y}.png`);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    totalBytes += fs.statSync(file).size;
  }
  console.log(`S${label} ${TILES.length} tiles ${W}x${H} ${(totalBytes / 1048576).toFixed(2)}MB`);
}
try { session.ws.close(); } catch {}
console.log('CAPTURE_DONE');
process.exit(0);