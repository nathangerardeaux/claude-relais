// SessionStart hook: after /clear, automatically reloads the latest relay written for this working
// folder (a few thousand tokens instead of the whole history). Used ONCE, then archived.
// In a brand-new session opened elsewhere (startup), it is only announced, never forced.
import fs from 'node:fs';
import path from 'node:path';
import { dossierRelais, lireStdin, normCwd, sortieJSON, duree, derniereTaille, k, T } from './commun.mjs';

const MAX_CAR = 16000;           // safety net: a relay is not a novel
const FENETRE_CLEAR = 72 * 3600e3;
const FENETRE_STARTUP = 12 * 3600e3;

try {
  const e = await lireStdin();
  const source = e.source || 'startup';
  if (source !== 'clear' && source !== 'startup') process.exit(0);
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
    .filter((f) => f.endsWith('.md') && !f.endsWith('.repris.md'))
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
  if (!r || r.age > fenetre) process.exit(0);
  const t = T();
  const depuis = duree(r.age);

  if (source === 'startup') {
    // New tab: maybe another topic. Announce without loading.
    sortieJSON({
      systemMessage: t.dispo(r.titre, depuis),
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: t.noteDispo(r.p.replace(/\\/g, '/'), r.titre, depuis) },
    });
    process.exit(0);
  }

  // After /clear: reload the relay and archive it (single use).
  const contenu = r.texte.length > MAX_CAR ? `${r.texte.slice(0, MAX_CAR)}\n${t.tronque}` : r.texte;
  // Archive this relay AND any older one for this folder: an outdated relay must never come back later.
  for (const c of candidats) {
    try { fs.renameSync(c.p, c.p.replace(/\.md$/, '.repris.md')); } catch { /* already gone */ }
  }
  // Size of the conversation that was just cleared: bilan.mjs compares it after the first answer.
  const avant = derniereTaille(e.cwd, e.session_id);
  if (avant) {
    const sid = String(e.session_id || 'x').replace(/[^\w-]/g, '');
    fs.writeFileSync(path.join(dir, '.etat', `bilan_${sid}.json`), JSON.stringify({ avant }));
  }
  sortieJSON({
    systemMessage: avant ? t.reprisAvant(r.titre, depuis, k(avant)) : t.repris(r.titre, depuis),
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${t.noteRepris}\n\n${contenu}` },
  });
} catch {
  process.exit(0);
}
