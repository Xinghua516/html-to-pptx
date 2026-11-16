import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

const DIR = import.meta.dirname;
const SLIDES = path.resolve(process.argv[2] || path.join(DIR, 'slides'));
const OUT = 'C:/Users/Administrator/Downloads/省政府奖学金之外-汇报舞台版.pptx';

const files = fs.readdirSync(SLIDES).filter(f => /^S\d\d\.jpg$/.test(f)).sort();
if (files.length === 0) throw Error('no slides; run capture.mjs + stitch.mjs first');

function jpegSize(b) {
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) { p++; continue; }
    const m = b[p + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(p + 7), h: b.readUInt16BE(p + 5) };
    p += 2 + b.readUInt16BE(p + 2);
  }
  throw Error('no SOF');
}

const pres = new PptxGenJS();
pres.defineLayout({ name: 'SCHOLAR_16x9', width: 13.333333, height: 7.5 });
pres.layout = 'SCHOLAR_16x9';
pres.author = '李昌润';
pres.title = '《省政府奖学金之外》— 16:9 构成主义演示文稿';
pres.subject = '浙江省政府奖学金学习经验分享研讨会 · 2026';
for (const f of files) {
  const slide = pres.addSlide();
  slide.addImage({ path: path.join(SLIDES, f), x: 0, y: 0, w: 13.333333, h: 7.5, altText: '幻灯片 ' + f.slice(0, 3) });
}
await pres.writeFile({ fileName: OUT });
console.log('written:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + 'MB');

const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
const slideXmls = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => (+a.match(/\d+/)[0]) - (+b.match(/\d+/)[0]));
const media = Object.keys(zip.files).filter(n => /^ppt\/media\/.+/.test(n));
console.log('slides in pptx:', slideXmls.length, '| media:', media.length);
const presXml = await zip.file('ppt/presentation.xml').async('string');
console.log('sldSz:', (presXml.match(/<p:sldSz[^/]*\/>/) || [])[0]);
let ok = true;
for (let i = 0; i < slideXmls.length; i++) {
  const xml = await zip.file(slideXmls[i]).async('string');
  const pic = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/)[0];
  const ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  const off = pic.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
  const rel = pic.match(/r:embed="(rId\d+)"/);
  const rels = await zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`).async('string');
  const target = rels.match(new RegExp(`Id="${rel[1]}"[^>]*Target="([^"]+)"`))[1];
  const img = await zip.file('ppt/' + target.replace(/^\.\.\//, '')).async('nodebuffer');
  const { w, h } = jpegSize(img);
  const full = off[1] === '0' && off[2] === '0' && +ext[1] >= 12190000 && +ext[2] >= 6850000;
  if (!full || w !== 3840 || h !== 2160) ok = false;
  console.log(`slide${i + 1}: off(${off[1]},${off[2]}) ext(${ext[1]},${ext[2]}) media=${target} ${w}x${h} ${full ? 'OK' : 'BAD'}`);
}
console.log(ok && slideXmls.length === files.length && media.length === files.length ? 'VERIFY_OK' : 'VERIFY_FAIL');