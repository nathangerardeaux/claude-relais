// Registry of what Claude learned: rules, pitfalls and their solutions, global or per project.
// One JSON file in the relais folder (<CLAUDE_CONFIG_DIR or ~/.claude>/relais/registre.json): it lives on disk, so neither
// /clear nor compaction nor a new session loses it. Active entries are given back to Claude at every
// session start (memoire.mjs); the dashboard (tableau, "Memory" tab) shows them, turns them on or off,
// edits and deletes them. Same file format as tableau/memoire.mjs.
//
// Module (pure helpers, tested) and command line for Claude:
//   echo '{"portee":"projet","sujet":"git","type":"piege","texte":"...","probleme":"...","solution":"..."}' | node registre.mjs ajouter
//   node registre.mjs lister [--sujet git] [--tout] [--partout]   entries for this folder (+ global), with details;
//                                       --tout: also turned-off ones; --partout: every project
//   node registre.mjs desactiver|activer|supprimer <id>
//   echo '{"texte":"..."}' | node registre.mjs modifier <id>
// "projet" = the git root of the current folder (or the folder itself). 100% local, no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierRelais, normCwd, lireJSON, ecrireJSON, barres, git } from './commun.mjs';

export const TYPES = ['regle', 'piege', 'solution'];
export const LIMITES = { texte: 300, probleme: 800, solution: 800, sujet: 30 };
export const fichierRegistre = () => path.join(dossierRelais(), 'registre.json');

// Never store something that looks like a secret: the registry is re-injected at every session start.
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, /\bgithub_pat_[A-Za-z0-9_]{22,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b(?:password|passwd|pwd|mot de passe)\s*[:=]\s*\S{4,}/i,
];
export const contientSecret = (s) => SECRETS.some((re) => re.test(String(s || '')));

// One line, no control characters, bounded length.
const propre = (s, max) => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\s*\r?\n\s*/g, ' ').trim().slice(0, max);
const sujetPropre = (s) => propre(s, LIMITES.sujet).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'divers';

// Text comparison that ignores case, accents and punctuation ("Ne pas pousser main" == "ne pas pousser MAIN.").
export const normTexte = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

export function lireRegistre(f = fichierRegistre()) {
  const r = lireJSON(f);
  if (!r || !Array.isArray(r.entrees)) return { version: 1, entrees: [] };
  return { version: 1, entrees: r.entrees.filter((e) => e && typeof e.id === 'string' && typeof e.texte === 'string') };
}
export function ecrireRegistre(reg, f = fichierRegistre()) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  ecrireJSON(f, { version: 1, entrees: reg.entrees });
}

const nouvelId = () => `r${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;

// Checks and cleans an entry. Returns { ok, entree } or { ok: false, erreur }.
export function valider(brut, { existante } = {}) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const e = { ...(existante || {}) };
  for (const k of ['texte', 'probleme', 'solution']) if (k in b) e[k] = propre(b[k], LIMITES[k]);
  if ('sujet' in b || !e.sujet) e.sujet = sujetPropre(b.sujet ?? e.sujet);
  if ('type' in b || !e.type) e.type = TYPES.includes(b.type) ? b.type : (e.type || 'regle');
  if ('portee' in b) e.portee = b.portee === 'global' ? 'global' : propre(b.portee, 400);
  if ('actif' in b) e.actif = b.actif !== false;
  if ('corrigeable' in b) e.corrigeable = b.corrigeable === true;
  if (e.actif === undefined) e.actif = true;
  if (!e.texte) return { ok: false, erreur: 'texte requis (la règle à appliquer, en une ligne)' };
  if (!e.portee) return { ok: false, erreur: 'portee requise ("global" ou un dossier de projet)' };
  if (['texte', 'probleme', 'solution'].some((k) => contientSecret(e[k]))) return { ok: false, erreur: 'refusé : ressemble à un secret (mot de passe, jeton, clé)' };
  return { ok: true, entree: e };
}

// Adds an entry, or refreshes the identical one (same scope, same normalised text) instead of duplicating.
export function ajouter(reg, brut, { origine = 'claude', session = '' } = {}) {
  const v = valider(brut);
  if (!v.ok) return v;
  const maintenant = new Date().toISOString();
  const meme = reg.entrees.find((x) => memePortee(x.portee, v.entree.portee) && normTexte(x.texte) === normTexte(v.entree.texte));
  if (meme) {
    Object.assign(meme, { ...v.entree, id: meme.id, cree: meme.cree, actif: meme.actif, maj: maintenant });
    return { ok: true, entree: meme, doublon: true };
  }
  const entree = { id: nouvelId(), ...v.entree, origine, session: String(session).slice(0, 8), cree: maintenant, maj: maintenant };
  reg.entrees.push(entree);
  return { ok: true, entree };
}
export function modifier(reg, id, brut) {
  const x = reg.entrees.find((e) => e.id === id);
  if (!x) return { ok: false, erreur: `entrée ${id} introuvable` };
  const v = valider(brut, { existante: x });
  if (!v.ok) return v;
  Object.assign(x, v.entree, { maj: new Date().toISOString() });
  return { ok: true, entree: x };
}
export function supprimer(reg, id) {
  const n = reg.entrees.length;
  reg.entrees = reg.entrees.filter((e) => e.id !== id);
  return n === reg.entrees.length ? { ok: false, erreur: `entrée ${id} introuvable` } : { ok: true };
}

const memePortee = (a, b) => (a === 'global' || b === 'global' ? a === b : normCwd(a) === normCwd(b));
// An entry applies to a folder if it is global, or if its project folder is that folder or one of its parents.
export function concerne(e, dossier) {
  if (e.portee === 'global') return true;
  const p = normCwd(e.portee);
  const d = normCwd(dossier);
  return !!p && (d === p || d.startsWith(`${p}/`));
}
export const pourDossier = (reg, dossier, { tout = false } = {}) => reg.entrees.filter((e) => concerne(e, dossier) && (tout || e.actif));

// Project root used for "portee": "projet": the git root of the folder, else the folder itself.
// (git is only asked for its top level: no working-tree content is read.)
export function racineProjet(dossier) {
  // Hardened git of commun.mjs: neutralised config, and safe.directory only for a folder that is itself
  // the top of its repository (never a parent repository found by walking up).
  const t = (git(dossier, ['rev-parse', '--show-toplevel']) || '').trim();
  return t ? path.resolve(t) : path.resolve(dossier);
}

// ---- Coverage: is a relay line already said by an instruction file Claude really loaded, or by the registry?
// Conservative on purpose (a line wrongly called "covered" would be lost): at least 4 significant words, and
// 85 % of them on ONE line of the source. The result is only a suggestion; Claude checks the cited line.
const motsSignificatifs = (s) => [...new Set(normTexte(s).split(' ').filter((m) => m.length >= 4))];
export function lignesCouvertes(texteRelais, sources) {
  const index = [];
  for (const s of sources) {
    String(s.texte || '').split(/\r?\n/).forEach((l, i) => {
      const mots = new Set(motsSignificatifs(l));
      if (mots.size >= 3) index.push({ mots, ou: s.ligneParLigne === false ? s.nom : `${s.nom}:${i + 1}` });
    });
  }
  const res = [];
  String(texteRelais).split(/\r?\n/).forEach((l, i) => {
    if (!/^\s*([-*+]|\d+[.)])\s+\S/.test(l)) return; // bullet points only: headings and prose stay
    const mots = motsSignificatifs(l);
    if (mots.length < 4) return;
    for (const c of index) {
      const communs = mots.filter((m) => c.mots.has(m)).length;
      if (communs / mots.length >= 0.85) { res.push({ ligne: i + 1, ou: c.ou }); break; }
    }
  });
  return res;
}

// ---- Command line ----
async function lireEntree() {
  if (process.stdin.isTTY) return {};
  let s = '';
  for await (const c of process.stdin) s += c;
  if (!s.trim()) return {};
  try { return JSON.parse(s); } catch { return null; }
}
const resume = (e) => `${e.id} [${e.sujet}] ${e.type}${e.corrigeable ? ' (corrigeable)' : ''}${e.actif ? '' : ' (désactivée)'} : ${e.texte}`;

async function cli(args) {
  const [cmd, id] = args;
  const reg = lireRegistre();
  const ici = process.cwd();
  const sauver = () => ecrireRegistre(reg);
  if (cmd === 'ajouter' || cmd === 'modifier') {
    const b = await lireEntree();
    if (!b) return console.log('ERREUR : JSON invalide sur l\'entrée standard');
    if (cmd === 'ajouter') {
      b.portee = b.portee === 'global' ? 'global' : racineProjet(b.portee && b.portee !== 'projet' ? b.portee : ici);
      const r = ajouter(reg, b, { session: process.env.CLAUDE_SESSION_ID || '' });
      if (!r.ok) return console.log(`ERREUR : ${r.erreur}`);
      sauver();
      return console.log(`${r.doublon ? 'Déjà présente, mise à jour' : 'Enregistrée'} : ${resume(r.entree)} (portée : ${barres(r.entree.portee)})`);
    }
    if (b.portee === 'projet') b.portee = racineProjet(ici);
    else if (b.portee && b.portee !== 'global') b.portee = racineProjet(b.portee);
    const r = modifier(reg, id, b);
    if (!r.ok) return console.log(`ERREUR : ${r.erreur}`);
    sauver();
    return console.log(`Modifiée : ${resume(r.entree)}`);
  }
  if (cmd === 'activer' || cmd === 'desactiver') {
    const r = modifier(reg, id, { actif: cmd === 'activer' });
    if (!r.ok) return console.log(`ERREUR : ${r.erreur}`);
    sauver();
    return console.log(resume(r.entree));
  }
  if (cmd === 'supprimer') {
    const r = supprimer(reg, id);
    if (!r.ok) return console.log(`ERREUR : ${r.erreur}`);
    sauver();
    return console.log(`Supprimée : ${id}`);
  }
  if (cmd === 'lister') {
    const sujet = args.includes('--sujet') ? sujetPropre(args[args.indexOf('--sujet') + 1]) : null;
    const tout = args.includes('--tout');
    const base = args.includes('--partout') ? reg.entrees.filter((e) => tout || e.actif) : pourDossier(reg, ici, { tout });
    const liste = base.filter((e) => !sujet || e.sujet === sujet);
    if (!liste.length) return console.log('Aucune entrée.');
    for (const e of liste) {
      // The author is shown here, not in the session-start note (a plain field anyone writing the file can set).
      console.log(`- ${resume(e)}\n  portée : ${e.portee === 'global' ? 'global' : barres(e.portee)} ; auteur : ${e.origine === 'utilisateur' ? 'utilisateur' : 'Claude'}`);
      if (e.probleme) console.log(`  problème : ${e.probleme}`);
      if (e.solution) console.log(`  solution : ${e.solution}`);
    }
    return;
  }
  console.log('usage : node registre.mjs ajouter|modifier <id>|activer <id>|desactiver <id>|supprimer <id>|lister [--sujet s] [--tout] [--partout]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await cli(process.argv.slice(2)); } catch (e) { console.log(`ERREUR : ${e.message}`); }
}
