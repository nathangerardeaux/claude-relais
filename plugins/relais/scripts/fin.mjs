// SessionEnd hook: records the final size of the conversation that is closing (typically on /clear),
// so the next session can show how many tokens the relay freed. Silent, never blocks.
import { lireStdin, dernierContexte, noterTaille } from './commun.mjs';

try {
  const e = await lireStdin();
  noterTaille(e.session_id, e.cwd, dernierContexte(e.transcript_path));
} catch { /* nothing to say */ }
process.exit(0);
