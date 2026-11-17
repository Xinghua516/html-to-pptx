# Codex integration

## Install

Personal (all projects):

```
git clone https://github.com/Xinghua516/html-to-pptx ~/.codex/skills/html-to-pptx
```

Project (shared via repo): `<project>/.codex/skills/html-to-pptx`. Newer Codex builds also scan the open-convention locations `~/.agents/skills/` and `<project>/.agents/skills/`; if your version does not pick up `.codex/skills`, place or symlink the folder there. Check your version's skills docs when in doubt.

Custom directory via `~/.codex/config.toml`:

```toml
[skills]
enabled = true
directory = "~/my-skills"   # then clone into ~/my-skills/html-to-pptx
```

Windows personal path: `C:\Users\<you>\.codex\skills\html-to-pptx`.

The folder must contain `SKILL.md` at its root (this repo does). Run `npm install` and `pip install -r requirements.txt` once in the skill folder.

## Load and refresh

Codex indexes only `name` + `description` of installed skills at session start and loads the full body on semantic match. After installing or editing, restart Codex so the index refreshes. A skill that "installed but never triggers" is usually a wrong directory or an over-broad description — this skill's description lists concrete trigger phrases (HTML to PPTX, 转译/转换 html 为 pptx, 可编辑 pptx, 原封不动转 pptx).

## Invocation

- Automatic: description match, as above.
- Explicit: `$html-to-pptx` in the prompt.
- Cross-tool installer alternative: `npx skills add Xinghua516/html-to-pptx -a codex`.

## AGENTS.md awareness (optional but recommended)

Codex reads `AGENTS.md` at session start. To make the skill discoverable even before description matching, add to the project (or global) AGENTS.md:

```markdown
## Available skills
- html-to-pptx: located at ~/.codex/skills/html-to-pptx (or .codex/skills/html-to-pptx in this repo).
  Use it for any HTML deck/page -> PPTX conversion. Read its SKILL.md and follow the vector or
  raster workflow; deck-specific settings go in a JSON config, never in script edits.
```

## Frontmatter compatibility

Only `name` + `description` are used (portable Agent Skills subset). Codex-specific extras (e.g. `trigger` fields seen in community examples) are intentionally absent so the same folder loads unchanged in Claude Code and other agents. Keep Codex-specific guidance in this file.

## Usage notes for Codex sessions

- Measure first: launch headless Chromium with `--remote-debugging-port`, then `node scripts/extract.mjs <html> <work>/ir [config]` (vector) or the capture/stitch/build chain (raster).
- Codex sandboxing: allow network localhost (CDP) and file writes to the work dir; browser launch needs process spawn permission.
- Verify output with a geometry audit or PowerPoint export; intentional bleed/overlap per `references/mapping.md` is not a defect.
- Run `node tests/smoke.mjs <port>` after any script change.