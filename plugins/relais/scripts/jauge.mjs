// UserPromptSubmit hook: measures how much the conversation makes the model RE-READ on every action,
// and warns (you on screen, Claude in its context) when it is time to hand over.
// Silent below the threshold. Never blocks the message.
// v2: whenever a relay is requested (threshold in auto mode, or /relais), Claude gets the EXACT file of
// this session (auto_<session>.md) and the script records the real folder itself (relais/.etat/).
import fs from 'node:fs';
import path from 'node:path';
import {
  SEUIL_AVERTIR, SEUIL_INSISTER, RAPPEL_TOUS_LES, AUTO, V2, dossierRelais, lireStdin, dernierContexte, noterTaille, k, sortieJSON, T,
  fichierAuto, barres, noterDemande,
} from './commun.mjs';
import { fileURLToPath } from 'node:url';

// Where durable knowledge goes now (registre.mjs), instead of the old a-ranger.md list.
const COMMANDE_REGISTRE = `node "${barres(path.join(path.dirname(fileURLToPath(import.meta.url)), 'registre.mjs'))}" ajouter`;

// Explicit relay request (v2): "/relais", or one of a few exact sentences at the START of the message
// ("fais le relais", "écris le relais", "write the handoff"...), optionally after "ok," / "oui". Anything
// else ("lance les tests du relais", "do not make a relay", "relais : pourquoi…") is not a request.
const DEBUT = String.raw`^(?:(?:ok|oui|vas-y|go|bon|alors|yes|please)[\s,.!]+)?`;
const PHRASE = new RegExp(`${DEBUT}(?<!\\p{L})(?:(?:fais|écris|ecris|passe|rédige|redige)\\s+le\\s+relais|write\\s+the\\s+(?:relay|handoff))(?!\\p{L})`, 'iu');
// "/relais" and its namespaced form "/relais:relais" are requests; another skill of the plugin
// ("/relais:regles") is not.
const demandeRelais = (p) => /^\/(?:relais:)?relais(?![\p{L}:])/iu.test(p) || PHRASE.test(p);

try {
  const e = await lireStdin();
  const prompt = String(e.prompt || '').trim();
  const ctx = dernierContexte(e.transcript_path);
  // Remembered for the "tokens freed" tally after /clear. A relais folder that cannot be written must
  // never silence the gauge: every write below is optional.
  try { noterTaille(e.session_id, e.cwd, ctx); } catch { /* read-only */ }

  if (V2 && demandeRelais(prompt)) {
    try { noterDemande(e); } catch { /* read-only */ }
    const t = T();
    sortieJSON({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
      additionalContext: t.noteRelais2(ctx ? k(ctx) : '', barres(fichierAuto(e.session_id)), COMMANDE_REGISTRE) } });
    process.exit(0);
  }
  if (!V2 && /^\/?relais\b/i.test(prompt)) { // v1: the relay is being written right now: give Claude the real size
    if (ctx) sortieJSON({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: T().noteTailleRelais(k(ctx), barres(dossierRelais())) } });
    process.exit(0);
  }
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
  try { fs.writeFileSync(etatF, JSON.stringify({ dernier: ctx, le: new Date().toISOString() })); } catch { /* read-only: reminds again */ }

  const t = T();
  if (AUTO) {
    // One file per conversation, rewritten at each threshold: never two relays of different ages.
    const fichier = path.join(dossierRelais(), `auto_${sid}.md`).replace(/\\/g, '/');
    if (V2) { try { noterDemande(e); } catch { /* read-only */ } }
    sortieJSON({
      systemMessage: t.auto(k(ctx)),
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
        additionalContext: V2 ? t.noteAuto2(k(ctx), fichier, COMMANDE_REGISTRE) : t.noteAuto(k(ctx), fichier) },
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
