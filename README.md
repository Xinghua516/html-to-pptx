# html-to-pptx

Convert HTML presentations to PPTX through measured layout, never guessed layout. Ships as a [Qoder Skill](SKILL.md) and as a standalone script pipeline.

Two modes:

- **Vector (editable)** — extract a layout IR from a real browser (boxes, frozen text lines, SVG, images), map it to DrawingML shapes and text with `python-pptx`. Text and shapes stay editable; a documented loss list applies (blend-mode textures, grain, glyph-level skew, font substitution drift).
- **Raster (pixel-faithful)** — screenshot every slide at 3840×2160 in headless Chromium, stitch tiles with `sharp`, embed one full-bleed image per slide with `PptxGenJS`. Not editable, visually identical.

## Requirements

- Windows/Linux/macOS with Chrome or Edge (headless + CDP). Scripts drive CDP over Node's global WebSocket (Node ≥ 22).
- `npm install` (sharp, pptxgenjs, jszip)
- `pip install -r requirements.txt` (python-pptx)
- Optional verification: PowerPoint (COM export on Windows) or any OOXML geometry audit.

## Install (any agent)

The repo root is a complete skill folder per the open [Agent Skills convention](https://agentskills.io): `SKILL.md` + `scripts/` + `references/` + `examples/` + `tests/`. Clone it into your tool's skills directory — one clone, no extra steps:

| Tool | Personal | Project |
|---|---|---|
| Claude Code | `~/.claude/skills/html-to-pptx` | `.claude/skills/html-to-pptx` |
| Codex | `~/.codex/skills/html-to-pptx` (newer builds also scan `~/.agents/skills`) | `.codex/skills/html-to-pptx` (or `.agents/skills`) |
| Qoder | `~/.qoder/skills/html-to-pptx` | `.qoder/skills/html-to-pptx` |
| OpenCode | `~/.config/opencode/skills/html-to-pptx` | `.opencode/skills/html-to-pptx` |
| GitHub Copilot | `~/.copilot/skills/html-to-pptx` | `.github/skills/html-to-pptx` |

```
git clone https://github.com/Xinghua516/html-to-pptx ~/.claude/skills/html-to-pptx   # example: Claude Code
```

Cross-tool installer alternative: `npx skills add Xinghua516/html-to-pptx -a '*'` (vercel-labs/skills). Any other agent: point it at `SKILL.md` and let it run the scripts directly. Tool-specific invocation and refresh details: [integrations/claude.md](integrations/claude.md), [integrations/codex.md](integrations/codex.md).

## Usage

Start a headless browser with a debug port first:

```
msedge --headless=new --disable-gpu --user-data-dir=<scratch> --remote-debugging-port=9226 --window-size=1600,900 about:blank
```

All deck-specific behavior lives in a JSON config (`examples/deck.config.json`): canvas size, slide inches, root selector, slide count/switch/current-slide expressions, font mapping, raster scale, loss policy. Scripts carry generic defaults only.

Vector mode:

```
node scripts/extract.mjs <deck.html> <work>/ir [deck.config.json]
python scripts/map_vec.py <out.pptx> <work>/ir [deck.config.json]
```

Raster mode:

```
node scripts/capture.mjs <deck.html> <work>/slides/tiles [deck.config.json]
node scripts/stitch.mjs <work>/slides
node scripts/build.mjs <out.pptx> <work>/slides [deck.config.json]
```

Smoke test (needs the headless browser): `node tests/smoke.mjs [port]` — runs the vector pipeline end-to-end on `examples/sample-deck.html`.

## How it works

1. **Measure**: per slide, wait for webfonts, walk the DOM, record paint boxes with composed transform matrices (including Tailwind v4 individual `rotate`/`scale`/`translate` properties and ancestor accumulation), freeze text into visual lines via Range rects, capture SVG markup and image assets.
2. **Map**: CSS/SVG primitives → DrawingML (rect/ellipse/custGeom, solidFill/alpha, ln/prstDash, outerShdw, arcTo, text runs with `latin`+`ea` typefaces, spc/lnSpc). Units: 7620 EMU per design px, 0.6 pt per px on a 1600×900 canvas.
3. **Verify**: export PNGs from PowerPoint and compare against the HTML; audit geometry and interpret intentional bleed/overlap per `references/mapping.md`.

See [references/mapping.md](references/mapping.md) for the full mapping table, transform/stacking rules, loss list, and the headless-Chromium pitfalls (4K full-frame capture crash, Range union-width and y-drift traps, lazy CJK font subsets).

## Repository layout

```
SKILL.md            skill instructions (loaded by Qoder)
scripts/            extract / map / capture / stitch / build
references/         mapping table and pitfalls
```

Intermediates (`ir/`, `slides/`, renders) are gitignored; regenerate them with the pipeline.