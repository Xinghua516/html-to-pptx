import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = process.argv[2] || process.env.CDP_PORT || '9226';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'html2pptx-smoke-'));
const env = { ...process.env, CDP_PORT: String(PORT) };

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error('SMOKE_FAIL: ' + cmd + ' ' + args.join(' ')); process.exit(1); }
};
run(process.execPath, ['scripts/extract.mjs', 'examples/sample-deck.html', path.join(work, 'ir'), 'examples/deck.config.json']);
run('python', ['scripts/map_vec.py', path.join(work, 'smoke.pptx'), path.join(work, 'ir')]);

const zip = await JSZip.loadAsync(fs.readFileSync(path.join(work, 'smoke.pptx')));
const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
if (slides.length !== 2) { console.error('SMOKE_FAIL: expected 2 slides, got ' + slides.length); process.exit(1); }
let shapes = 0, textOk = false;
for (const s of slides) {
  const xml = await zip.file(s).async('string');
  shapes += (xml.match(/<p:sp>/g) || []).length;
  if (xml.includes('Sample Slide')) textOk = true;
}
if (shapes < 6 || !textOk) { console.error('SMOKE_FAIL: shapes=' + shapes + ' textOk=' + textOk); process.exit(1); }
fs.rmSync(work, { recursive: true, force: true });
console.log('SMOKE_OK slides=2 shapes=' + shapes);