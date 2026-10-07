// Shared helpers for the avocat plugin. A hook must NEVER block or break a session: when in doubt,
// stay silent. 100% local: no network access from these scripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The on/off switch. Shared with the relais dashboard (tableau/serveur.mjs), which reads and writes
// the same file. AVOCAT_ETAT: for tests.
export const fichierEtat = () => process.env.AVOCAT_ETAT
  || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'avocat', 'etat.json');

export function lireEtat() {
  try {
    const e = JSON.parse(fs.readFileSync(fichierEtat(), 'utf8'));
    return { actif: e?.actif === true, depuis: e?.depuis || '' };
  } catch { return { actif: false, depuis: '' }; }
}

export function ecrireEtat(actif) {
  const f = fichierEtat();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const e = { actif: !!actif, depuis: new Date().toISOString() };
  fs.writeFileSync(f, JSON.stringify(e, null, 2));
  return e;
}

export async function lireStdin() {
  let s = '';
  for await (const c of process.stdin) s += c;
  try { return JSON.parse(s); } catch { return {}; }
}

// A real message typed by the user (not a tool result, not text injected by Claude Code).
function estPrompt(o) {
  if (o?.type !== 'user' || o.isMeta || o.isSidechain) return false;
  const c = o.message?.content;
  if (typeof c === 'string') return !/^\s*<(local-command|bash-std|task-notification)/.test(c);
  return Array.isArray(c) && !c.some((b) => b?.type === 'tool_result') && c.some((b) => b?.type === 'text' || b?.type === 'image');
}

const ACTIONS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']);

// What Claude did since the user's last message: its text, the number of actions (edits, commands)
// and whether a devil's advocate already checked this turn. Only the end of the log is read.
export function dernierTour(transcript) {
  const res = { texte: '', actions: 0, dejaVerifie: false };
  if (!transcript || !fs.existsSync(transcript)) return res;
  const taille = fs.statSync(transcript).size;
  const n = Math.min(taille, 8 << 20);
  const fd = fs.openSync(transcript, 'r');
  let lignes;
  try {
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, taille - n);
    lignes = buf.toString('utf8').split('\n');
  } finally { fs.closeSync(fd); }
  const textes = [];
  for (let i = lignes.length - 1; i >= 0; i--) {
    let o; try { o = JSON.parse(lignes[i]); } catch { continue; }
    if (estPrompt(o)) break;
    if (o?.type !== 'assistant' || o.isSidechain || !Array.isArray(o.message?.content)) continue;
    for (const b of o.message.content) {
      if (b?.type === 'text' && b.text) textes.unshift(b.text);
      else if (b?.type === 'tool_use') {
        if (ACTIONS.has(b.name)) res.actions += 1;
        const i2 = b.input || {};
        if ((b.name === 'Agent' || b.name === 'Task')
          && /avocat/i.test(`${i2.subagent_type || ''} ${i2.description || ''}`)) res.dejaVerifie = true;
      }
    }
  }
  res.texte = textes.join('\n');
  return res;
}

export function langue() {
  const forcee = String(process.env.AVOCAT_LANG || process.env.RELAIS_LANG || '').toLowerCase();
  if (forcee === 'fr' || forcee === 'en') return forcee;
  let loc = '';
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* ignore */ }
  loc = loc || process.env.LC_ALL || process.env.LANG || '';
  return /^fr/i.test(loc) ? 'fr' : 'en';
}

const TEXTES = {
  fr: {
    consigne: (f) => `[avocat du diable] Le mode avocat du diable est activé : cette réponse doit être contre-vérifiée avant d'être finale.
1. Lance l'agent « avocat-du-diable » avec l'outil Agent (il peut apparaître sous le nom « avocat:avocat-du-diable » ; s'il n'est pas dans la liste, lance un agent general-purpose dont la description contient « avocat du diable » et demande-lui de suivre à la lettre le fichier ${f}). Donne-lui : la demande de l'utilisateur, ta réponse complète, la liste de tes affirmations vérifiables (faits, chiffres, comportement du code, résultats annoncés) et les fichiers ou commandes concernés.
2. À son retour : corrige ce qu'il démontre faux (y compris le code si besoin) en disant ce qui change, signale clairement ce qui reste douteux ou non vérifié, ne répète pas ce qui est confirmé.
3. Termine par UNE ligne : « Avocat du diable activé : X confirmé(s), Y corrigé(s), Z douteux (/avocat off pour le couper). »
Si ta réponse ne contenait vraiment rien de vérifiable, écris seulement « Avocat du diable activé : rien à vérifier (/avocat off pour le couper). »`,
    enCours: 'Avocat du diable activé : la réponse est contre-vérifiée par un agent, ce qui consomme plus de tokens. /avocat off pour le couper.',
    on: 'Avocat du diable ACTIVÉ : chaque réponse de Claude sera contre-vérifiée par un agent indépendant (plus de tokens par réponse).',
    off: 'Avocat du diable désactivé.',
    statut: (a, d) => (a ? `Avocat du diable : activé (depuis ${d}).` : 'Avocat du diable : désactivé.'),
  },
  en: {
    consigne: (f) => `[devil's advocate] Devil's advocate mode is on: this answer must be cross-checked before it is final.
1. Launch the "avocat-du-diable" agent with the Agent tool (it may be listed as "avocat:avocat-du-diable"; if it is not in the list, launch a general-purpose agent whose description contains "avocat du diable" and tell it to follow the file ${f} to the letter). Give it: the user's request, your full answer, the list of your verifiable claims (facts, numbers, code behaviour, claimed results) and the files or commands involved.
2. When it reports back: fix what it proves wrong (code included if needed) and say what changed, clearly flag what remains doubtful or unverified, do not repeat what was confirmed.
3. End with ONE line: "Devil's advocate on: X confirmed, Y fixed, Z doubtful (/avocat off to switch it off)."
If your answer really contained nothing verifiable, only write "Devil's advocate on: nothing to check (/avocat off to switch it off)."`,
    enCours: "Devil's advocate on: this answer is being cross-checked by an agent, which uses more tokens. /avocat off to switch it off.",
    on: "Devil's advocate ON: every Claude answer will be cross-checked by an independent agent (more tokens per answer).",
    off: "Devil's advocate off.",
    statut: (a, d) => (a ? `Devil's advocate: on (since ${d}).` : "Devil's advocate: off."),
  },
};
export const T = () => TEXTES[langue()];
