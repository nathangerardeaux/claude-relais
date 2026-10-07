// Stop hook: when devil's advocate mode is on, Claude is not allowed to conclude before an independent
// agent has tried to refute its answer. Silent when the mode is off. Never loops: when Claude is
// already continuing because of this hook (stop_hook_active), it is let through.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireStdin, lireEtat, dernierTour, T } from './commun.mjs';

const MIN_CAR = Number(process.env.AVOCAT_MIN_CAR || 200); // shorter answer without any action: nothing to check
const FICHIER_AGENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agents', 'avocat-du-diable.md')
  .replace(/\\/g, '/');

try {
  const e = await lireStdin();
  if (e.stop_hook_active) process.exit(0);
  if (!lireEtat().actif) process.exit(0);
  const tour = dernierTour(e.transcript_path);
  if (tour.dejaVerifie) process.exit(0);
  const texte = typeof e.last_assistant_message === 'string' && e.last_assistant_message ? e.last_assistant_message : tour.texte;
  if (texte.trim().length < MIN_CAR && !tour.actions) process.exit(0);
  // systemMessage is shown to the user by Claude Code itself: they always know why more tokens are used.
  process.stdout.write(JSON.stringify({ decision: 'block', reason: T().consigne(FICHIER_AGENT), systemMessage: T().enCours }));
} catch { /* never a visible error: at worst, no check */ }
process.exit(0);
