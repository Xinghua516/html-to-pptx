# CSS → DrawingML mapping reference

## Units

Derived from deck config: EMU/px = slideIn[0]×914400/canvas[0]; pt/px = slideIn[0]×72/canvas[0]. Reference config (1600×900 canvas, 13.333×7.5in slide) gives 7620 EMU/px and 0.6 pt/px. Letter-spacing `spc` = px×pt/px×100 (hundredths of pt); line spacing `lnSpc/spcPts` = lh px×pt/px×100. Angles: OOXML 1/60000 deg, clockwise from +x (screen coords). Loss policy is config-driven: `dropBlend` (blend modes to drop), `skipSvgContaining` (SVG markup substrings to skip), `fonts.eaMap`/`defaultEa` (latin→East-Asian typeface).

## Primitive mapping

| CSS / SVG | DrawingML |
|---|---|
| rect + background-color | `a:prstGeom rect` + `a:solidFill/a:srgbClr` (+`a:alpha` for opacity) |
| uniform border | `a:ln` w=width, solidFill; non-uniform sides → one custGeom strip shape per side |
| box-shadow `X Y 0 color` (hard) | `a:outerShdw blurRad=0 dist=hypot(X,Y) dir=atan2(Y,X)+shapeRot` |
| rotate / skew / scale / translate | compose matrices; bake linear part into `a:custGeom` quad (rotation baked too; shadow dir compensated) |
| radial-gradient hard-stop dots + background-size | one custGeom with N full-circle `a:arcTo` subpaths (swAng=21600000) |
| repeating-linear-gradient stripes | one custGeom with clipped parallelogram subpaths (Sutherland–Hodgman vs box) |
| SVG circle fill | `prstGeom ellipse` |
| SVG circle short dash (e.g. 12 8) | ellipse + `a:ln/a:prstDash val="dash"` |
| SVG circle long dash (e.g. 320 480) | custGeom arc subpaths repeated around circumference; arcTo start point must equal center+(r·cos stAng, r·sin stAng) |
| SVG polygon / path (M L H V C Q Z) | custGeom pathLst (Q→cubic conversion) |
| SVG pattern fill | expand tiles over bbox into one custGeom per color group |
| SVG text | textbox; baseline→top ≈ y−0.9·size; mono advance 0.6em, CJK 1.0em |
| img / background url (non-blend) | picture part at rect |
| text block | textbox, `bodyPr wrap="none"` insets 0; one paragraph per frozen visual line; runs carry rPr (sz, b≥600, i, spc, solidFill, `a:latin` + `a:ea`) |
| font families | latin = first family; ea = Noto Serif SC / Noto Sans SC (mono→Noto Sans SC) |

## Transform and stacking rules

- Compose per element: translate · rotate · scale · transform (Tailwind v4 emits individual properties), then multiply by ancestor matrix. Record pre-transform `offsetWidth/Height` for quad baking.
- Paint order: negative z-index → DOM order → positive z-index. Nesting containment equals DOM order. opacity<1 / transform / blend create stacking contexts — rely on measured order, not semantic guessing.
- Text under a transformed ancestor keeps measured line positions but upright glyphs (skew/rotate of glyph shapes is not expressible for editable text).

## Text line freezing

Per text node: `Range.getClientRects()` = visual lines. Split substrings by growing a sub-range while `getClientRects().length === 1` and last-rect width ≤ line width. Do NOT use union `getBoundingClientRect().width` (swallows the paragraph) and do NOT compare sub-range y with full-line rect y (drifts several px). Merge runs into lines by y tolerance ~3px. Box width = widest line + 12% pad (font-substitution tolerance), extended per alignment so centered text stays centered.

## Loss list (vector mode, agreed)

- `mix-blend-multiply` paper-texture overlays and `feTurbulence` grain overlays: dropped.
- Glyph-level skew/rotation inside editable text: dropped (positions preserved).
- Webfonts not installed on the target machine: substituted; expect small metric drift (pad absorbs ≤12%).
- CSS animations: frozen at final state via `prefers-reduced-motion: reduce` emulation.

## Audit interpretation (check_deck / geometry)

- "Out of bounds" on decorative bands/circles/watermark numbers: intentional off-canvas bleed in the source design — keep.
- "Overlap" of watermark vs content, chapter tag vs number: intentional layering — keep.
- "Overlap" of adjacent text lines by a few px: line-box bbox adjacency — keep.
- "Text overflow (width/height)" on body text: real drift — fix extractor line freezing or font settle first.

## Raster mode notes

- Full-frame 4K `Page.captureScreenshot` crashes headless Chromium (session closes); use four 1920×1080 clips at a 3840×2160 viewport and stitch with sharp.
- JPEG q95 + chromaSubsampling 4:4:4 measured mean abs error ≈0.75/255 vs lossless at 4K — visually lossless; lossless PNG embedding would be ~100MB.
- Reconnect CDP on session loss and re-apply `Emulation.setDeviceMetricsOverride` / `setEmulatedMedia` (per-session state).