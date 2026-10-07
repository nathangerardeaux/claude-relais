# relais — stop paying for Claude Code to re-read your conversations

*[Version française](README.fr.md)*

**relais** is a Claude Code plugin that sharply cuts token usage without changing how you work. It
watches the size of the conversation, warns you at the right moment, has Claude write a short
handoff of what was done, then starts a light session that picks up from that handoff by itself.

- 100% local: no network access, nothing sent anywhere.
- A few small readable scripts, no dependency to install.
- Messages in English or French (follows the system language).
- Windows, macOS and Linux.

*"Relais" is French for "relay", as in a relay race: one session hands the baton to the next.*

[![relais overview video (1 min, in French)](docs/relais-video.png)](docs/relais.mp4)

*One-minute video with music (in French): the problem, the relay, measured savings, delegating long tasks. Source: [video/](video/) (Remotion).*

**Also in this repo:** the **avocat** plugin ([plugins/avocat](plugins/avocat/README.md)): a devil's advocate mode. While it is on, an independent read-only agent tries to refute every Claude answer before it is final. `/plugin install avocat@claude-relais`, then `/avocat on`.

---

## Contents

1. [The problem: why Claude Code gets so expensive](#1-the-problem-why-claude-code-gets-so-expensive)
2. [What relais does](#2-what-relais-does)
3. [How much it saves](#3-how-much-it-saves)
4. [Installation](#4-installation)
5. [Day-to-day use](#5-day-to-day-use)
6. [The relay file](#6-the-relay-file)
7. [Settings](#7-settings)
8. [Measure your own savings](#8-measure-your-own-savings)
9. [Privacy and security](#9-privacy-and-security)
10. [relais, /compact or /clear?](#10-relais-compact-or-clear)
11. [Troubleshooting](#11-troubleshooting)
12. [Limits](#12-limits)
13. [Tests and license](#13-tests-and-license)

---

## 1. The problem: why Claude Code gets so expensive

Claude Code does not "remember" the conversation: **on every action** (reading a file, running a
command, editing code) it sends the **whole** conversation from the start back to the model. Caching
makes that re-read cheaper, but it is still billed, and it happens hundreds of times.

A simple calculation:

| Conversation size | Actions in a day | Tokens re-read |
|---|---|---|
| 50k | 300 | 15 million |
| 500k | 300 | **150 million** |

Same work, ten times the tokens, only because the conversation was never restarted. With
one-million-token context windows, a conversation can keep growing for days before Claude Code
summarizes it on its own.

**Real measurement** (the author's own history, 3 weeks, 103 sessions):

- **97%** of the tokens consumed were **history re-reads**;
- less than 1% was text actually written by the model;
- the biggest conversation re-read **508k tokens per action** on average, over 10,016 actions.

You are barely paying for the work produced: you are mostly paying for re-reading a huge history,
again and again.

---

## 2. What relais does

```mermaid
graph LR
  A[You send a message] --> B{Gauge: conversation size}
  B -->|below 150k| C[Nothing, complete silence]
  B -->|above 150k| D[Reminder: consider /relais]
  D --> E[/relais: Claude writes a summary, 60 lines max/]
  E --> F[You type /clear]
  F --> G[Fresh session: the summary is reloaded automatically]
```

**1. The gauge** (on every message you send)
It reads the end of the local conversation log and measures how many tokens the last response had to
re-read. Below 150k: nothing. Above: an on-screen reminder, plus a short note for Claude, which will
suggest `/relais` at the right time (at the end of a step, not in the middle). One reminder per
threshold (150k, 250k, then every +100k), never on every message. It reads a 200 MB log in under
0.2 seconds.

**2. The `/relais` command**
Claude writes a summary of 60 lines max into this session's own file (`auto_<session>.md`, path given
by the plugin): goal, where things stand, where to read what, verified / not verified, decisions,
what waits for your go-ahead, the exact next step, pitfalls. It writes in the project's memory only if
you explicitly agree in the conversation (it suggests, you say ok), **additions only**. It then tells you to
type `/clear`. When the relay is (re)written, a check runs: too long, a required section missing or a
possible secret, and Claude is told **once** while it can still fix it.

**3. Automatic resume (v2: per session)**
After `/clear`, the new session only considers **the relay written by the session you just cleared**.
If it is fresh (written less than 30 min before `/clear` and less than 20k tokens of conversation after
it), it is reloaded; otherwise (stale relay, or `/clear` long after: most likely a change of topic) it is
only pointed to, and "resume the relay" loads it. Either way a short note of checks made by code comes
with it: lines deleted in the project memory, possible secret, freshness gap and files changed since
(git), cited path not found, number of items waiting in `a-ranger.md`. Everything fits in 8,000
characters. The relay is used **only
once** (then archived). Relays of other sessions (parallel tab, old relay) are only **announced**,
never loaded nor archived: say "resume the relay" to load one. A `/clear` in a session that wrote no
relay loads nothing.

**4. Delegating long tasks (since 2.1.0)**
At the start of each session (startup, `/clear`, compaction), Claude gets a note of about 90 tokens,
**once**. It says that a long task (more than about ten reads or steps) that does not need the history
goes to a cheaper subagent (Sonnet, or Haiku for a plain inventory), with a self-contained brief and a
short result. Short tasks, anything that depends on the history, questions and whatever awaits your
go-ahead stay in the conversation. The files read by the subagent never enter the conversation: it stays
light for what comes next.

---

## 3. How much it saves

Simulation on the author's 5 biggest real conversations, relaying every time the conversation was
above 150k when a message was sent (measured fresh session: ~41k):

| Conversation | Actions | Re-read per action (average) | Re-read tokens: real → with relais | Saving |
|---|---|---|---|---|
| 1 | 28,308 | 521k | 14,756 M → 3,307 M | **-78%** |
| 2 | 10,016 | 508k | 5,086 M → 1,066 M | **-79%** |
| 3 | 4,667 | 507k | 2,367 M → 1,170 M | -51% |
| 4 | 1,035 | 408k | 423 M → 107 M | -75% |
| 5 | 724 | 556k | 402 M → 73 M | -82% |
| **Total** | | | **23,034 M → 5,723 M** | **-75%** |

Conversation 3 saves less because it contains long stretches of autonomous work with no message from
the user: a relay can only happen when you write.

The plugin itself costs about **230 tokens per session** (90 of them for the delegation note), and
about 1,000 when you run `/relais`.

**Delegating long tasks**, measured with `claude -p` on identical copies of one session (Opus as the
main model, API-equivalent prices, details in [docs/delegation.md](docs/delegation.md)):

| Task | Without the note | With the note | Conversation afterwards |
|---|---|---|---|
| Read 13 files, 112k session | $1.57 | **$1.25 to $1.32 (-16 to -20%)** | 190k → **132k** |
| Review 26 files, 112k session | $1.90 | **$1.47 to $1.49 (-22%)** | 215k → **135k** |
| Read 13 files, 35k session | $0.73 | **$0.45 (-39%)** | 97k → **38k** |
| Task of 1 to 5 calls | unchanged | unchanged: not delegated | |

Quality was the same on the automatically scored task (13 files out of 13, exact exported names).

Measure your own numbers with the simulator: [section 8](#8-measure-your-own-savings).

---

## 4. Installation

### Requirements

- Claude Code with plugin support (the `/plugin` command).
- **Node.js 18 or newer** on the PATH (`node --version`). The hooks are small Node scripts.

### Install from GitHub (recommended)

In Claude Code:

```
/plugin marketplace add nathangerardeaux/claude-relais
/plugin install relais@claude-relais
```

Or from a terminal:

```
claude plugin marketplace add nathangerardeaux/claude-relais
claude plugin install relais@claude-relais
```

Then **restart Claude Code** (the plugin only acts in sessions opened after installation). Check:

```
claude plugin list
```

`relais` should show up as loaded.

### Fallback install (external or network drive)

Claude Code refuses to install a plugin from a location it considers "network-shaped" (for example an
external drive on Windows). In that case, copy the plugin into your home folder, where Claude Code
loads it by itself:

```
node <plugin-path>/scripts/installer.mjs
```

It will show up as `relais@skills-dir`. To update: same command with `--update`.

**Do not install both** (marketplace AND fallback): the hooks would run twice.

### Uninstall

- GitHub install: `/plugin uninstall relais@claude-relais`
- Fallback install: delete the `~/.claude/skills/relais/` folder

Your written relays stay in `~/.claude/relais/`: delete that folder if you no longer want them.

---

## 5. Day-to-day use

Work as usual. As long as the conversation stays light, relais says nothing.

**When the conversation goes above 150k**, you see:

> Relay: this conversation is 180k tokens, re-read on every action. Consider /relais once the current
> step is done.

Claude finishes what it is doing, then suggests the relay in one line. Nothing happens without you.

**Above 250k**, the reminder becomes more insistent.

**To hand over:**

1. type `/relais`;
2. Claude writes the summary and confirms: "Relay written: … Type /clear";
3. type `/clear`;
4. the session restarts with "Relay resumed: …", and Claude carries on with the next step.

**The tally (since 1.3.0)**: on resume, relais recalls how much the previous conversation re-read, then,
after the first answer of the new session, shows once:

> Relay tally: before 182k tokens re-read on every action, now 31k. Freed: 151k per action (-83%).

"Now" is measured, not estimated: it is what the new session really re-reads (system instructions +
relay + your first request).

**The right reflex**: hand over **between two steps** (a finished feature, a fixed bug, a change of
topic), not in the middle of an edit.

**Switching topics**: if you move on to something completely different, a plain `/clear` is enough,
no relay needed.

---

## 6. The relay file

Location: `~/.claude/relais/` (on Windows: `%USERPROFILE%\.claude\relais\`), one file per session:
`auto_<session>.md`. The format below is the v1 one; v2 adds three sections, the ones the check requires
(headings in French or English): **Verified / not verified**, **Waiting for go-ahead**, **Next step**,
plus **Where to read what** (exact file and section per subject). See `skills/relais/SKILL.md`.

```markdown
---
title: Mobile menu that does not scroll
cwd: /home/me/projects/site
date: 2026-09-30 14:05
---

## Goal
Make the site menu scroll on phones instead of moving the page behind it.

## Where we are
- Done: CSS fix, checked on 5 screen sizes.
- In progress: nothing.

## Decisions made
- The submenu joins the mobile menu from 900 px (validated).

## Files touched
- `src/index.css`: bounded height + inner scrolling (committed, not deployed yet)

## Next step
Build the site, then deploy it.

## Pitfalls and watch-outs
- Deployment waits for the go-ahead.
```

- v2 never trusts what Claude writes for the folder or the session: the scripts record the real
  folder, session, time, context size and git HEADs (project and memory) in `.etat/`. The `cwd:` line
  only serves v1-style relays, which are announced (less than 72 h after `/clear`, 12 h in a new tab).
- `a-ranger.md`: durable proposals written in auto mode (Claude never touches the memory then). Kept,
  never archived; filed into the memory only with your agreement.
- After use a relay is renamed `.repris.md`: you keep a history of your relays.
- It is a plain text file: you can read or correct it before typing `/clear`.

---

## 7. Settings

Since 1.2.0 the relay is **automatic**: at each threshold, Claude finishes the current request, then writes (or refreshes) the relay itself in a single file per conversation (`auto_<session>.md`). You only type `/clear` whenever you want. In auto mode Claude writes no memory file: durable proposals go to `a-ranger.md`.

Six optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `RELAIS_V2` | `1` | `0` = exact v1 behaviour (emergency switch, then restart Claude Code) |
| `RELAIS_AUTO` | `1` | `0` = back to simple reminders (you type `/relais` yourself) |
| `RELAIS_SEUIL_K` | `150` | First reminder, in thousands of tokens |
| `RELAIS_SEUIL_FORT_K` | `250` | Insistent reminder |
| `RELAIS_DELEGUER` | `1` | `0` = no note about delegating long tasks |
| `RELAIS_LANG` | from the system | `en` or `fr` |

The easiest place is the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "RELAIS_SEUIL_K": "120",
    "RELAIS_LANG": "en"
  }
}
```

**Which threshold?** On the measured conversations: 100k = -83%, 150k = -79%, 250k = -71%. The lower
the threshold, the more you save, but the more often you hand over. 150k is a good balance.

---

## 8. Measure your own savings

The simulator replays your real past conversations (read-only, nothing is modified):

```
node <plugin-path>/scripts/simuler-economie.mjs --top 5
```

It finds your 5 heaviest conversations in `~/.claude/projects/`, measures what a fresh session costs
you, and prints the saving the relay would have given. For one specific conversation, with another
threshold:

```
node <plugin-path>/scripts/simuler-economie.mjs <log.jsonl> 120
```

To see your real usage in dollars: [ccusage](https://github.com/ryoppippi/ccusage)
(`npx ccusage@latest claude daily`).

---

## 9. Privacy and security

- **No network access.** None of the scripts opens a connection or sends anything.
- **What is read**: the end of the conversation log Claude Code already keeps on your disk
  (`~/.claude/projects/…`), only to read the token counter of the last response; and, read-only with a
  3 s timeout, `git` in the project folder and in its memory folder (HEAD, changed files, deleted lines).
  These calls neutralise every configuration option a trapped repository could use to run a program
  (fsmonitor, filters, external diff, pager, hooks...) and never make git convert the working tree. Paths
  cited in a relay are only checked if they are local (never `\\server\share`, nor URLs).
- **What is written**: relay files in `~/.claude/relais/`, and tiny state files in
  `~/.claude/relais/.etat/` (deleted after 7 days). Nothing else: the plugin **never writes in your
  project nor in its memory**, and never undoes anything (its checks only warn).
- **What is added to Claude's context**: a one-line note when a threshold is crossed, and the content
  of a relay when you resume it.
- A relay contains information about your project (paths, decisions). It stays on your machine.
  Claude is instructed to put **no secrets** in it (password, token, key), but re-read it if your
  project is sensitive.
- On any error, the hooks stay silent: they **never** block a message or a session.
- The code is a few short files in `scripts/`: read them before installing.

---

## 10. relais, /compact or /clear?

| | `/clear` alone | `/compact` | **relais** |
|---|---|---|---|
| Starting size afterwards | minimal | reduced, but the conversation keeps growing | minimal + summary |
| Keeps the thread of the work | no | yes, automatic summary | yes, structured summary |
| Warns you at the right time | no | no (automatic only near the window limit) | **yes, from 150k** |
| Updates durable notes | no | no | only with your explicit agreement, additions only |
| Readable, editable trace | no | no | yes, one file per relay |

`/compact` is still useful in the middle of a long task. relais is mostly about **never letting a
conversation grow unnoticed again**, which is where the bill really comes from.

---

## 11. Troubleshooting

**I never see a reminder.**
Check `claude plugin list` (relais loaded?) and that the session was opened **after** installing.
While the conversation stays under 150k, silence is normal. Some interfaces (editor extensions,
third-party apps) do not display hook messages: Claude still receives the note and will suggest
`/relais` itself.

**`node` not found.**
Install Node.js 18+ and check that `node --version` works in a new terminal.

**`network-shaped` error when installing.**
The plugin sits on an external or network drive: use the fallback install (section 4).

**Reminders show up twice.**
The plugin is installed twice (marketplace and fallback). Keep only one.

**The relay is not reloaded after /clear.**
v2 reloads only `auto_<id of the cleared session>.md`. Check that it exists in `~/.claude/relais/`
(already used: `.repris.md` suffix). Other relays are only announced: say "resume the relay". If two
sessions of the same folder are cleared within a few seconds, nothing is loaded (ambiguous), on purpose.

**Debugging the hooks**: run `claude --debug`, or `/debug` during a session.

---

## 12. Limits

- relais **does not hand over for you**: that is deliberate, you stay in control. The saving depends
  on your reflex to type `/relais` when it is suggested.
- During a long autonomous run with no message from you, the gauge does not fire (it acts when you
  write).
- Summary quality depends on the model. The imposed format (60 lines, exact next step) limits losses,
  but a detail can slip: re-read the relay for critical tasks.
- The savings in section 3 are **simulations** on a real history, not a guarantee.

---

## 13. Tests and license

```
node plugins/relais/scripts/tester.mjs
```

97 tests in a temporary folder with throw-away git repositories (never your real `~/.claude`): the 27
v1 tests (run with `RELAIS_V2=0`), then v2: normal resume, two parallel sessions, `/clear` to change
topic, SessionEnd/SessionStart race in both orders, relay without header, too long (Stop check and
8,000-character budget), stale relay with git file list, deleted memory lines, `a-ranger.md`, secret
without masking, missing path, `/relais` gets its exact file, trapped git repository, UNC path never probed, `cd` during the session, slow git. `RELAIS_V2=0 node scripts/tester.mjs`
runs the v1 suite only.

MIT license.
