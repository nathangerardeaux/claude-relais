// "Rules" chat of the Memory tab: a real conversation with Claude, inside the page, about the relais
// registry only. Each message runs `claude -p` (the message on stdin, `--resume <session>` after the first)
// with NO tool, no MCP server, no skill and none of the user's customisations (--safe-mode: no CLAUDE.md,
// no hooks, so the relais hooks do not inject their notes either), and its own system prompt. Claude
// changes nothing: it proposes changes as `relais-action` blocks, the page shows them as cards, and each
// one is applied only when the user clicks it, through the /api/memoire/* routes (same checks as by hand).
// Conversations are saved in their own folder (<claude dir>/relais/regles-chat), so they can be resumed
// and their tokens show up in the Conversations tab like any other.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dossierClaude } from './analyse.mjs';
import { programme } from './gestion.mjs';
import { tr } from './langue.mjs';
import { lireRegistre, TYPES } from './memoire.mjs';

export const MAX_MESSAGE = 4000;
export const MAX_ACTIONS = 10;
const MODELE = 'sonnet'; // fast and cheap enough for this narrow job
const DELAI = 5 * 60e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const dossierChat = () => path.join(dossierClaude(), 'relais', 'regles-chat');

export const CADRE = `You are the "rules" assistant of Relais, built into the Memory tab of its dashboard. Your ONE job: help the user manage the relais registry, the rules, pitfalls and solutions given back to Claude Code at every session start (global ones, and ones for a single project folder). Talk in the user's language and register (a French user who says "tu" gets "tu"), simply and briefly. The page shows plain text: short paragraphs and "- " lists, **bold** and \`code\` are the only formatting it renders (no headings, no tables). Name entries by their topic and text, never by their id (ids only go inside the proposal blocks). You have no tools and cannot read any file: all you know about the registry is the JSON the dashboard puts in the user's messages (<registre>...</registre>), always the latest state; when a message has none, the last one you received is still current. If the user asks for anything else, say in one line that it belongs in a normal Claude Code conversation, then come back to the rules.

## Entries
Fields: id; portee ("global" or an absolute project folder); sujet (short topic); type ("regle", "piege" = pitfall, "solution"); texte (the rule itself, one line, 300 characters max); probleme and solution (the story, 800 max each); actif (false = kept but no longer given to Claude); corrigeable (a lasting fix should be made so the entry is no longer needed); origine ("claude" or "utilisateur"); cree and maj (dates).

## How to help
1. Asked for an overview: per scope (global, then each project), per topic, the number of active and turned-off entries, then anything that looks off: duplicates or near-duplicates, rules that contradict each other, vague rules ("be careful with git"), "corrigeable" entries whose fix was never made, global rules that only make sense for one project. Then ask what they want to look at.
2. To explain an entry: its problem, its solution, when and by whom it was added, where it applies, and what Claude concretely does differently because of it.
3. Good entries: one concrete rule per entry, written as what to DO ("use Write or Edit for code with backslashes"), not as a story; the story goes in probleme / solution. Global only if it is true in every project. Never a secret, password or token (refused anyway).
4. For a "corrigeable" entry, suggest the lasting fix and say it is made in a normal conversation in that project; once it exists, the entry can be turned off.

## Changing the registry
You never change anything yourself: you PROPOSE. The page turns each proposal into a card with an "Apply" button, and nothing happens until the user clicks it. Before each proposal, say in plain words what it does, then write it as a fenced block tagged relais-action holding ONE JSON object, for example:

\`\`\`relais-action
{"action":"modifier","id":"r1abc","champs":{"texte":"Use Write or Edit for code with backslashes"},"pourquoi":"Says what to do instead of telling a story"}
\`\`\`

The actions:
- {"action":"ajouter","entree":{"portee":"global or an absolute folder","sujet":"...","type":"regle","texte":"...","probleme":"...","solution":"...","corrigeable":false},"pourquoi":"..."}
- {"action":"modifier","id":"...","champs":{only the fields that change, among texte, sujet, type, portee, probleme, solution, corrigeable},"pourquoi":"..."}
- {"action":"desactiver","id":"...","pourquoi":"..."} and {"action":"activer","id":"...","pourquoi":"..."}
- {"action":"supprimer","id":"...","pourquoi":"..."}: only when the user clearly wants it gone; when in doubt, propose "desactiver" (it can come back).
A merge is one "modifier" (or "ajouter") plus a "desactiver" or "supprimer" for each other entry. Only use ids from the latest registry, one block per change, ${MAX_ACTIONS} blocks at most per message. Applied changes show up in the next registry you receive, and Claude follows them from its next session.`;

// ------------------------------------------------------------------ proposals in Claude's answer
const CHAMPS = ['texte', 'sujet', 'type', 'portee', 'probleme', 'solution', 'corrigeable'];
const BLOC = /```relais-action[ \t]*\r?\n([\s\S]*?)```/g;
function champsPropres(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const c = {};
  for (const k of CHAMPS) {
    if (!(k in o)) continue;
    if (k === 'corrigeable') { if (typeof o[k] === 'boolean') c[k] = o[k]; continue; }
    if (typeof o[k] !== 'string') continue;
    if (k === 'type' && !TYPES.includes(o[k])) continue;
    c[k] = o[k];
  }
  return Object.keys(c).length ? c : null;
}
// { texte, actions, ignorees }: the answer with each valid relais-action block replaced by MARQUE + its
// index + MARQUE (the page puts the card right there), and the valid proposals (at most MAX_ACTIONS).
// A proposal on an id missing from the registry, or with nothing usable, is dropped (counted in ignorees).
export const MARQUE = '\u0001';
export function extraireActions(brut, ids = new Set()) {
  const actions = [];
  let ignorees = 0;
  const texte = String(brut || '').replace(BLOC, (_, json) => {
    let a = null;
    try { a = JSON.parse(json); } catch { /* not JSON */ }
    const pourquoi = typeof a?.pourquoi === 'string' ? a.pourquoi.slice(0, 400) : '';
    let ok = null;
    if (a?.action === 'ajouter') { const e = champsPropres(a.entree); if (e?.texte && e.portee) ok = { action: 'ajouter', entree: e, pourquoi }; }
    else if (['modifier', 'activer', 'desactiver', 'supprimer'].includes(a?.action) && typeof a.id === 'string' && ids.has(a.id)) {
      if (a.action !== 'modifier') ok = { action: a.action, id: a.id, pourquoi };
      else { const c = champsPropres(a.champs); if (c) ok = { action: 'modifier', id: a.id, champs: c, pourquoi }; }
    }
    if (!ok || actions.length >= MAX_ACTIONS) { ignorees += 1; return ''; }
    actions.push(ok);
    return `${MARQUE}${actions.length - 1}${MARQUE}`;
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { texte, actions, ignorees };
}

// ------------------------------------------------------------------ one message
// The registry as Claude needs it (no internal bookkeeping), and a hash to send it only when it changed.
function registreCompact() {
  const champs = ['id', 'portee', 'sujet', 'type', 'texte', 'probleme', 'solution', 'actif', 'corrigeable', 'origine', 'cree', 'maj'];
  return lireRegistre().entrees.map((e) => Object.fromEntries(champs.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])));
}
const envoyes = new Map(); // session -> hash of the registry last sent to it
let enCours = false;       // one message at a time

export function valider(b) {
  const message = typeof b?.message === 'string' ? b.message.trim() : '';
  if (!message) return { ok: false, message: tr({ fr: 'Message vide.', en: 'Empty message.' }) };
  if (message.length > MAX_MESSAGE) return { ok: false, message: tr({ fr: `Message trop long (${MAX_MESSAGE} caractères au plus).`, en: `Message too long (${MAX_MESSAGE} characters at most).` }) };
  const session = b.session == null || b.session === '' ? null : String(b.session);
  if (session && !UUID.test(session)) return { ok: false, message: tr({ fr: 'Conversation inconnue.', en: 'Unknown conversation.' }) };
  const dossiers = Array.isArray(b.dossiers) ? b.dossiers.filter((d) => typeof d === 'string' && d.length < 400).slice(0, 50) : [];
  return { ok: true, message, session, dossiers };
}
export const occupe = () => enCours;

// Runs one message; `emettre(evenement)` receives { type: 'session', session } (as soon as claude has
// one: a stopped message keeps its conversation), { type: 'texte', texte } (pieces, as they come), then
// { type: 'fin', session, texte, actions, ignorees } or { type: 'erreur', message }.
// Returns { annuler }: stops claude (the page left or pressed Stop).
export function discuter({ message, session, dossiers }, emettre) {
  const prog = programme('claude');
  if (!prog || prog.cmd) {
    emettre({ type: 'erreur', message: tr({ fr: 'claude.exe introuvable sur ce PC.', en: 'claude.exe not found on this PC.' }) });
    return { annuler() {} };
  }
  const reg = registreCompact();
  const hash = crypto.createHash('sha256').update(JSON.stringify(reg)).digest('hex');
  const parties = [];
  if (!session || envoyes.get(session) !== hash) parties.push(`<registre>\n${JSON.stringify(reg)}\n</registre>`);
  if (!session && dossiers.length) parties.push(`<dossiers-connus>\n${dossiers.join('\n')}\n</dossiers-connus>`);
  parties.push(message);
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', MODELE,
    '--safe-mode', '--disable-slash-commands', '--strict-mcp-config', '--system-prompt', CADRE, ...(session ? ['--resume', session] : []), '--tools', ''];
  const cwd = dossierChat();
  fs.mkdirSync(cwd, { recursive: true });
  enCours = true;
  const enfant = spawn(prog.fichier, [...prog.prefixe, ...args], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let tampon = ''; let erreur = ''; let fini = false; let id = session; let resultat = null;
  const minuteur = setTimeout(() => enfant.kill(), DELAI);
  const finir = (ev) => { if (fini) return; fini = true; enCours = false; clearTimeout(minuteur); emettre(ev); };
  const ligne = (l) => {
    let x; try { x = JSON.parse(l); } catch { return; }
    if (x.type === 'system' && x.subtype === 'init' && UUID.test(String(x.session_id || ''))) { id = x.session_id; emettre({ type: 'session', session: id }); }
    else if (x.type === 'stream_event' && x.event?.type === 'content_block_delta' && x.event.delta?.type === 'text_delta') emettre({ type: 'texte', texte: String(x.event.delta.text || '') });
    else if (x.type === 'result') resultat = x;
  };
  enfant.stdout.setEncoding('utf8');
  enfant.stdout.on('data', (c) => { tampon += c; let i; while ((i = tampon.indexOf('\n')) >= 0) { ligne(tampon.slice(0, i)); tampon = tampon.slice(i + 1); } });
  enfant.stderr.setEncoding('utf8');
  enfant.stderr.on('data', (c) => { erreur = (erreur + c).slice(-2000); });
  enfant.on('error', (e) => finir({ type: 'erreur', message: e.message }));
  enfant.on('close', () => {
    if (tampon.trim()) ligne(tampon);
    if (resultat && !resultat.is_error && typeof resultat.result === 'string') {
      if (id) envoyes.set(id, hash);
      const ids = new Set(lireRegistre().entrees.map((e) => e.id));
      return finir({ type: 'fin', session: id, ...extraireActions(resultat.result, ids) });
    }
    finir({ type: 'erreur', message: String(resultat?.result || erreur.trim() || tr({ fr: 'Claude n\'a pas répondu.', en: 'Claude did not answer.' })).slice(0, 600) });
  });
  enfant.stdin.on('error', () => {});
  enfant.stdin.end(parties.join('\n\n'));
  return { annuler() { if (!fini) { enfant.kill(); finir({ type: 'erreur', message: tr({ fr: 'Arrêté.', en: 'Stopped.' }) }); } } };
}
