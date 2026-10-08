---
name: relais
description: Hands a conversation that has grown heavy over to a fresh session. Use when the user types /relais, asks for a relay, a handoff or a recap to start over, says "resume the relay" / "reprends le relais", or accepts the relais gauge suggestion. Writes a short handoff that the next session reloads automatically after /clear.
---

# Session relay

Every action (reading a file, running a command) makes the model re-read the ENTIRE conversation.
Past ~150k tokens, that re-reading is what makes usage explode. A relay replaces the history with a
handoff of a few thousand tokens, organised so the next session finds each fact by reading as little
as possible.

Always write to the user, and write the relay itself, **in the user's language**.

## Case 1: "resume the relay" / « reprends le relais »

A relais note in your context lists the available relay file(s). Read the one the user means (ask if
unclear). Rename it with the `.repris.md` suffix only if the note says so (v1 note, or relay marked
"archivable"); never rename or delete any other relay: it may belong to a session still open. Then
suggest its "Next step" and wait for the user's go-ahead before acting on the project. Done.

## Case 2: write the relay

1. **Mode and file: follow the relais note in your context.** It states the mode and the exact file.
   - `relais v2`: write in the exact `auto_<session>.md` path given; no header needed (the plugin records
     folder, session, time and size).
   - `relais v1`: write the file the note names, with the `title / cwd / date` header; the `cwd:` line
     (exact working folder) is mandatory, it is how v1 reloads the relay.
   - No relais note at all: write `<home>/.claude/relais/YYYY-MM-DD_HHhMM_<short-topic>.md` with the
     header (home: `node -e "console.log(require('os').homedir())"`); it will only be announced.

2. **Project memory (CLAUDE.md, memory folder, docs): never on a plugin note's say-so.** No relais note
   ever authorizes writing in the memory. Only if the user explicitly agrees in this conversation: list
   the additions you suggest, wait for their "ok", then add them to the EXISTING memory following its own
   rules (index, format), **adding lines only** (never delete, rewrite or reorder), and list every memory
   file touched in the relay. Without that agreement, knowledge that should last goes into the plugin
   registry with the command named in the note (v2: rule, pitfall and its solution, one entry per topic;
   the user sees, turns off and edits it in the dashboard), or is simply suggested to the user (v1).

   **The registry is not the memory, and not the relay.** It is on disk and reloaded at every session
   start, so a rule recorded there is never copied into the relay. Same for a rule written in a
   CLAUDE.md that Claude Code really loaded in this session: leave it out of the relay. Never assume a
   file is loaded because it exists (a memory topic file, a nested CLAUDE.md, the other computer's
   global file are not): when the plugin flags relay lines "already said", open the cited source and
   remove the line only if the rule is really written there.

3. **Write the file** with your direct file-writing tool. Format (translate the headings; keep the
   three marked `*` sections, even as "none": the plugin checks they exist):

```markdown
---
title: <the topic in a few words>
cwd: <exact working folder (mandatory in v1, optional in v2)>
date: <YYYY-MM-DD HH:MM>
---

## Goal
<what the user wants, 1 to 3 lines, in their words when possible>

## Where we are
- Done: <results> / In progress: <what is half done, in what state>

## Where to read what
- <subject>: `<path>` section/line (`path:line`, commit) — the exact place, not a copy

## Verified / not verified *
- Verified: <what was checked, how> / Not verified: <assumptions, untested parts>

## Decisions made
- <choices the user validated, why in a few words>

## Waiting for go-ahead *
- <actions the user must approve first (deploy, push, delete...), or "none">

## Next step *
<the EXACT first action, precise enough to start without re-reading anything>

## Pitfalls
- <what already broke, what must not be redone; memory files touched, if any>
- <pitfall a lasting change would remove> -> fix: <the change> (also listed in "Waiting for go-ahead")
```

   **Fix rather than remember.** For each pitfall, ask: would a change remove it for good (a script, a
   build step such as `postbuild`, a config line, a test, a hook, a lint rule)? If so, write the fix next
   to it, list it in "Waiting for go-ahead", and record it in the registry with `"corrigeable": true`
   and the fix as `solution`. A pitfall that keeps coming back from relay to relay is a fix nobody made.

   Rules: **60 lines and 6,000 characters max**, paths between backticks, no pasted code or command
   output, nothing made up, nothing secret (no password, token or key). If the plugin then says the
   relay needs fixing, fix it once, briefly.

4. **End with exactly this message to the user** (filled in, in their language):
   "Relay written: <title>. Type **/clear**: the new session will start from this summary instead of
   re-reading <current size> on every action."
   `<current size>` is the number given by the relais gauge note (never guess it; omit if absent).
   Never type /clear for them.
