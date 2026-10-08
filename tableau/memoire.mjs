// "Memory" tab: what Claude recorded (rules, pitfalls, solutions) and which instruction files it really loaded.
// Same file format and same rules as plugins/relais/scripts/registre.mjs and instructions.mjs (the dashboard
// cannot import them: the desktop app bundles the plugins elsewhere), so keep both sides in step.
//   <claude dir>/relais/registre.json          { version: 1, entrees: [ { id, portee, sujet, type, texte, ... } ] }
//   <claude dir>/relais/.etat/instr_*.json     { p, type, raison, parent, le }  (one per loaded file per session)
// 100% local. Instruction files are only ever read at the paths Claude Code reported, read-only, capped.
import fs from 'node:fs';
import path from 'node:path';
import { dossierClaude } from './analyse.mjs';
import { tr } from './langue.mjs';

export const TYPES = ['regle', 'piege', 'solution'];
export const LIMITES = { texte: 300, probleme: 800, solution: 800, sujet: 30 };
export const FENETRE_FICHIERS = 7 * 86400e3; // instruction files seen in the last 7 days
export const LIMITE_APERCU = 20000;          // characters of a file shown in the preview

const dossierRelais = () => path.join(dossierClaude(), 'relais');
export const fichierRegistre = () => path.join(dossierRelais(), 'registre.json');

// Never store something that looks like a secret (the registry is given back to Claude at every session start).
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, /\bgithub_pat_[A-Za-z0-9_]{22,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b(?:password|passwd|pwd|mot de passe)\s*[:=]\s*\S{4,}/i,
];
export const contientSecret = (s) => SECRETS.some((re) => re.test(String(s || '')));

// One line, no control characters, bounded length.
const propre = (s, max) => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\s*\r?\n\s*/g, ' ').trim().slice(0, max);
const sujetPropre = (s) => propre(s, LIMITES.sujet).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'divers';
export const normTexte = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function normCwd(p) {
  let s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') s = s.replace(/^\/([a-z])\//i, '$1:/');
  return process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s;
}
const memePortee = (a, b) => (a === 'global' || b === 'global' ? a === b : normCwd(a) === normCwd(b));

const MESSAGES = {
  texte: { fr: 'Le texte est requis (la règle à appliquer, en une ligne).', en: 'The text is required (the rule to apply, on one line).' },
  portee: { fr: 'La portée est requise ("global" ou un dossier de projet).', en: 'The scope is required ("global" or a project folder).' },
  porteeAbsolue: { fr: 'La portée doit être "global" ou un dossier absolu.', en: 'The scope must be "global" or an absolute folder.' },
  secret: { fr: 'Refusé : ça ressemble à un secret (mot de passe, jeton, clé).', en: 'Refused: this looks like a secret (password, token, key).' },
  id: { fr: 'Entrée introuvable.', en: 'Entry not found.' },
  champs: { fr: 'Corps JSON attendu.', en: 'JSON body expected.' },
};
const echec = (cle) => ({ ok: false, message: tr(MESSAGES[cle]) });

// ---- file
function lireJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
// Write then rename: a reader (the relais hooks) running at the same moment never sees half a file.
function ecrireJSON(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, f);
}
export function lireRegistre(f = fichierRegistre()) {
  const r = lireJSON(f);
  if (!r || !Array.isArray(r.entrees)) return { version: 1, entrees: [] };
  return { version: 1, entrees: r.entrees.filter((e) => e && typeof e.id === 'string' && typeof e.texte === 'string') };
}
export const ecrireRegistre = (reg, f = fichierRegistre()) => ecrireJSON(f, { version: 1, entrees: reg.entrees });

// ---- validation (same rules as registre.mjs valider(); unknown fields of an existing entry are kept)
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
  if (!e.texte) return echec('texte');
  if (!e.portee) return echec('portee');
  if ('portee' in b && e.portee !== 'global' && !path.isAbsolute(e.portee) && !path.win32.isAbsolute(e.portee)) return echec('porteeAbsolue');
  if (['texte', 'probleme', 'solution'].some((k) => contientSecret(e[k]))) return echec('secret');
  return { ok: true, entree: e };
}

const nouvelId = () => `r${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;

// Adds an entry (origin "utilisateur"), or refreshes the identical one (same scope, same normalised text).
export function ajouter(reg, brut) {
  const v = valider(brut);
  if (!v.ok) return v;
  const maintenant = new Date().toISOString();
  const meme = reg.entrees.find((x) => memePortee(x.portee, v.entree.portee) && normTexte(x.texte) === normTexte(v.entree.texte));
  if (meme) {
    Object.assign(meme, { ...v.entree, id: meme.id, cree: meme.cree, actif: meme.actif, maj: maintenant });
    return { ok: true, entree: meme, doublon: true };
  }
  for (const k of ['probleme', 'solution']) if (!v.entree[k]) delete v.entree[k]; // a new entry carries no empty field
  const entree = { id: nouvelId(), ...v.entree, origine: 'utilisateur', cree: maintenant, maj: maintenant };
  reg.entrees.push(entree);
  return { ok: true, entree };
}
export function modifier(reg, id, brut) {
  const x = reg.entrees.find((e) => e.id === id);
  if (!x) return echec('id');
  const v = valider(brut, { existante: x });
  if (!v.ok) return v;
  // Provenance is never edited from the page: origin, session and creation date stay as they were.
  const { origine, session, cree } = x;
  Object.assign(x, v.entree, { id: x.id, maj: new Date().toISOString() });
  for (const [k, val] of Object.entries({ origine, session, cree })) { if (val === undefined) delete x[k]; else x[k] = val; }
  for (const k of ['probleme', 'solution']) if (!x[k]) delete x[k]; // an emptied field is removed, not kept as ""
  return { ok: true, entree: x };
}
export function supprimer(reg, id) {
  const n = reg.entrees.length;
  reg.entrees = reg.entrees.filter((e) => e.id !== id);
  return n === reg.entrees.length ? echec('id') : { ok: true };
}

// ---- instruction files Claude Code really loaded (one small file per loaded file per session)
// Distinct paths seen in the window, newest load first, with a read-only preview of the current content.
// Only the paths recorded by the InstructionsLoaded hook are ever opened, and only regular files.
export function fichiersCharges({ maintenant = Date.now(), fenetre = FENETRE_FICHIERS } = {}) {
  const dir = path.join(dossierRelais(), '.etat');
  let noms = [];
  try { noms = fs.readdirSync(dir).filter((n) => /^instr_[\w-]+\.json$/.test(n)); } catch { return []; }
  const parChemin = new Map();
  for (const n of noms) {
    const f = path.join(dir, n);
    const o = lireJSON(f);
    if (!o || typeof o.p !== 'string' || !o.p || !path.isAbsolute(o.p) && !path.win32.isAbsolute(o.p)) continue;
    let le = Number(o.le);
    if (!Number.isFinite(le) || le <= 0) { try { le = fs.statSync(f).mtimeMs; } catch { continue; } }
    if (maintenant - le > fenetre) continue;
    const cle = normCwd(o.p);
    const vu = parChemin.get(cle);
    if (!vu || le > vu.le) parChemin.set(cle, { chemin: o.p, type: String(o.type || ''), raison: String(o.raison || ''), parent: String(o.parent || ''), le, sessions: (vu?.sessions || 0) + 1 });
    else vu.sessions += 1;
  }
  return [...parChemin.values()].sort((a, b) => b.le - a.le).map((x) => ({ ...x, ...apercu(x.chemin) }));
}
// { existe, apercu, tronque }: at most LIMITE_APERCU characters, nothing at all if the file is gone.
function apercu(chemin) {
  let fd;
  try {
    if (!fs.statSync(chemin).isFile()) return { existe: false, apercu: '', tronque: false };
    fd = fs.openSync(chemin, 'r');
    const buf = Buffer.alloc(LIMITE_APERCU * 4 + 4); // UTF-8: up to 4 bytes per character
    const lus = fs.readSync(fd, buf, 0, buf.length, 0);
    const texte = buf.subarray(0, lus).toString('utf8').replace(/\0/g, '');
    return { existe: true, apercu: texte.slice(0, LIMITE_APERCU), tronque: texte.length > LIMITE_APERCU || lus === buf.length };
  } catch {
    return { existe: false, apercu: '', tronque: false };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* already closed */ }
  }
}

// ---- API (called by serveur.mjs)
// `dossiersConnus`: project folders known from the conversations, so the page can offer them when adding.
export function lire(dossiersConnus = []) {
  const { entrees } = lireRegistre();
  const vus = new Set(); const projets = [];
  for (const d of [...entrees.map((e) => e.portee), ...dossiersConnus]) {
    if (typeof d !== 'string' || !d || d === 'global') continue;
    const k = normCwd(d);
    if (k && !vus.has(k)) { vus.add(k); projets.push(d); }
  }
  return { entrees, projets, fichiers: fichiersCharges() };
}
const corpsOk = (b) => b && typeof b === 'object' && !Array.isArray(b);
function appliquer(b, action) {
  if (!corpsOk(b)) return echec('champs');
  const reg = lireRegistre();
  const r = action(reg);
  if (r.ok) ecrireRegistre(reg);
  return r;
}
export const ajouterEntree = (b) => appliquer(b, (reg) => ajouter(reg, b));
export const modifierEntree = (b) => appliquer(b, (reg) => modifier(reg, String(b.id ?? ''), b));
export const supprimerEntree = (b) => appliquer(b, (reg) => supprimer(reg, String(b.id ?? '')));
