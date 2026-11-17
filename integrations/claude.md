# Claude Code integration

## Install

Personal (all projects):

```
git clone https://github.com/Xinghua516/html-to-pptx ~/.claude/skills/html-to-pptx
```

Project (shared via repo): clone or copy into `<project>/.claude/skills/html-to-pptx`. Symlinked skill folders are supported: the `<skill-name>` entry may point at a checkout elsewhere (e.g. this repo working copy).

Windows personal path: `C:\Users\<you>\.claude\skills\html-to-pptx`.

Requirements inside the skill folder: `SKILL.md` at its root (this repo satisfies that directly), plus `scripts/`, `references/`, `examples/`, `tests/`. Run `npm install` and `pip install -r requirements.txt` once in the skill folder (or any parent whose `node_modules` resolves).

## Load and refresh

Claude Code scans personal and project skill directories at session start. After installing or editing, restart the session (or use the skills refresh command your version provides). Verify by asking "which skills do you have" or listing skills.

## Invocation

- Automatic: the frontmatter `description` is the trigger. Requests like "convert this HTML deck to PPTX", "把 html 转成可编辑 pptx", "原封不动转 pptx" match it and load the full body.
- Explicit: `/html-to-pptx` (the folder/frontmatter name becomes the command).

## Frontmatter compatibility

This skill uses only `name` + `description`, the portable subset of the Agent Skills spec. Claude-specific optional fields (`disable-model-invocation`, `allowed-tools`, dynamic `` !`cmd` `` injection) are intentionally unused so the same folder works unchanged in other agents. Do not add Claude-only fields to the shared SKILL.md; put Claude-specific guidance here instead.

## Usage notes for Claude sessions

- Follow SKILL.md workflows verbatim: measure layout in headless Chromium first; never hand-roll OOXML.
- Start the browser yourself before extract/capture: `msedge --headless=new --disable-gpu --user-data-dir=<scratch> --remote-debugging-port=9226 --window-size=1600,900 about:blank` (or chrome equivalent).
- Deck-specific behavior belongs in a JSON config passed as the last argument; see `examples/deck.config.json`. Do not edit scripts to fit one deck.
- Verify with PowerPoint COM export or a geometry audit; interpret intentional bleed/overlap per `references/mapping.md`.
- Run `node tests/smoke.mjs <port>` after any script change.