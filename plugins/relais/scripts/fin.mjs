// SessionEnd hook: records the final size of the conversation that is closing (typically on /clear),
// so the next session can show how many tokens the relay freed. Silent, never blocks.
// v2: also records WHICH session closed, in which project and why (reason "clear" = the next session may
// reload this session's own relay, and only that one).
import path from 'node:path';
import { lireStdin, dernierContexte, noterTaille, V2, dossierRelais, idSid, ecrireJSON, cleProjet } from './commun.mjs';

try {
  const e = await lireStdin();
  const sid = idSid(e.session_id);
  if (V2 && e.session_id && (e.cwd || e.transcript_path)) {
    // Written FIRST (before reading the log, up to 16 MB) and atomically: reprise.mjs may be waiting.
    ecrireJSON(path.join(dossierRelais(), '.etat', `ferme_${sid}.json`),
      { sid, cle: cleProjet(e), cwd: e.cwd, reason: String(e.reason || ''), le: Date.now() });
  }
  const ctx = dernierContexte(e.transcript_path);
  // The final size goes to a separate file: the closing record may already have been consumed (renamed).
  if (V2 && e.session_id) ecrireJSON(path.join(dossierRelais(), '.etat', `fermectx_${sid}.json`), { ctx });
  noterTaille(e.session_id, e.cwd, ctx);
} catch { /* nothing to say */ }
process.exit(0);
