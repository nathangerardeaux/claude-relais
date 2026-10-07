---
name: avocat
description: Turns devil's advocate mode on or off (while on, an independent agent tries to refute every Claude answer before it is final). Use when the user types /avocat, /avocat on, /avocat off, asks to activate, deactivate or check the devil's advocate / « avocat du diable », or asks for every answer to be cross-checked from now on.
---

# Devil's advocate switch

Speak to the user **in their language**.

The switch is one script, two folders above this skill's base directory (shown when the skill loads):
`<skill base directory>/../../scripts/basculer.mjs`.

- `/avocat on` (or "active l'avocat du diable"): run `node "<that path>" on`
- `/avocat off` (or "désactive"): run `node "<that path>" off`
- `/avocat` alone or "is it on?": run `node "<that path>" status`

Then repeat the script's one-line answer to the user, nothing more.

When turning it ON, add one line: each answer will now cost an extra verification pass (more tokens),
so it is best switched off once the sensitive part is done.

If the script cannot be found, write the state file directly with your file-writing tool:
`<home>/.claude/avocat/etat.json` containing `{"actif": true, "depuis": "<ISO date>"}` (or `false` to switch off).

How it works, if the user asks: a Stop hook checks the switch at the end of each answer. While it is on,
Claude must hand its answer to the `avocat-du-diable` agent (read-only: it reads the real files, docs
and web sources), fix what is proven wrong, flag what stays doubtful, and end with a one-line tally.
Short answers with no action (under ~200 characters, no file edited, no command run) are not checked.
