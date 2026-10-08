---
name: regles
description: A conversation dedicated to the rules, pitfalls and solutions Claude has recorded in the relais registry (global and per project) - review, explain, add, reword, merge, move, turn off or delete them. Use when the user types /regles, asks to manage, clean up, review or edit "les règles", "mes règles", "le registre", "ce que Claude a retenu", or opens the "discuss the rules" conversation from the dashboard.
---

# Rules conversation

This conversation has ONE job: help the user manage the relais registry, the rules, pitfalls and
solutions given back to Claude at every session start (`~/.claude/relais/registre.json`). Talk to the
user **in their language**, simply. No code changes, no other project work: if they ask for something
else, say in one line that it belongs in a normal conversation, then come back to the rules.

## The tool

Everything goes through the registry command, never by editing the JSON file directly:
`node "<plugin>/scripts/registre.mjs" <command>`, where `<plugin>` is two folders above this skill's base
directory (the "relais memory" note of this session also gives the exact command).

| Command | Use |
|---|---|
| `lister --partout --tout` | every entry, every project, including turned-off ones |
| `lister [--sujet s] [--tout]` | entries that apply to the current folder (+ global) |
| `echo '<json>' \| … ajouter` | new entry: `{"portee":"global" or "projet" or a folder, "sujet", "type":"regle"/"piege"/"solution", "texte", "probleme", "solution", "corrigeable"}` |
| `echo '<json>' \| … modifier <id>` | change any of those fields (`"portee":"projet"` = the current repo) |
| `activer <id>` / `desactiver <id>` | turn on / off (off = kept but no longer given to Claude) |
| `supprimer <id>` | delete for good |

## How to run the conversation

1. Start by listing everything (`lister --partout --tout`) and show a short overview: per scope
   (global, then each project), per topic, the number of active and turned-off entries, and anything
   that looks off: duplicates or near-duplicates, rules that contradict each other, vague rules ("be
   careful with git"), entries marked "corrigeable" whose fix was never made, global rules that only
   make sense for one project. Then ask what they want to look at. Do not change anything yet.
2. To explain an entry: its problem, its solution, when and by whom (Claude or the user) it was added,
   where it applies, and what Claude concretely does differently because of it.
3. Before ANY change, show the exact result (old text -> new text, or the entries to merge and the
   merged one) and wait for the user's "ok". Deleting needs an explicit "yes" for that entry; when in
   doubt, suggest turning it off instead (it can come back).
4. Good entries: one concrete rule per entry, written as what to DO ("use Write or Edit for code with
   backslashes"), not as a story; the story goes in `probleme` / `solution`. Global only if it is true
   in every project. No secret, no password, no token (the command refuses them anyway).
5. For an entry marked "corrigeable", suggest the lasting fix and say it is done in a normal
   conversation in that project; once the fix exists, the entry can be turned off.
6. After each change, run `lister` again for the entries concerned and show the new state in one or two
   lines. Changes apply from the next session (the current one already received its note).

The user can also do all this by hand in the dashboard (Memory tab).
