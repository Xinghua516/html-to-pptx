window.__extract = () => {
  const root = document.querySelector((window.__CFG && window.__CFG.root) || '.litho-vignette');
  const rr = root.getBoundingClientRect();
  const assets = window.__assets || (window.__assets = new Map());
  const assetRef = url => { let id = assets.get(url); if (!id) { id = 'a' + (assets.size + 1); assets.set(url, id); } return id; };
  const recs = [];
  let dom = 0;
  const num = v => parseFloat(v) || 0;
  const rgba = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const fontOf = cs => ({ family: cs.fontFamily, size: num(cs.fontSize), weight: cs.fontWeight, style: cs.fontStyle, color: rgba(cs.color), ls: num(cs.letterSpacing), lh: cs.lineHeight, align: cs.textAlign });
  const radiusOf = cs => [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(num);
  const paints = (el, cs, rect, idx, pseudo, total, srcEl) => {
    const bg = rgba(cs.backgroundColor);
    const bgi = cs.backgroundImage;
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => num(cs['border' + s + 'Width']));
    const shadow = cs.boxShadow !== 'none' ? cs.boxShadow : null;
    if (!((bg && bg.a > 0) || (bgi && bgi !== 'none') || bw.some(w => w > 0) || shadow)) return;
    let r = rect;
    if (pseudo) {
      const t = num(cs.top), l = num(cs.left), b = num(cs.bottom), rt = num(cs.right);
      const w = cs.width !== 'auto' ? num(cs.width) : rect.w - l - rt;
      const h = cs.height !== 'auto' ? num(cs.height) : rect.h - t - b;
      r = { x: rect.x + l, y: rect.y + t, w, h };
    }
    const imgs = [];
    let bgiOut = null;
    if (bgi && bgi !== 'none') {
      bgiOut = bgi.replace(/url\("?(data:[^")]+)"?\)/g, (m, u) => { const id = assetRef(u); imgs.push(id); return 'url(' + id + ')'; });
    }
    recs.push({
      kind: 'box', idx, pseudo: pseudo || null, tag: el.tagName,
      cls: String(el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 70),
      r, bg, bgi: bgiOut, imgs, bw,
      bc: ['Top', 'Right', 'Bottom', 'Left'].map(s => rgba(cs['border' + s + 'Color'])),
      bs: ['Top', 'Right', 'Bottom', 'Left'].map(s => cs['border' + s + 'Style']),
      radius: radiusOf(cs), shadow, transform: mstr(total || [1, 0, 0, 1, 0, 0]), opacity: num(cs.opacity),
      w0: srcEl ? srcEl.offsetWidth : rect.w, h0: srcEl ? srcEl.offsetHeight : rect.h,
      bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition, bgRepeat: cs.backgroundRepeat,
      blend: cs.mixBlendMode, z: cs.zIndex, pos: cs.position,
      filter: cs.filter !== 'none' ? cs.filter : null, backdrop: cs.backdropFilter !== 'none' ? cs.backdropFilter : null
    });
  };
  const pushRun = (lines, rc, text, f) => lines.push({ x: rc.x - rr.x, y: rc.y - rr.y, w: rc.width, h: rc.height, t: text, f });
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const compose = cs => {
    let M = I;
    const t = cs.translate;
    if (t && t !== 'none') { const p = t.split(' ').map(parseFloat); M = mul(M, [1, 0, 0, 1, p[0] || 0, p[1] || 0]); }
    const r = cs.rotate;
    if (r && r !== 'none') { const a = parseFloat(r) * Math.PI / 180; M = mul(M, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); }
    const s = cs.scale;
    if (s && s !== 'none') { const p = s.split(' ').map(parseFloat); M = mul(M, [p[0], 0, 0, p.length > 1 ? p[1] : p[0], 0, 0]); }
    const tr = cs.transform;
    if (tr && tr !== 'none') { const v = tr.match(/matrix\(([^)]+)\)/); if (v) M = mul(M, v[1].split(',').map(parseFloat)); }
    return M;
  };
  const mstr = M => 'matrix(' + M.join(', ') + ')';
  const consumed = new Set();
  const walk = (el, pm) => {
    const idx = dom++;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const total = mul(pm, compose(cs));
    const b = el.getBoundingClientRect();
    const rect = { x: b.x - rr.x, y: b.y - rr.y, w: b.width, h: b.height };
    if (el.tagName === 'svg') { recs.push({ kind: 'svg', idx, r: rect, html: el.outerHTML, opacity: num(cs.opacity), transform: mstr(total) }); return; }
    if (el.tagName === 'IMG') { recs.push({ kind: 'img', idx, r: rect, src: assetRef(el.src), radius: radiusOf(cs), opacity: num(cs.opacity), transform: mstr(total), fit: cs.objectFit }); return; }
    if (rect.w > 0 && rect.h > 0) paints(el, cs, rect, idx, null, total, el);
    for (const p of ['::before', '::after']) {
      const pc = getComputedStyle(el, p);
      if (pc.content !== 'none' && pc.content !== 'normal') paints(el, pc, rect, idx + 0.1, p, total, el);
    }
    const kids = [...el.children];
    const blockKid = kids.some(k => { const d = getComputedStyle(k).display; return ['block', 'flex', 'grid', 'inline-block', 'list-item', 'table'].includes(d) && k.innerText && k.innerText.trim(); });
    if (el.innerText && el.innerText.trim() && !blockKid && !consumed.has(el)) {
      const mark = e => { consumed.add(e); [...e.children].forEach(mark); };
      kids.forEach(mark);
      const runs = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
        if (!rects.length) continue;
        const f = fontOf(getComputedStyle(n.parentElement));
        if (rects.length === 1) { pushRun(runs, rects[0], n.textContent, f); continue; }
        const text = n.textContent;
        let start = 0;
        for (const rc of rects) {
          const r2 = document.createRange();
          r2.setStart(n, start);
          let best = start;
          for (let i = start; i < text.length; i++) {
            r2.setEnd(n, i + 1);
            const rs = r2.getClientRects();
            const last = rs[rs.length - 1];
            if (rs.length !== 1 || last.width > rc.width + 0.6) break;
            best = i + 1;
          }
          if (best <= start) best = Math.min(text.length, start + 1);
          pushRun(runs, rc, text.slice(start, best), f);
          start = best;
          if (start >= text.length) break;
        }
      }
      if (runs.length) {
        const merged = [];
        for (const run of runs) {
          const L = merged.find(m => Math.abs(m.y - run.y) < 3);
          if (L) { L.runs.push(run); L.h = Math.max(L.h, run.h); }
          else merged.push({ y: run.y, h: run.h, runs: [run] });
        }
        merged.sort((a, b) => a.y - b.y);
        merged.forEach(L => L.runs.sort((a, b) => a.x - b.x));
        recs.push({ kind: 'text', idx: idx + 0.5, r: rect, lines: merged, base: fontOf(cs), align: cs.textAlign });
      }
    }
    kids.forEach(k => walk(k, total));
  };
  const rcs = getComputedStyle(root);
  paints(root, rcs, { x: 0, y: 0, w: rr.width, h: rr.height }, -1, null, [1, 0, 0, 1, 0, 0], root);
  for (const p of ['::before', '::after']) {
    const pc = getComputedStyle(root, p);
    if (pc.content !== 'none' && pc.content !== 'normal') paints(root, pc, { x: 0, y: 0, w: rr.width, h: rr.height }, -0.9, p, [1, 0, 0, 1, 0, 0], root);
  }
  [...root.children].forEach(ch => walk(ch, [1, 0, 0, 1, 0, 0]));
  recs.sort((a, b) => {
    const za = a.z && a.z !== 'auto' ? parseInt(a.z) : 0;
    const zb = b.z && b.z !== 'auto' ? parseInt(b.z) : 0;
    const ka = za < 0 ? 0 : za > 0 ? 2 : 1;
    const kb = zb < 0 ? 0 : zb > 0 ? 2 : 1;
    return ka - kb || a.idx - b.idx;
  });
  return { recs, assets: [...assets.entries()].map(([url, id]) => [id, url]) };
};