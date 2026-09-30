---
name: relais
description: Hands a conversation that has grown heavy over to a fresh session. Use when the user types /relais, asks for a relay, a handoff or a recap to start over, says "resume the relay" / "reprends le relais", or accepts the relais gauge suggestion. Writes a short handoff that the next session reloads automatically after /clear.
---

# Session relay

Every action (reading a file, running a command) makes the model re-read the ENTIRE conversation.
Past ~150k tokens, that re-reading is what makes usage explode. A relay replaces the history with a
handoff of a few thousand tokens.

Always write to the user, and write the relay itself, **in the user's language**.

## Case 1: "resume the relay" / « reprends le relais »

The gauge announced a relay file (its path is in your context). Read it, then rename it with the
`.repris.md` suffix (same name, `.md` replaced by `.repris.md`) so it is not loaded twice. Continue with
its "Next step". Done.

## Case 2: write the relay (/relais)

1. **Durable notes first.** If this conversation produced a decision, a pitfall or a project state that
   must outlive the next session, update the project's durable notes first (CLAUDE.md, a memory
   folder, docs: whatever this project already uses). The relay is for continuing, not for archiving.

2. **Write the file** `<home>/.claude/relais/YYYY-MM-DD_HHhMM_<short-topic>.md`, where `<home>` is the
   user's home folder (if unsure: `node -e "console.log(require('os').homedir())"`). Use your direct
   file-writing tool. Exact format (translate the headings into the user's language):

```markdown
---
title: <the topic in a few words>
cwd: <current working folder, full path>
date: <YYYY-MM-DD HH:MM>
---

## Goal
<what the user wants to achieve, 1 to 3 lines, in their words when possible>

## Where we are
- Done: <results obtained, verified or not: say which>
- In progress: <what is half done, and in what state>

## Decisions made
- <choices the user validated, and why in a few words>

## Files touched
- `<path>`: <what changed> (committed? deployed?)

## Next step
<the EXACT first action, precise enough to start without re-reading anything>

## Pitfalls and watch-outs
- <what already broke, what must not be redone, what waits for the user's go-ahead>
```

   Rules: **60 lines max**, no pasted code or command output (paths and facts only), nothing made up,
   nothing secret (no password, token or key). The `cwd:` line must be the exact working folder: it is
   how the next session finds this relay.

3. **End with exactly this message to the user** (filled in, in their language):
   "Relay written: <title>. Type **/clear**: the new session will start from this summary instead of
   re-reading <current size> on every action."
   Never type /clear for them.
