// Stop hook (v2): when this session's relay (auto_<session>.md) was (re)written during the turn, the
// script records its metadata itself (project, real folder, context size, time, git HEAD of the project
// memory and of the folder) and checks it while Claude still has the context to fix it: too long,
// required sections missing, possible secret -> Claude is told ONCE, and only for a relay written after a
// relay request (never when stop_hook_active, never twice per request; an old v1-format file of this
// session is only recorded, silently). Silent otherwise. Never an error. RELAIS_V2=0: does nothing.
import fs from 'node:fs';
import {
  V2, lireStdin, dernierContexte, sortieJSON, T, idSid, fichierAuto, barres, lireMeta, ecrireMeta,
  dossierMemoire, gitHead, analyserRelais, cleProjet, estHash, dossierRelais,
} from './commun.mjs';
import path from 'node:path';
import { lireRegistre, pourDossier, lignesCouvertes } from './registre.mjs';

try {
  if (!V2) process.exit(0);
  const e = await lireStdin();
  if (!e.session_id) process.exit(0);
  const sid = idSid(e.session_id);
  const f = fichierAuto(sid);
  let st; try { st = fs.statSync(f); } catch { process.exit(0); }
  const meta = lireMeta(sid) || {};
  if (meta.mtimeVu === st.mtimeMs) process.exit(0); // not rewritten since the last check

  const texte = fs.readFileSync(f, 'utf8');
  const t0 = Date.now();
  const memDir = dossierMemoire(e.cwd, e.transcript_path);
  const headMem = (meta.memDir === memDir && estHash(meta.headMemDemande) && meta.headMemDemande) || (memDir ? gitHead(memDir, 3000) : null);
  const headCwd = gitHead(e.cwd, Math.min(3000, 8000 - (Date.now() - t0)));
  const a = analyserRelais(texte);
  const t = T();
  const pbs = [];
  if (a.trop) pbs.push(t.pbLong(a.pleines, a.car));
  if (a.manquantes.length) pbs.push(t.pbSections(a.manquantes.join(', ')));
  if (a.secrets.length) pbs.push(t.pbSecret(a.secrets.join(', ')));
  const couvertes = lignesDejaDites(sid, texte, e.cwd || meta.cwd);
  if (couvertes.length) pbs.push(t.pbCouvert(couvertes.slice(0, 6).map((x) => `${x.ligne} -> ${x.ou}`).join(' ; ')));
  // Written in answer to a relay request (1 s tolerance for coarse file-system clocks)?
  const demande = Number(meta.demandeLe) > 0 && st.mtimeMs >= Number(meta.demandeLe) - 1000;
  const avertir = demande && pbs.length > 0 && !e.stop_hook_active && !meta.averti;

  ecrireMeta(sid, {
    ...meta, sid, cle: cleProjet(e), cwd: e.cwd || meta.cwd, mtimeVu: st.mtimeMs, ecritMs: st.mtimeMs,
    ctx: dernierContexte(e.transcript_path) || meta.ctx || 0, memDir, headMem, headCwd,
    averti: meta.averti || avertir,
  });
  if (avertir) sortieJSON({ decision: 'block', reason: t.blocage(barres(f), pbs.join(' ; ')) });
} catch { /* never a visible error */ }
process.exit(0);

// Relay lines already said by what the NEXT session will get anyway: the instruction files this session
// really loaded at start (InstructionsLoaded, see instructions.mjs: session_start, or included by such a
// file) and the active registry entries for this folder (memoire.mjs re-injects them). A file that is only
// on disk (memory topic file, lazily loaded nested CLAUDE.md, the other computer's CLAUDE.md) never counts.
function lignesDejaDites(sid, texte, cwd) {
  const charges = [];
  try {
    const dir = path.join(dossierRelais(), '.etat');
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`instr_${sid}_`)) { try { charges.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* skip */ } }
  } catch { /* none */ }
  const auDemarrage = new Set(charges.filter((x) => x.raison === 'session_start').map((x) => x.p));
  const retenus = charges.filter((x) => x.raison === 'session_start' || (x.raison === 'include' && auDemarrage.has(x.parent)));
  const sources = [];
  for (const x of retenus) { try { sources.push({ nom: barres(x.p), texte: fs.readFileSync(x.p, 'utf8').slice(0, 200000) }); } catch { /* gone: does not count */ } }
  if (cwd) for (const x of pourDossier(lireRegistre(), cwd)) sources.push({ nom: `registre ${x.id}`, texte: x.texte, ligneParLigne: false });
  return sources.length ? lignesCouvertes(texte, sources) : [];
}
