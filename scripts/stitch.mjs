import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const DIR = import.meta.dirname;
const BASE = path.resolve(process.argv[2] || path.join(DIR, 'slides'));
const TILES = path.join(BASE, 'tiles');
const OUT = BASE;

const files = fs.readdirSync(TILES).filter(f => /^S\w+_\d+_\d+\.png$/.test(f));
if (!files.length) throw Error('no tiles; run capture.mjs first');
const ihdr = fs.readFileSync(path.join(TILES, files[0]));
const tw = ihdr.readUInt32BE(16), th = ihdr.readUInt32BE(20);
const coords = files.map(f => { const [label, x, y] = f.replace('.png', '').split('_'); return { label, x: +x, y: +y, f }; });
const W = Math.max(...coords.map(c => c.x)) + tw;
const H = Math.max(...coords.map(c => c.y)) + th;
const labels = [...new Set(coords.map(c => c.label))].sort();
console.log('grid:', W + 'x' + H, 'tile:', tw + 'x' + th, 'slides:', labels.length);

let totalJpg = 0;
for (const label of labels) {
  const inputs = coords.filter(c => c.label === label).sort((a, b) => a.y - b.y || a.x - b.x)
    .map(c => ({ input: path.join(TILES, c.f), left: c.x, top: c.y }));
  const stitched = sharp({ create: { width: W, height: H, channels: 3, background: '#0E0D0C' } }).composite(inputs);
  const jpgBuf = await stitched.clone().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${label}.jpg`), jpgBuf);
  totalJpg += jpgBuf.length;
  let note = '';
  if (label === labels[0]) {
    const rawPng = await stitched.clone().removeAlpha().raw().toBuffer();
    const rawJpg = await sharp(jpgBuf).removeAlpha().raw().toBuffer();
    let sum = 0, max = 0, n = 0;
    for (let i = 0; i < rawPng.length; i += 97) { const d = Math.abs(rawPng[i] - rawJpg[i]); sum += d; n++; if (d > max) max = d; }
    note = ` | fidelity sample: meanAbsErr=${(sum / n).toFixed(3)}/255 maxErr=${max}/255`;
  }
  console.log(`${label}.jpg ${(jpgBuf.length / 1048576).toFixed(2)}MB${note}`);
}
console.log('total jpg:', (totalJpg / 1048576).toFixed(1) + 'MB');
console.log('STITCH_DONE');