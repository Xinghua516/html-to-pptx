---
name: html-to-pptx
description: Convert HTML presentations or pages to PPTX in two modes - pixel-faithful raster (headless Chromium 4K tile screenshots stitched with sharp, embedded via PptxGenJS) or fully editable vector (browser-measured layout IR mapped to DrawingML shapes and text via python-pptx). Use when the user asks to convert or transfer an HTML deck, slides, or webpage to PPTX/PowerPoint (HTML to PPTX, 转译/转换 html 为 pptx, 可编辑 pptx, 原封不动转 pptx), or to reproduce a web presentation as slides.
---

# HTML → PPTX

## Overview

Self-contained, agent-agnostic skill following the open Agent Skills folder convention (agentskills.io): this repository root IS the skill (SKILL.md + scripts + references + examples + tests). Cloning it once gives any coding agent the complete, deck-agnostic pipeline — Claude Code, Codex, Qoder, Cursor, Copilot, OpenCode, or a plain script runner. Tool-specific install paths and invocation: `integrations/claude.md`, `integrations/codex.md`. Never guess layout — measure it in a real browser, then emit PPTX through libraries (python-pptx / PptxGenJS), never hand-rolled OOXML packages.

- **Vector mode (editable)**: layout IR (boxes, frozen text lines, SVG, images) → DrawingML shapes/text. Editable; documented loss list applies.
- **Raster mode (pixel-faithful)**: per-slide screenshots at canvas×rasterScale, stitched tiles, one full-bleed image per slide. Not editable.

Choose vector for editable output, raster for pixel-identical output. State the tradeoff before building.

## Prerequisites

- Headless Chromium with CDP, e.g. `msedge --headless=new --disable-gpu --user-data-dir=<scratch> --remote-debugging-port=9226 --window-size=1600,900 about:blank`.
- Node ≥ 22 (global WebSocket). `npm install` in repo root (sharp, pptxgenjs, jszip).
- `pip install -r requirements.txt` (python-pptx). If pypi hangs: `-i https://pypi.tuna.tsinghua.edu.cn/simple`.
- Verification: PowerPoint COM export (Windows) or any OOXML geometry audit.

## Deck config

All deck-specific behavior lives in a JSON config (see `examples/deck.config.json`); scripts carry generic defaults only. Fields: `canvas` [w,h] design px; `slideIn` [w,h] inches; `rootSelector` slide canvas; `labelPad`; `settleMs`; `countJs` / `switchJs` (`{label}`) / `curJs` (`{total}`) browser expressions for slide count/switch/current-slide probe; `fonts.eaMap` + `fonts.defaultEa` (latin→East-Asian typeface); `rasterScale`; `dropBlend`; `skipSvgContaining`. Extract writes the resolved config into the IR dir so downstream steps pick it up automatically.

## Vector workflow

1. Start headless browser; then `node scripts/extract.mjs <deck.html> <work>/ir [config.json]` — per slide: switch, wait `document.fonts.ready` twice, dump IR.
2. `python scripts/map_vec.py <out.pptx> <work>/ir [config.json]` — prints per-slide shape counts and a dropped/unmapped list.
3. Verify: export PNGs via PowerPoint COM, compare with the HTML; run a geometry audit. Interpret results per references/mapping.md (bleed and watermark overlaps are intentional).
4. Iterate on real drift only; never "fix" intentional bleed/overlap.

## Raster workflow

1. `node scripts/capture.mjs <deck.html> <work>/slides/tiles [config.json]` — quadrant tiles (full-frame capture at 4K crashes headless Chromium), reconnect-on-close retry.
2. `node scripts/stitch.mjs <work>/slides` — sharp composites tiles (grid inferred from tile names/IHDR), JPEG q95 4:4:4.
3. `node scripts/build.mjs <out.pptx> <work>/slides [config.json]` — PptxGenJS full-bleed images; jszip read-back verifies counts, offsets, extents, raster dimensions.

## Units

Derived from config: EMU/px = slideIn[0]×914400/canvas[0]; pt/px = slideIn[0]×72/canvas[0]. Extract at 1× canvas viewport so computed font-size and rects are self-consistent (wrapper `transform: scale()` does not scale computed styles).

## Critical gotchas

- Tailwind v4 `rotate-*`/`scale-*`/`translate-*` use individual CSS properties; `computed.transform` is `none`. Compose translate·rotate·scale·transform and accumulate ancestor matrices.
- Wait `document.fonts.ready` after each slide switch: CJK webfont subsets load lazily; fallback-font measurement freezes wrong line breaks.
- Range line splitting: never use union `getBoundingClientRect().width` (swallows paragraphs) nor compare sub-range y to full-line rect y (drifts ~6px). Use `getClientRects().length === 1` plus width ≤ line width.
- `innerText` lacks soft-wrap newlines; use Range rects.
- Headless Chromium closes the CDP session on full-frame 4K capture; use clipped tiles and re-apply Emulation overrides after reconnect.
- Skip SVG noise overlays (`feTurbulence` + blend) instead of rendering them as solid tint.

## Tests

With a headless browser on the port: `node tests/smoke.mjs [port]` — extracts and maps `examples/sample-deck.html` (2 slides) end-to-end and asserts slide/shape/text counts.

## Resources

- `scripts/extract-page.js` + `scripts/extract.mjs` — layout IR extractor (CDP).
- `scripts/map_vec.py` — IR → DrawingML mapper (python-pptx).
- `scripts/capture.mjs` / `stitch.mjs` / `build.mjs` — raster pipeline.
- `references/mapping.md` — mapping table, transform/stacking rules, loss list, audit interpretation.
- `examples/deck.config.json` + `examples/sample-deck.html` — reference config and runnable sample deck.
- `tests/smoke.mjs` — end-to-end smoke test.
- `integrations/claude.md` / `integrations/codex.md` — per-tool install paths, invocation, and refresh conventions.