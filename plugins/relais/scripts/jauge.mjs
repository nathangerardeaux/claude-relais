// UserPromptSubmit hook: measures how much the conversation makes the model RE-READ on every action,
// and warns (you on screen, Claude in its context) when it is time to hand over.
// Silent below the threshold. Never blocks the message.
import fs from 'node:fs';
import path from 'node:path';
import {
  SEUIL_AVERTIR, SEUIL_INSISTER, RAPPEL_TOUS_LES, AUTO, dossierRelais, lireStdin, dernierContexte, k, sortieJSON, T,
} from './commun.mjs';

try {
  const e = await lireStdin();
  const prompt = String(e.prompt || '').trim();
  if (/^\/?relais\b/i.test(prompt)) process.exit(0); // the relay is being written right now

  const ctx = dernierContexte(e.transcript_path);
  if (ctx < SEUIL_AVERTIR) process.exit(0);

  // One reminder per threshold crossed (150k, then 250k, then every +100k): no nagging.
  const sid = String(e.session_id || 'x').replace(/[^\w-]/g, '');
  const etatF = path.join(dossierRelais(), '.etat', `${sid}.json`);
  let etat = { dernier: 0 };
  try { etat = JSON.parse(fs.readFileSync(etatF, 'utf8')); } catch { /* first time */ }
  const fort = ctx >= SEUIL_INSISTER;
  const doitRappeler = etat.dernier === 0
    || (fort && etat.dernier < SEUIL_INSISTER)
    || ctx >= etat.dernier + RAPPEL_TOUS_LES;
  if (!doitRappeler) process.exit(0);
  fs.writeFileSync(etatF, JSON.stringify({ dernier: ctx, le: new Date().toISOString() }));

  const t = T();
  if (AUTO) {
    // One file per conversation, rewritten at each threshold: never two relays of different ages.
    const fichier = path.join(dossierRelais(), `auto_${sid}.md`).replace(/\\/g, '/');
    sortieJSON({
      systemMessage: t.auto(k(ctx)),
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: t.noteAuto(k(ctx), fichier) },
    });
    process.exit(0);
  }
  sortieJSON({
    systemMessage: fort ? t.insister(k(ctx)) : t.avertir(k(ctx)),
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: fort ? t.noteInsister(k(ctx)) : t.noteAvertir(k(ctx)) },
  });
} catch {
  process.exit(0); // never a visible error: at worst, no reminder
}
