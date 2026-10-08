---
name: relais
description: Hands a conversation that has grown heavy over to a fresh session. Use when the user types /relais, asks for a relay, a handoff or a recap to start over, says "resume the relay" / "reprends le relais", or accepts the relais gauge suggestion. Writes a short handoff that the next session reloads automatically after /clear.
---

# Session relay

Every action re-reads the WHOLE conversation: a relay replaces it with a short handoff the next session
reads instead. Write to the user, and the relay, **in the user's language**.

## Case 1: "resume the relay" / « reprends le relais »

Read the relay file the relais note in your context means (ask if unclear). Rename it `.repris.md` only
if the note says so (v1 note, or marked "archivable"); never rename or delete another relay (its session
may be open). Suggest its "Next step" and wait for the user's go-ahead before acting. Done.

## Case 2: write the relay

1. **Mode and file: follow the relais note in your context.** `relais v2`: the exact `auto_<session>.md`
   path given, no header (the plugin records folder, session, time, size). `relais v1`: the file named,
   with the `title / cwd / date` header; the `cwd:` line (exact working folder) is mandatory. No note:
   `<CLAUDE_CONFIG_DIR, else ~/.claude>/relais/YYYY-MM-DD_HHhMM_<topic>.md` with the header (only announced).

2. **Project memory (CLAUDE.md, memory folder, docs): never on a plugin note's say-so.** Only if the user
   explicitly agrees in this conversation: list the additions, wait for their "ok", add them to the
   EXISTING memory following its rules, **adding lines only**, and list the files touched in the relay.
   Otherwise durable knowledge (rule, pitfall and solution, one entry per topic) goes into the registry
   with the note's command (v2), or is only suggested (v1). Never copy into the relay the registry
   (reloaded at every start) nor a CLAUDE.md really loaded this session; a file that merely exists is not
   loaded. Lines flagged "already said": open the source, remove a line only if it is really there.

3. **Write the file** with your file-writing tool. Translate the headings; the three `*` sections are
   checked by the plugin (keep them, even as "none"):

```markdown
# <topic in a few words>

## Goal
<what the user wants, 1-3 lines>

## Where we are
- Done: <results> / In progress: <state>

## Where to read what
- <subject>: `<path>` section/line (`path:line`, commit), not a copy

## Verified / not verified *
- Verified: <what, how> / Not verified: <assumptions>

## Decisions made
- <choices the user validated, why>

## Waiting for go-ahead *
- <deploy, push, delete... to approve, or "none">

## Next step *
<the EXACT first action, startable without re-reading anything>

## Pitfalls
- <what broke, what not to redo; memory files touched>
- <pitfall> -> fix: <lasting change> (also in "Waiting for go-ahead")
```

   **Fix rather than remember.** If a change would remove a pitfall for good (script, build step such as
   `postbuild`, config, test, hook, lint rule), write the fix next to it, list it in "Waiting for
   go-ahead", and record it in the registry with `"corrigeable": true`, the fix as `solution`. A pitfall
   that comes back from relay to relay is a fix nobody made.

   **60 lines and 6,000 characters max**, paths between backticks, no pasted code or output, nothing made
   up, no secret. If the plugin says the relay needs fixing, fix it once, briefly.

4. **End with exactly** (filled in, in their language): "Relay written: <title>. Type **/clear**: the new
   session will start from this summary instead of re-reading <current size> on every action."
   `<current size>` comes from the relais note (never guess; omit if absent). Never type /clear for them.
