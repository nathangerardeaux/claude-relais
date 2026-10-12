// SessionStart hook (startup, /clear, compaction): tells Claude ONCE per session to hand long tasks that
// do not need the conversation history to a cheaper subagent. Measured (docs/delegation.md): -20 to -40 %
// on such a task, and the main conversation stays lighter afterwards (132k instead of 190k).
// Once per session rather than on every message: the note stays in the conversation, ~90 tokens in all.
// RELAIS_DELEGUER=0 turns it off. Resume: the note is already in the resumed conversation.
// "Model per task" (opt-in from the dashboard, docs/routage.md): while <config>/relais/routage.json says
// actif, the note becomes the measured per-task rule, plus the profile of this project if it has a clear one.
// Absent or unreadable file = off = the note above, unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { lireStdin, sortieJSON, T, dossierClaude, normCwd } from './commun.mjs';

const fichierRoutage = () => process.env.RELAIS_ROUTAGE || path.join(dossierClaude(), 'relais', 'routage.json');

function note(cwd) {
  let r;
  try { r = JSON.parse(fs.readFileSync(fichierRoutage(), 'utf8')); } catch { return T().deleguer; }
  if (r?.actif !== true) return T().deleguer;
  const p = r.profils?.[normCwd(cwd)];
  const n = Number(p?.parts?.[p?.profil]);
  const ligne = ['lecture', 'code', 'redaction', 'recherche'].includes(p?.profil) && n > 0 ? ` ${T().profilRoutage(p.profil, Math.round(n))}` : '';
  return T().routage + ligne;
}

try {
  const e = await lireStdin();
  const source = e.source || 'startup';
  if (process.env.RELAIS_DELEGUER !== '0' && ['startup', 'clear', 'compact'].includes(source)) {
    sortieJSON({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: note(e.cwd || process.cwd()) } });
  }
} catch { /* never a visible error */ }
process.exit(0);
