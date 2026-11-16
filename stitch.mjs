import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const DIR = import.meta.dirname;
const BASE = path.resolve(process.argv[2] || path.join(DIR, 'slides'));
const TILES = path.join(BASE, 'tiles');
const OUT = BASE;
const W = 3840, H = 2160;
const POS = [[0, 0], [1920, 0], [0, 1080], [1920, 1080]];

const labels = [...new Set(fs.readdirSync(TILES).map(f => f.slice(0, 3)))].sort();
let totalJpg = 0;
for (const label of labels) {
  const inputs = POS.map(([x, y]) => ({ input: path.join(TILES, `${label}_${x}_${y}.png`), left: x, top: y }));
  const stitched = sharp({ create: { width: W, height: H, channels: 3, background: '#0E0D0C' } }).composite(inputs);
  const jpgBuf = await stitched.clone().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${label}.jpg`), jpgBuf);
  totalJpg += jpgBuf.length;
  let note = '';
  if (label === 'S01') {
    const rawPng2 = await stitched.clone().removeAlpha().raw().toBuffer();
    const rawJpg = await sharp(jpgBuf).removeAlpha().raw().toBuffer();
    let sum = 0, max = 0, n = 0;
    for (let i = 0; i < rawPng2.length; i += 97) { const d = Math.abs(rawPng2[i] - rawJpg[i]); sum += d; n++; if (d > max) max = d; }
    note = ` | fidelity sample: meanAbsErr=${(sum / n).toFixed(3)}/255 maxErr=${max}/255`;
  }
  console.log(`${label}.jpg ${(jpgBuf.length / 1048576).toFixed(2)}MB${note}`);
}
console.log('total jpg:', (totalJpg / 1048576).toFixed(1) + 'MB');
console.log('STITCH_DONE');