// SessionStart hook (startup, /clear, compaction): tells Claude ONCE per session to hand long tasks that
// do not need the conversation history to a cheaper subagent. Measured (docs/delegation.md): -20 to -40 %
// on such a task, and the main conversation stays lighter afterwards (132k instead of 190k).
// Once per session rather than on every message: the note stays in the conversation, ~90 tokens in all.
// RELAIS_DELEGUER=0 turns it off. Resume: the note is already in the resumed conversation.
import { lireStdin, sortieJSON, T } from './commun.mjs';

try {
  const e = await lireStdin();
  const source = e.source || 'startup';
  if (process.env.RELAIS_DELEGUER !== '0' && ['startup', 'clear', 'compact'].includes(source)) {
    sortieJSON({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: T().deleguer } });
  }
} catch { /* never a visible error */ }
process.exit(0);
