// InstructionsLoaded hook: records which instruction files (CLAUDE.md, .claude/rules/*.md) Claude Code
// REALLY loaded in this session, and why. The Stop hook (controle.mjs) uses it to tell which relay lines
// are already said by a file reloaded at every session: only a file proven loaded counts, never a file
// that merely exists (a memory topic file, the CLAUDE.md of another computer, a nested file never visited).
// One small file per loaded file: these hooks run in parallel at session start, a shared file would lose
// entries. Asynchronous for Claude Code, never blocks. Never an error.
import crypto from 'node:crypto';
import path from 'node:path';
import { lireStdin, dossierRelais, ecrireJSON, idSid } from './commun.mjs';

try {
  const e = await lireStdin();
  if (e.session_id && e.file_path) {
    const h = crypto.createHash('sha1').update(String(e.file_path)).digest('hex').slice(0, 12);
    ecrireJSON(path.join(dossierRelais(), '.etat', `instr_${idSid(e.session_id)}_${h}.json`), {
      p: String(e.file_path), type: e.memory_type || '', raison: e.load_reason || '', parent: e.parent_file_path || '', le: Date.now(),
    });
  }
} catch { /* never a visible error */ }
process.exit(0);
