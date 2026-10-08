// SessionStart hook.
// v2 (default): after /clear, deals ONLY with the relay written by the session that was just closed
// (auto_<closed session>.md, same Claude Code project). If that relay is fresh (written less than 30 min
// before closing and less than 20k tokens of conversation after it), it is reloaded with a short note of
// code-made checks, the whole thing within 8,000 characters. Otherwise (stale, or /clear long after: most
// likely a change of topic) it is only pointed to, with the same checks: "resume the relay" loads it.
// Any other relay is only announced, never loaded nor archived. A new session (startup) only gets
// announcements. v1 (RELAIS_V2=0): unchanged, see repriseV1().
import fs from 'node:fs';
import path from 'node:path';
import {
  V2, dossierRelais, lireStdin, normCwd, sortieJSON, duree, derniereTaille, k, T,
  idSid, barres, lireMeta, lireFerme, lireJSON, ecrireJSON, titreRelais, analyserRelais, cheminsAbsents, compterARanger,
  fichierARanger, suppressionsMemoire, fichiersDepuis, heure, cleProjet, dossierMemoire, estHash, liste,
} from './commun.mjs';

const MAX_CAR = 16000;           // v1 safety net: a relay is not a novel
const FENETRE_CLEAR = 72 * 3600e3;
const FENETRE_STARTUP = 12 * 3600e3;
const BUDGET = 8000;             // v2: everything injected (note + checks + relay); hooks are capped at 10,000
const ATTENTE = Number(process.env.RELAIS_ATTENTE_MS || 3000); // wait for the closing record (order not guaranteed)
const MARGE_FERME = 2000;        // a closing record is "this /clear" only if within ATTENTE + 2 s of our start
const ECART_PERIME = 20000;
const FRAIS_MS = 30 * 60e3;      // relay written more than 30 min before closing: pointed to, not reloaded

try {
  const e = await lireStdin();
  if (V2) await repriseV2(e); else repriseV1(e);
} catch { /* never a visible error */ }
process.exit(0);

// ------------------------------------------------------------------------------------------------- v2
async function repriseV2(e) {
  const t0 = Date.now();
  const limite = t0 + 8000; // hook timeout is 10 s: always answer well before
  const source = e.source || 'startup';
  if (source !== 'clear' && source !== 'startup') return; // resume / compact: leave alone
  const dir = dossierRelais();
  const ici = cleProjet(e);
  const iciCwd = normCwd(e.cwd);
  const monSid = idSid(e.session_id);
  menage(dir);
  const relais = listerRelais(dir);
  // Same project: from the script metadata; the "cwd:" line written by Claude only for v1-style relays.
  const duProjet = (r) => (r.meta?.cle ? r.meta.cle === ici : !!r.cwdLigne && r.cwdLigne === iciCwd);
  const annoncables = (fen) => relais.filter((r) => duProjet(r) && r.age <= fen && r.sid !== monSid);

  if (source === 'startup') return annoncer(annoncables(FENETRE_STARTUP));

  // Wait for the closing record of the cleared session only if one of its relays could be concerned.
  const attendre = relais.some((r) => r.sid && r.sid !== monSid && (!r.meta?.cle || r.meta.cle === ici));
  let F = chercherFerme(dir, ici, monSid, t0);
  while (F === null && attendre && Date.now() - t0 < ATTENTE) {
    await dormir(100);
    F = chercherFerme(dir, ici, monSid, t0);
  }
  // The record is consumed even when that session wrote no relay: it must not be mistaken later for the
  // /clear of a parallel session in the same project.
  if (F && F !== 'ambigu' && consommer(dir, F.sid)) {
    const r = relais.find((x) => x.sid === F.sid);
    if (r && (!r.meta?.cle || r.meta.cle === ici)) return injecter(e, r, F, await ctxFin(dir, F.sid, limite), limite);
  }
  return annoncer(annoncables(FENETRE_CLEAR));
}

// A function declaration (hoisted): the main block above runs before any const below is initialised.
function dormir(ms) { return new Promise((ok) => setTimeout(ok, ms)); }

// Quiet housekeeping, at most once a day (dated marker): it used to stat every state file on each start.
// - states older than 7 days, except the metadata of a relay that still exists and the registry snapshot
//   (rewritten only when the registry changes: deleting it would announce every rule as new again);
// - archived relays (.repris.md) and session relays (auto_*.md) older than 30 days. Never a recent relay,
//   never the registry, a-ranger.md or a v1 relay.
function menage(dir, maintenant = Date.now()) {
  const marque = path.join(dir, '.etat', 'menage.json');
  const jour = new Date(maintenant).toISOString().slice(0, 10);
  if (lireJSON(marque)?.jour === jour) return false;
  try {
    const etat = path.join(dir, '.etat');
    for (const f of fs.readdirSync(etat)) {
      if (f === 'menage.json' || f === 'registre-vu.json') continue;
      const p = path.join(etat, f);
      if (maintenant - fs.statSync(p).mtimeMs <= 7 * 86400e3) continue;
      const m = f.match(/^meta_([\w-]+)\.json$/);
      if (m && fs.existsSync(path.join(dir, `auto_${m[1]}.md`))) continue;
      fs.unlinkSync(p);
    }
  } catch { /* not important */ }
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.repris\.md$|^auto_[\w-]+\.md$/.test(f)) continue;
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isFile() && maintenant - st.mtimeMs > 30 * 86400e3) fs.unlinkSync(p);
    }
  } catch { /* not important */ }
  try { ecrireJSON(marque, { jour }); } catch { /* read-only: try again next time */ }
  return true;
}

function listerRelais(dir) {
  const res = [];
  for (const nom of fs.readdirSync(dir)) {
    if (!nom.endsWith('.md') || nom.endsWith('.repris.md') || nom === 'a-ranger.md') continue;
    try {
      const p = path.join(dir, nom);
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      const texte = fs.readFileSync(p, 'utf8');
      const sid = (nom.match(/^auto_([\w-]+)\.md$/) || [])[1] || null;
      const meta = sid ? lireMeta(sid) : null;
      const ligne = (texte.match(/^cwd:\s*(.+)$/m) || [])[1];
      res.push({ p, nom, texte, sid, meta, cwdLigne: ligne ? normCwd(ligne.trim()) : null, titre: titreRelais(texte, nom), mtime: st.mtimeMs, age: Date.now() - st.mtimeMs });
    } catch { /* unreadable: skip */ }
  }
  return res.sort((a, b) => a.age - b.age);
}

// The /clear that just happened in this project: one unused closing record with reason "clear", written
// within ATTENTE + 2 s of our start (an older one belongs to another, abandoned /clear).
// Two at once (parallel sessions cleared within seconds) = ambiguous: announce, never guess.
function chercherFerme(dir, ici, monSid, t0) {
  const trouves = [];
  try {
    for (const f of fs.readdirSync(path.join(dir, '.etat'))) {
      if (!/^ferme_[\w-]+\.json$/.test(f) || f.endsWith('.pris.json')) continue;
      const o = lireJSON(path.join(dir, '.etat', f));
      if (o?.reason === 'clear' && o.sid && o.sid !== monSid && o.cle === ici
        && Math.abs(t0 - Number(o.le)) <= ATTENTE + MARGE_FERME) trouves.push(o);
    }
  } catch { return null; }
  return trouves.length === 1 ? trouves[0] : trouves.length > 1 ? 'ambigu' : null;
}
// Atomic: if two new sessions race for the same record, only one rename succeeds.
function consommer(dir, sid) {
  try {
    fs.renameSync(path.join(dir, '.etat', `ferme_${sid}.json`), path.join(dir, '.etat', `ferme_${sid}.pris.json`));
    return true;
  } catch { return false; }
}
// Final size of the closed conversation: written by fin.mjs just after the closing record.
async function ctxFin(dir, sid, limite) {
  const p = path.join(dir, '.etat', `fermectx_${sid}.json`);
  const fin = Math.min(Date.now() + 2000, limite - 2500);
  for (;;) {
    const o = lireJSON(p);
    if (o) return Number(o.ctx) || 0;
    if (Date.now() >= fin) return null;
    await dormir(100);
  }
}

function annoncer(items) {
  if (!items.length) return;
  const t = T();
  const r = items[0];
  const archivable = (x) => !x.sid || !!lireFerme(x.sid); // v1 relay, or its session is closed
  const texte = items.slice(0, 3).map((x) => `${barres(x.p)} (« ${x.titre} », ${t.il(duree(x.age))}, ${archivable(x) ? t.archivable : t.ouverte})`);
  sortieJSON({
    systemMessage: items.length === 1 ? t.dispo(r.titre, duree(r.age)) : t.dispoN(items.length),
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: t.noteDispo2(texte.join(' ; ')).slice(0, BUDGET) },
  });
}

function injecter(e, r, F, fin, limite) {
  const t = T();
  const meta = r.meta || {};
  // Recorded by the Stop check when Claude wrote it; a later date = corrected by hand before /clear
  // (README §6): still the same relay, same size and time of writing. An OLDER date = another file.
  const metaOk = meta.ctx > 0 && Number(meta.mtimeVu) > 0 && r.mtime >= meta.mtimeVu;
  const relaisMs = metaOk && meta.ecritMs ? meta.ecritMs : r.mtime;
  const ecart = metaOk && fin ? fin - meta.ctx : null;
  const tropVieux = Number(F.le) - relaisMs > FRAIS_MS;
  // B4: reload only a fresh relay; a stale one, or a /clear long after it, is most likely a new topic.
  const frais = ecart !== null && ecart <= ECART_PERIME && !tropVieux;
  const cwdRelais = meta.cwd || e.cwd;

  // Alerts first (never dropped), then the rest (dropped from the end if the budget requires it).
  const alertes = [];
  const autres = [];
  const memDir = meta.memDir || dossierMemoire(cwdRelais, e.transcript_path);
  if (memDir) {
    const sup = estHash(meta.headMem) ? suppressionsMemoire(memDir, meta.headMem, limite) : null;
    if (sup === null) alertes.push(t.ctrlMemoireImpossible);
    else if (sup.length) alertes.push(t.ctrlMemoire(liste(sup, 700)));
  }
  const a = analyserRelais(r.texte);
  if (a.secrets.length) alertes.push(t.ctrlSecret(a.secrets.join(', ')));
  if (!metaOk) autres.push(t.ctrlSansMeta);
  if (ecart !== null && ecart > ECART_PERIME) {
    autres.push(t.ctrlPerime(heure(relaisMs), k(meta.ctx), k(fin), k(ecart)));
    const fichiers = fichiersDepuis(cwdRelais, meta.headCwd, relaisMs, limite);
    if (fichiers === null) autres.push(t.ctrlPasGit);
    else if (!fichiers.length) autres.push(t.ctrlFichiersAucun);
    else autres.push(t.ctrlFichiers(liste(fichiers, 800)));
  }
  if (a.manquantes.length) autres.push(t.ctrlSections(a.manquantes.join(', ')));
  const absents = cheminsAbsents(r.texte, cwdRelais);
  if (absents.length) autres.push(t.ctrlChemins(liste(absents, 600)));
  const nAR = compterARanger();
  if (nAR) autres.push(t.ctrlARanger(nAR, barres(fichierARanger())));

  const depuis = duree(Date.now() - relaisMs);
  let systemMessage;
  let tete;
  if (frais) {
    // Single use: archive THIS relay only (never another session's).
    try { fs.renameSync(r.p, r.p.replace(/\.md$/, '.repris.md')); } catch { /* already gone */ }
    // The tally ("before / now / freed") only follows a real reload, as in v1.
    if (fin) ecrireJSON(path.join(dossierRelais(), '.etat', `bilan_${idSid(e.session_id)}.json`), { avant: fin });
    systemMessage = fin ? t.reprisAvant(r.titre, depuis, k(fin)) : t.repris(r.titre, depuis);
    tete = t.noteRepris2(String(F.sid).slice(0, 8), heure(relaisMs));
  } else {
    systemMessage = t.nonCharge(r.titre, depuis);
    const raison = !metaOk || ecart === null ? t.raisonInconnu : ecart > ECART_PERIME ? t.raisonEcart(k(ecart)) : t.raisonVieux;
    tete = t.noteNonCharge(String(F.sid).slice(0, 8), barres(r.p), r.titre, heure(relaisMs), raison);
  }
  systemMessage = (systemMessage + (nAR ? t.aRanger(nAR) : '')).slice(0, 600);
  const bloc = () => {
    const c = [...alertes, ...autres];
    return c.length ? `${tete}\n${t.ctrlEntete}\n${c.join('\n')}` : tete;
  };
  while (autres.length && bloc().length + systemMessage.length > BUDGET - 1000) autres.pop();
  const note = bloc();
  let contexte = note;
  if (frais) {
    const place = BUDGET - systemMessage.length - note.length - 2;
    const contenu = r.texte.length > place ? `${r.texte.slice(0, Math.max(0, place - t.tronque.length - 1))}\n${t.tronque}` : r.texte;
    contexte = `${note}\n\n${contenu}`;
  }
  sortieJSON({ systemMessage, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: contexte } });
}

// ------------------------------------------------------------------------------------------------- v1
// After /clear, automatically reloads the latest relay written for this working folder. Used ONCE, then
// archived. In a brand-new session opened elsewhere (startup), it is only announced, never forced.
function repriseV1(e) {
  const source = e.source || 'startup';
  if (source !== 'clear' && source !== 'startup') return;
  const dir = dossierRelais();
  const ici = normCwd(e.cwd);
  const maintenant = Date.now();

  // Quiet housekeeping: gauge states older than 7 days.
  try {
    for (const f of fs.readdirSync(path.join(dir, '.etat'))) {
      const p = path.join(dir, '.etat', f);
      if (maintenant - fs.statSync(p).mtimeMs > 7 * 86400e3) fs.unlinkSync(p);
    }
  } catch { /* not important */ }

  const candidats = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.endsWith('.repris.md') && f !== 'a-ranger.md')
    .map((f) => {
      const p = path.join(dir, f);
      const texte = fs.readFileSync(p, 'utf8');
      const cwd = (texte.match(/^cwd:\s*(.+)$/m) || [])[1];
      const titre = ((texte.match(/^(?:titre|title):\s*(.+)$/m) || [])[1] || f).trim();
      return { p, texte, titre, cwd: normCwd(cwd), age: maintenant - fs.statSync(p).mtimeMs };
    })
    .filter((c) => c.cwd === ici)
    .sort((a, b) => a.age - b.age);

  const r = candidats[0];
  const fenetre = source === 'clear' ? FENETRE_CLEAR : FENETRE_STARTUP;
  if (!r || r.age > fenetre) return;
  const t = T();
  const depuis = duree(r.age);

  if (source === 'startup') {
    // New tab: maybe another topic. Announce without loading.
    sortieJSON({
      systemMessage: t.dispo(r.titre, depuis),
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: t.noteDispo(r.p.replace(/\\/g, '/'), r.titre, depuis) },
    });
    return;
  }

  // After /clear: reload the relay and archive it (single use).
  const contenu = r.texte.length > MAX_CAR ? `${r.texte.slice(0, MAX_CAR)}\n${t.tronque}` : r.texte;
  // Archive this relay AND any older one for this folder: an outdated relay must never come back later.
  for (const c of candidats) {
    try { fs.renameSync(c.p, c.p.replace(/\.md$/, '.repris.md')); } catch { /* already gone */ }
  }
  // Size of the conversation that was just cleared: the Stop hook (controle.mjs) compares it after the first answer.
  const avant = derniereTaille(e.cwd, e.session_id);
  if (avant) {
    const sid = String(e.session_id || 'x').replace(/[^\w-]/g, '');
    fs.writeFileSync(path.join(dir, '.etat', `bilan_${sid}.json`), JSON.stringify({ avant }));
  }
  sortieJSON({
    systemMessage: avant ? t.reprisAvant(r.titre, depuis, k(avant)) : t.repris(r.titre, depuis),
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${t.noteRepris}\n\n${contenu}` },
  });
}
