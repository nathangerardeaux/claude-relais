// Stop hook: after the FIRST answer of a session resumed from a relay, shows the tally
// (tokens re-read before the relay, now, and freed per action). Shown once, then forgotten.
import fs from 'node:fs';
import path from 'node:path';
import { dossierRelais, lireStdin, dernierContexte, k, sortieJSON, T } from './commun.mjs';

try {
  const e = await lireStdin();
  const sid = String(e.session_id || 'x').replace(/[^\w-]/g, '');
  const f = path.join(dossierRelais(), '.etat', `bilan_${sid}.json`);
  if (!fs.existsSync(f)) process.exit(0);
  const { avant } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const maintenant = dernierContexte(e.transcript_path);
  if (!maintenant) process.exit(0); // no measured answer yet: try again at the next one
  fs.unlinkSync(f);
  if (!(avant > maintenant)) process.exit(0);
  const libere = avant - maintenant;
  sortieJSON({ systemMessage: T().bilan(k(avant), k(maintenant), k(libere), Math.round((libere / avant) * 100)) });
} catch { /* never a visible error */ }
process.exit(0);
