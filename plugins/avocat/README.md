# avocat — a devil's advocate that checks Claude

*[Version française](README.fr.md)*

One switch. While it is on, Claude may not conclude an answer before an independent agent has tried
to take it apart: facts, numbers, code behaviour, "it is fixed", "the test passes", actions taken on
your files.

## Turn it on / off

- in the **relais dashboard**, "Avocat du diable" tab;
- or in Claude Code: `/avocat on`, `/avocat off`, `/avocat` (status);
- or in a terminal: `node scripts/basculer.mjs on|off|status`.

Immediate, no restart needed. The state lives in `~/.claude/avocat/etat.json`.

## How it works

1. At the end of every answer, a `Stop` hook reads the switch. Off: it does nothing.
2. On: it blocks the stop and asks Claude to launch the `avocat-du-diable` agent with your request,
   its answer and its verifiable claims.
3. The agent (**read-only** tools: Read, Grep, Glob, WebFetch, WebSearch) tries to refute each claim
   with evidence (`file:line`, URL) and lists what is missing or risky.
4. Claude fixes what is wrong, flags what stays doubtful and ends with
   "Devil's advocate on: X confirmed, Y fixed, Z doubtful (/avocat off to switch it off)."

While the check runs, Claude Code also shows "Devil's advocate on…": you always know why an answer
uses more tokens.

Safeguards: never loops (an answer is checked once); short answers with no action (under 200
characters, no file edited, no command run) are not checked (`AVOCAT_MIN_CAR` to change it); an
unreadable switch file counts as off.

## Cost

Each checked answer = one more agent pass, so more tokens. Switch it on where a mistake is expensive
(security, production, numbers, teaching material), then off.

## Install

"Skills" tab of the relais dashboard (Install button), or `/plugin install avocat@claude-relais`.
Restart Claude Code afterwards. Tests: `node scripts/tester.mjs`.
