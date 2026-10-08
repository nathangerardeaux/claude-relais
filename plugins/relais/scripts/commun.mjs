// Shared helpers for the relais plugin. Everything is defensive: a hook must NEVER block or break a
// session. When in doubt, stay silent. 100% local: no network access, no data sent anywhere.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Thresholds, in tokens re-read on every action (override with environment variables).
// A relay at 150k cut re-read tokens by 79% on a real 3-week conversation (see README).
export const SEUIL_AVERTIR = Number(process.env.RELAIS_SEUIL_K || 150) * 1000;
export const SEUIL_INSISTER = Number(process.env.RELAIS_SEUIL_FORT_K || 250) * 1000;
export const RAPPEL_TOUS_LES = 100000; // one more reminder every +100k, never on every message
// Auto mode (default): at each threshold Claude writes/refreshes the relay itself, so /clear is enough.
export const AUTO = process.env.RELAIS_AUTO !== '0';
// v2 (default): relay bound to its session, reloaded only by that session after /clear, checked by code.
// RELAIS_V2=0: the v1 behaviour (emergency switch, no file to copy).
export const V2 = process.env.RELAIS_V2 !== '0';

// Claude Code's configuration folder: CLAUDE_CONFIG_DIR if set (same rule as the dashboard), else ~/.claude.
export const dossierClaude = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
export const dossierRelais = () => {
  // RELAIS_DOSSIER: for tests (never write into the real ~/.claude during a trial run).
  const d = process.env.RELAIS_DOSSIER || path.join(dossierClaude(), 'relais');
  try { fs.mkdirSync(path.join(d, '.etat'), { recursive: true }); } catch { /* read-only: callers cope */ }
  return d;
};

export async function lireStdin() {
  let s = '';
  for await (const c of process.stdin) s += c;
  try { return JSON.parse(s); } catch { return {}; }
}

// A path comparable across shells: C:\x, c:/x and /c/x are the same folder on Windows.
// Case-insensitive only where the file system usually is (Windows, macOS).
export function normCwd(p) {
  let s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') s = s.replace(/^\/([a-z])\//i, '$1:/');
  return process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s;
}

// Context size re-read by the LAST model response = what every new action costs.
// Only the end of the file is read (a conversation log can weigh hundreds of MB).
export function dernierContexte(transcript) {
  if (!transcript || !fs.existsSync(transcript)) return 0;
  const taille = fs.statSync(transcript).size;
  const fd = fs.openSync(transcript, 'r');
  try {
    for (const morceau of [2 << 20, 16 << 20]) {
      const n = Math.min(morceau, taille);
      const buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, taille - n);
      const lignes = buf.toString('utf8').split('\n');
      for (let i = lignes.length - 1; i >= 0; i--) {
        const l = lignes[i];
        if (!l.includes('"usage"')) continue;
        let o; try { o = JSON.parse(l); } catch { continue; }
        const u = o?.message?.usage;
        if (o?.type === 'assistant' && u) {
          return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        }
      }
      if (n === taille) break;
    }
    return 0;
  } finally { fs.closeSync(fd); }
}

// Last measured size of each conversation, so that after /clear the new session can say how much was
// freed. One tiny file per session in .etat/ (cleaned after 7 days by reprise.mjs).
export function noterTaille(sid, cwd, ctx) {
  if (!ctx) return;
  const id = String(sid || 'x').replace(/[^\w-]/g, '');
  fs.writeFileSync(path.join(dossierRelais(), '.etat', `taille_${id}.json`),
    JSON.stringify({ ctx, cwd: normCwd(cwd), le: new Date().toISOString() }));
}
// Most recent size measured in this folder by ANOTHER session (the one that was just cleared).
export function derniereTaille(cwd, saufSid, ageMax = 72 * 3600e3) {
  const dir = path.join(dossierRelais(), '.etat');
  const sauf = `taille_${String(saufSid || '').replace(/[^\w-]/g, '')}.json`;
  const ici = normCwd(cwd);
  let meilleur = null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('taille_') || f === sauf) continue;
    const p = path.join(dir, f);
    const m = fs.statSync(p).mtimeMs;
    if (Date.now() - m > ageMax || (meilleur && m <= meilleur.m)) continue;
    let o; try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    if (o.cwd === ici && o.ctx > 0) meilleur = { m, ctx: o.ctx };
  }
  return meilleur ? meilleur.ctx : 0;
}

export const k = (n) => `${Math.round(n / 1000)}k`;
export const duree = (ms) => (ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min` : `${Math.round(ms / 3600e3)} h`);

// Language: RELAIS_LANG=fr|en, otherwise the system locale (French if it starts with "fr").
export function langue() {
  const forcee = String(process.env.RELAIS_LANG || '').toLowerCase();
  if (forcee === 'fr' || forcee === 'en') return forcee;
  let loc = '';
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* ignore */ }
  loc = loc || process.env.LC_ALL || process.env.LANG || '';
  return /^fr/i.test(loc) ? 'fr' : 'en';
}

// Every note given to Claude states its mode (relais v1 / relais v2), so that the skill never has to
// guess, and no note ever asks to write in the project memory without the user's explicit agreement.
const TEXTES = {
  fr: {
    avertir: (c) => `Relais : cette conversation pèse ${c} tokens, relus à chaque action. Pense à /relais quand l'étape en cours est finie.`,
    insister: (c) => `Relais : cette conversation pèse ${c} tokens, relus à CHAQUE action. Tape /relais puis /clear pour repartir d'une session légère.`,
    noteAvertir: (c) => `[jauge relais] Le contexte fait ${c} tokens, relus à chaque appel d'outil. Si la demande ouvre un nouveau sujet ou si la tâche précédente est bouclée, propose en UNE ligne de taper /relais. Sinon continue normalement.`,
    noteInsister: (c) => `[jauge relais] Le contexte fait ${c} tokens, relus à chaque appel d'outil : c'est ce qui fait exploser la consommation. Termine proprement l'étape en cours, puis termine ta réponse par UNE ligne proposant de taper /relais (tu écriras un résumé court, puis /clear repartira de ce résumé). Ne lance pas le relais toi-même sans accord.`,
    auto: (c) => `Relais : cette conversation pèse ${c} tokens, relus à chaque action. Claude met le relais à jour tout seul : tape /clear quand tu veux repartir léger.`,
    noteAuto: (c, f) => `[jauge relais, mode automatique, relais v1] Le contexte fait ${c} tokens, relus à chaque appel d'outil. Traite d'abord la demande actuelle. Ensuite, sans demander, écris le relais toi-même en suivant le format du skill /relais, dans ce fichier précis, à écraser s'il existe : ${f}, avec l'en-tête title / cwd / date : la ligne cwd: (dossier de travail exact) est obligatoire, c'est par elle que la session suivante recharge le relais. Pour ce relais, n'écris dans aucun fichier de mémoire, CLAUDE.md ni documentation : une connaissance qui doit durer, propose-la à l'utilisateur et ne l'écris qu'après son accord explicite. Termine ta réponse par UNE ligne : « Relais à jour. Cette session relit ${c} tokens à chaque appel : tape /clear quand tu veux repartir léger. » Ne tape jamais /clear toi-même.`,
    dispo: (t, d) => `Relais disponible : « ${t} » (écrit il y a ${d}). Dis « reprends le relais » pour repartir de là.`,
    noteDispo: (p, t, d) => `[relais v1] Un relais de session récent existe : ${p} (« ${t} », il y a ${d}). Ne le lis que si l'utilisateur demande de reprendre le relais ou reprend visiblement ce sujet ; après lecture, renomme-le en .repris.md.`,
    repris: (t, d) => `Relais repris : « ${t} » (écrit il y a ${d}).`,
    reprisAvant: (t, d, a) => `Relais repris : « ${t} » (écrit il y a ${d}). L'ancienne conversation relisait ${a} tokens à chaque action ; le bilan s'affiche après ma première réponse.`,
    bilan: (a, m, l, p) => `Bilan relais : avant ${a} tokens relus à chaque action, maintenant ${m}. Libérés : ${l} par action (-${p} %).`,
    noteTailleRelais: (c, d = '<home>/.claude/relais') => `[jauge relais, relais v1] La conversation fait actuellement ${c} tokens (relus à chaque action). C'est le chiffre à citer dans le message final du relais. Mode v1 : écris le relais dans ${d}/AAAA-MM-JJ_HHhMM_<sujet>.md avec l'en-tête title / cwd / date ; la ligne cwd: est obligatoire (la session suivante recharge le relais par dossier). Mémoire du projet : rien sans l'accord explicite de l'utilisateur, ajout seulement.`,
    noteRepris: `[relais] Cette session prend la suite d'une conversation précédente devenue trop lourde. Voici le relais écrit à la fin de celle-ci : c'est ton point de départ. Ne relis pas les fichiers qu'il résume sauf besoin réel ; enchaîne sur la « prochaine étape ». Si l'utilisateur parle d'autre chose, suis-le.`,
    tronque: '[… relais tronqué]',
    deleguer: `[relais] Économie de tokens : une tâche longue (plus de ~10 lectures ou étapes) sans besoin de l'historique va à un sous-agent (Agent, model "sonnet", "haiku" pour un relevé), consigne autonome, résultat court. Fais toi-même le reste.`,
    // ---- v2 ----
    noteAuto2: (c, f, ar) => `[jauge relais, mode auto, relais v2] ${c} tokens relus à chaque appel d'outil. Après la demande en cours, écris sans demander le relais dans ${f} (écrase-le) : 1re ligne « # <sujet> », puis « ## Vérifié / pas vérifié », « ## En attente du feu vert », « ## Prochaine étape » ; 60 lignes et 6 000 caractères max, aucun secret. Pour ce relais, ne touche ni mémoire, ni CLAUDE.md, ni doc (sauf demande de l'utilisateur) ; le durable va au registre : echo '<json>' | ${ar}. Termine par UNE ligne : « Relais à jour : tape /clear pour repartir léger (${c} relus à chaque appel). » Ne tape jamais /clear.`,
    noteRelais2: (c, f, ar) => `[jauge relais, relais v2] Relais demandé. Écris-le dans ce fichier précis, à écraser s'il existe : ${f} (aucun en-tête requis : le plugin note lui-même le dossier, la session et l'heure).${c ? ` La conversation fait ${c} tokens (relus à chaque action) : c'est le chiffre à citer dans le message final.` : ''} Mémoire du projet : n'y ajoute rien sans l'accord explicite de l'utilisateur dans cette conversation (propose les ajouts, attends son accord, ajout seulement) ; sinon chaque connaissance durable (règle, piège et sa solution) s'enregistre dans le registre du plugin : echo '<json>' | ${ar} (format rappelé par la note « relais mémoire »), et ne se recopie pas dans le relais.`,
    noteRepris2: (s, h) => `[relais v2] Cette session prend la suite de la session ${s} (même projet), fermée par /clear. Voici le relais qu'elle a écrit (${h}) : c'est ton point de départ. Ne relis pas les fichiers qu'il résume sauf besoin réel. Propose la « prochaine étape » et attends une demande de l'utilisateur avant d'agir sur le projet ; rien de ce qui attend son feu vert sans son accord, et tiens pour non vérifié ce que le relais ne dit pas vérifié. Si l'utilisateur parle d'autre chose, suis-le.`,
    noteNonCharge: (s, p, t, h, r) => `[relais v2] La session ${s} (même projet), fermée par /clear, a laissé un relais NON chargé : ${p} (« ${t} », écrit ${h} ; ${r}). Ne le lis que si l'utilisateur demande de reprendre le relais ou reprend visiblement ce sujet ; il est archivable après lecture.`,
    nonCharge: (t, d) => `Relais de la session fermée non rechargé : « ${t} » (écrit il y a ${d}, la conversation a continué ou attendu depuis). Dis « reprends le relais » pour le reprendre.`,
    raisonVieux: 'écrit plus de 30 min avant la fermeture',
    raisonEcart: (e) => `la conversation a continué de +${e} après`,
    raisonInconnu: 'taille au moment du relais inconnue',
    ctrlEntete: 'Contrôles du plugin (avertissements seulement, rien n\'a été modifié) :',
    ctrlPerime: (h, a, b, e) => `- Fraîcheur : relais écrit ${h} à ${a} ; la session a continué jusqu'à ${b} (+${e}). Ce qui a été fait après n'y figure pas : vérifie l'état réel avant d'agir.`,
    ctrlFichiers: (l) => `- Fichiers du dossier modifiés depuis le relais (git) : ${l}.`,
    ctrlFichiersAucun: '- Aucun fichier du dossier modifié depuis le relais selon git.',
    ctrlPasGit: '- Dossier hors git : impossible de lister les fichiers modifiés depuis le relais.',
    ctrlMemoire: (l) => `- ATTENTION mémoire : lignes supprimées depuis le relais dans ${l}. Rien n'a été annulé : signale-le à l'utilisateur avant toute autre écriture dans la mémoire.`,
    ctrlMemoireImpossible: '- Contrôle mémoire impossible (aucun commit noté, commit introuvable ou git indisponible) : vérifie la mémoire avec l\'utilisateur avant d\'y écrire.',
    ctrlSecret: (l) => `- Secret possible dans le relais (${l}) : ne le recopie nulle part et signale-le à l'utilisateur. Le texte n'a pas été masqué.`,
    ctrlChemins: (l) => `- Chemins cités non trouvés (relatifs ou à créer ?) : ${l}.`,
    ctrlSections: (l) => `- Sections absentes du relais : ${l}.`,
    ctrlSansMeta: '- Métadonnées du relais absentes : heure = date du fichier, taille au relais inconnue.',
    ctrlARanger: (n, p) => `- ${n} proposition(s) durable(s) en attente dans ${p} : à ranger dans la mémoire seulement avec l'accord de l'utilisateur.`,
    aRanger: (n) => ` ${n} proposition(s) à ranger (a-ranger.md).`,
    autres: (n) => `+${n} autres`,
    dispoN: (n) => `${n} relais disponibles pour ce dossier. Dis « reprends le relais » pour en reprendre un.`,
    noteDispo2: (l) => `[relais v2] Relais récents de ce dossier, NON chargés : ${l}. Ne les lis que si l'utilisateur demande de reprendre un relais ou reprend visiblement l'un de ces sujets. Après lecture, renomme en .repris.md seulement ceux marqués « archivable ».`,
    il: (d) => `il y a ${d}`,
    archivable: 'archivable',
    ouverte: 'session peut-être encore ouverte : ne pas renommer',
    blocage: (f, p) => `[relais] Le relais ${f} est à corriger (avertissement unique) : ${p}. Corrige le fichier maintenant, puis termine par une ligne.`,
    pbLong: (l, c) => `trop long (${l} lignes, ${c} caractères ; maximum 60 lignes et 6 000 caractères)`,
    pbSections: (l) => `sections manquantes : ${l}`,
    pbSecret: (l) => `secret possible à retirer (${l})`,
    pbCouvert: (l) => `lignes sans doute déjà dites par un fichier rechargé à chaque session (${l}) : ouvre chaque source citée ; si la règle y est vraiment, retire la ligne du relais, sinon garde-la`,
    ligne: (n, t) => `ligne ${n} : ${t}`,
    supprime: 'supprimé',
    sections: ['Prochaine étape', 'Vérifié / pas vérifié', 'En attente du feu vert'],
  },
  en: {
    avertir: (c) => `Relay: this conversation is ${c} tokens, re-read on every action. Consider /relais once the current step is done.`,
    insister: (c) => `Relay: this conversation is ${c} tokens, re-read on EVERY action. Type /relais then /clear to start again from a light session.`,
    noteAvertir: (c) => `[relais gauge] Context is ${c} tokens, re-read on every tool call. If the request starts a new topic or the previous task is done, suggest in ONE line that the user types /relais. Otherwise carry on normally.`,
    noteInsister: (c) => `[relais gauge] Context is ${c} tokens, re-read on every tool call: this is what makes usage explode. Finish the current step cleanly, then end your answer with ONE line suggesting the user types /relais (you will write a short handoff, then /clear will resume from it). Do not start the relay yourself without their agreement.`,
    auto: (c) => `Relay: this conversation is ${c} tokens, re-read on every action. Claude keeps the relay up to date by itself: type /clear whenever you want a light session.`,
    noteAuto: (c, f) => `[relais gauge, auto mode, relais v1] Context is ${c} tokens, re-read on every tool call. Handle the current request first. Then, without asking, write the relay yourself following the /relais skill format, in this exact file, overwriting it if it exists: ${f}, with the title / cwd / date header: the cwd: line (exact working folder) is mandatory, it is how the next session reloads the relay. For this relay, write in no memory file, CLAUDE.md or documentation: knowledge that must last, suggest it to the user and write it only after their explicit agreement. End your answer with ONE line: "Relay up to date. This session re-reads ${c} tokens on every call: type /clear whenever you want a light session." Never type /clear yourself.`,
    dispo: (t, d) => `Relay available: "${t}" (written ${d} ago). Say "resume the relay" to continue from it.`,
    noteDispo: (p, t, d) => `[relais v1] A recent session relay exists: ${p} ("${t}", ${d} ago). Only read it if the user asks to resume the relay or clearly picks that topic back up; after reading, rename it to .repris.md.`,
    repris: (t, d) => `Relay resumed: "${t}" (written ${d} ago).`,
    reprisAvant: (t, d, a) => `Relay resumed: "${t}" (written ${d} ago). The previous conversation re-read ${a} tokens on every action; the tally shows after my first answer.`,
    bilan: (a, m, l, p) => `Relay tally: before ${a} tokens re-read on every action, now ${m}. Freed: ${l} per action (-${p}%).`,
    noteTailleRelais: (c, d = '<home>/.claude/relais') => `[relais gauge, relais v1] The conversation is currently ${c} tokens (re-read on every action). This is the number to quote in the relay's final message. v1 mode: write the relay in ${d}/YYYY-MM-DD_HHhMM_<topic>.md with the title / cwd / date header; the cwd: line is mandatory (the next session reloads the relay by folder). Project memory: nothing without the user's explicit agreement, additions only.`,
    noteRepris: `[relais] This session continues a previous conversation that had grown too heavy. Below is the relay written at the end of it: it is your starting point. Do not re-read the files it summarizes unless really needed; continue with the "Next step". If the user talks about something else, follow them.`,
    tronque: '[… relay truncated]',
    deleguer: `[relais] Token saving: a long task (over ~10 reads or steps) that does not need the history goes to a subagent (Agent, model "sonnet", "haiku" for an inventory), self-contained brief, short result. Do the rest yourself.`,
    // ---- v2 ----
    noteAuto2: (c, f, ar) => `[relais gauge, auto mode, relais v2] ${c} tokens re-read on every tool call. After the current request, write the relay without asking in ${f} (overwrite it): first line "# <topic>", then "## Verified / not verified", "## Waiting for go-ahead", "## Next step"; 60 lines and 6,000 characters max, no secret. For this relay, touch no memory, CLAUDE.md or docs (unless the user asks); durable knowledge goes to the registry: echo '<json>' | ${ar}. End with ONE line: "Relay up to date: type /clear for a light session (${c} re-read on every call)." Never type /clear.`,
    noteRelais2: (c, f, ar) => `[relais gauge, relais v2] Relay requested. Write it in this exact file, overwriting it if it exists: ${f} (no header needed: the plugin records the folder, session and time by itself).${c ? ` The conversation is ${c} tokens (re-read on every action): this is the number to quote in the final message.` : ''} Project memory: add nothing without the user's explicit agreement in this conversation (suggest the additions, wait for their agreement, additions only); otherwise each piece of durable knowledge (rule, pitfall and its solution) goes into the plugin registry: echo '<json>' | ${ar} (format given by the "relais memory" note), and is not copied into the relay.`,
    noteRepris2: (s, h) => `[relais v2] This session continues session ${s} (same project), closed with /clear. Below is the relay it wrote (${h}): it is your starting point. Do not re-read the files it summarizes unless really needed. Suggest the "Next step" and wait for a request from the user before acting on the project; nothing that awaits their go-ahead without their agreement, and treat as unverified anything the relay does not mark as verified. If the user talks about something else, follow them.`,
    noteNonCharge: (s, p, t, h, r) => `[relais v2] Session ${s} (same project), closed with /clear, left a relay that was NOT loaded: ${p} ("${t}", written ${h}; ${r}). Only read it if the user asks to resume the relay or clearly picks that topic back up; it is archivable after reading.`,
    nonCharge: (t, d) => `Relay of the closed session not reloaded: "${t}" (written ${d} ago, the conversation went on or waited since). Say "resume the relay" to pick it up.`,
    raisonVieux: 'written more than 30 min before closing',
    raisonEcart: (e) => `the conversation went on by +${e} afterwards`,
    raisonInconnu: 'size at relay time unknown',
    ctrlEntete: 'Plugin checks (warnings only, nothing was changed):',
    ctrlPerime: (h, a, b, e) => `- Freshness: relay written ${h} at ${a}; the session went on up to ${b} (+${e}). What was done afterwards is not in it: check the real state before acting.`,
    ctrlFichiers: (l) => `- Files in this folder changed since the relay (git): ${l}.`,
    ctrlFichiersAucun: '- No file in this folder changed since the relay according to git.',
    ctrlPasGit: '- Folder not in git: cannot list the files changed since the relay.',
    ctrlMemoire: (l) => `- WARNING memory: lines deleted since the relay in ${l}. Nothing was undone: tell the user before any other write to the memory.`,
    ctrlMemoireImpossible: '- Memory check impossible (no commit recorded, commit not found or git unavailable): check the memory with the user before writing to it.',
    ctrlSecret: (l) => `- Possible secret in the relay (${l}): do not copy it anywhere and tell the user. The text was not masked.`,
    ctrlChemins: (l) => `- Cited paths not found (relative or still to create?): ${l}.`,
    ctrlSections: (l) => `- Sections missing from the relay: ${l}.`,
    ctrlSansMeta: '- Relay metadata missing: time = file date, size at relay time unknown.',
    ctrlARanger: (n, p) => `- ${n} durable proposal(s) waiting in ${p}: move them into the memory only with the user's agreement.`,
    aRanger: (n) => ` ${n} proposal(s) to file (a-ranger.md).`,
    autres: (n) => `+${n} more`,
    dispoN: (n) => `${n} relays available for this folder. Say "resume the relay" to pick one up.`,
    noteDispo2: (l) => `[relais v2] Recent relays for this folder, NOT loaded: ${l}. Only read them if the user asks to resume a relay or clearly picks one of these topics back up. After reading, rename to .repris.md only those marked "archivable".`,
    il: (d) => `${d} ago`,
    archivable: 'archivable',
    ouverte: 'session may still be open: do not rename',
    blocage: (f, p) => `[relais] The relay ${f} needs fixing (one-time warning): ${p}. Fix the file now, then end with one line.`,
    pbLong: (l, c) => `too long (${l} lines, ${c} characters; maximum 60 lines and 6,000 characters)`,
    pbSections: (l) => `missing sections: ${l}`,
    pbSecret: (l) => `possible secret to remove (${l})`,
    pbCouvert: (l) => `lines probably already said by a file reloaded at every session (${l}): open each cited source; if the rule is really there, remove the line from the relay, otherwise keep it`,
    ligne: (n, t) => `line ${n}: ${t}`,
    supprime: 'deleted',
    sections: ['Next step', 'Verified / not verified', 'Waiting for go-ahead'],
  },
};
export const T = () => TEXTES[langue()];

export function sortieJSON(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// ======================================================================================================
// v2 helpers. Metadata is written by the scripts from the hook input (cwd, session_id, transcript), never
// read from the text Claude writes. Every git call is read-only, time-boxed, wrapped, and hardened
// against the configuration of an untrusted repository (see git()).
// ======================================================================================================

export const idSid = (sid) => String(sid || 'x').replace(/[^\w-]/g, '');
export const fichierAuto = (sid) => path.join(dossierRelais(), `auto_${idSid(sid)}.md`);
export const fichierARanger = () => path.join(dossierRelais(), 'a-ranger.md');
export const barres = (p) => String(p).replace(/\\/g, '/');
export const LIMITE_LIGNES = 60;
export const LIMITE_CAR = 6000;
export const estHash = (h) => typeof h === 'string' && /^[0-9a-f]{40,64}$/.test(h);

// Project identity: Claude Code's project folder (the folder of the conversation log) does not move when
// Claude runs `cd`; the hook cwd does. Fallback: the cwd.
export function cleProjet(e) {
  return e?.transcript_path ? `p:${normCwd(path.dirname(e.transcript_path))}` : `c:${normCwd(e?.cwd)}`;
}

const etat = (nom) => path.join(dossierRelais(), '.etat', nom);
export const lireJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
// Write then rename: a reader running at the same moment never sees half a file.
export function ecrireJSON(p, obj) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, p);
}
export const lireMeta = (sid) => lireJSON(etat(`meta_${idSid(sid)}.json`));
export const ecrireMeta = (sid, obj) => ecrireJSON(etat(`meta_${idSid(sid)}.json`), obj);
// Session closing record (fin.mjs). `.pris` = already used by a reprise (consumed once, atomically).
export const lireFerme = (sid) => lireJSON(etat(`ferme_${idSid(sid)}.json`)) || lireJSON(etat(`ferme_${idSid(sid)}.pris.json`));

// ---- git, hardened ----
// A cloned or downloaded repository can carry configuration that makes git run programs (core.fsmonitor,
// diff.external, textconv/filter drivers through .gitattributes, gpg.program, pager, hooks, lazy fetch of
// a partial clone...). The hooks run automatically, so: every executable option is neutralised on the
// command line, the inherited GIT_* environment is dropped, and only commands that never convert working
// tree content are used (rev-parse, cat-file, ls-tree, ls-files, diff between two commits, names only).
// The working tree is compared by Node itself, never by git (a clean filter would run otherwise).
const SANS_HOOKS = path.join(os.tmpdir(), 'relais-aucun-hook-inexistant');
const SURETE = [
  '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'log.showSignature=false',
  '-c', 'diff.external=', '-c', 'core.quotePath=false', '-c', `core.hooksPath=${SANS_HOOKS}`,
  '-c', 'core.pager=cat', '-c', 'core.virtualFilesystem=', '-c', 'protocol.allow=never',
  '-c', 'credential.helper=', '-c', 'core.sshCommand=', '--no-pager', '--no-optional-locks',
];
function envGit() {
  const env = {};
  for (const [c, v] of Object.entries(process.env)) if (!/^GIT_/i.test(c)) env[c] = v;
  // Test knob only: makes git see every repository as owned by someone else (exFAT, other account...).
  if (process.env.RELAIS_TEST_GIT_PROPRIETAIRE === '1') env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
  return { ...env, GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_ASKPASS: '', SSH_ASKPASS: '' };
}
// Top of the repository containing `dir` (first parent holding .git), found by Node without running git.
export function racineGit(dir) {
  let d = path.resolve(String(dir || ''));
  for (let i = 0; i < 64; i++) {
    try { if (fs.existsSync(path.join(d, '.git'))) return d; } catch { return null; }
    const p = path.dirname(d);
    if (p === d) return null;
    d = p;
  }
  return null;
}
// safe.directory, on the command line only (never in a config file), so that a repository on a drive that
// records no owner (exFAT) or created by another account still works. Granted ONLY to the folder itself when
// it IS the top of its repository (the folder the user chose to open): never to a parent repository found by
// walking up (a .git planted in C:\ or a shared folder by another account, CVE-2022-24765), never to a drive
// root nor to the temp folder. Otherwise git's default ownership check applies (refused = "not in git").
export function optionsProprietaire(dir) {
  try {
    const d = path.resolve(String(dir || ''));
    if (!dir || path.dirname(d) === d || normCwd(d) === normCwd(path.resolve(os.tmpdir()))) return [];
    const r = racineGit(d);
    return r && normCwd(r) === normCwd(d) ? ['-c', `safe.directory=${barres(d)}`] : [];
  } catch { return []; }
}
// Test knob only: simulates a slow git (each call waits this long, or times out if longer than allowed).
const LENT = Number(process.env.RELAIS_TEST_GIT_DELAI_MS || 0);
export function git(dir, args, timeout = 3000, { input, brut } = {}) {
  if (!dir || !(timeout >= 200)) return null;
  if (LENT) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(LENT, timeout));
    if (LENT >= timeout) return null;
    timeout -= LENT;
    if (timeout < 200) return null;
  }
  const [sous, ...reste] = args;
  const extra = sous === 'diff' || sous === 'log' ? ['--no-ext-diff', '--no-textconv'] : [];
  try {
    const r = spawnSync('git', ['-C', dir, ...SURETE, ...optionsProprietaire(dir), sous, ...extra, ...reste], {
      encoding: brut ? 'buffer' : 'utf8', timeout, windowsHide: true, maxBuffer: 8 << 20,
      input: input === undefined ? undefined : Buffer.from(input, 'utf8'),
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], env: envGit(),
    });
    return r.status === 0 && !r.error ? r.stdout : null;
  } catch { return null; }
}
export const gitHead = (dir, timeout) => {
  const h = (git(dir, ['rev-parse', 'HEAD'], timeout) || '').trim();
  return estHash(h) ? h : null;
};
const z = (out) => String(out || '').split('\0').filter(Boolean);

// Claude Code's memory folder for a project: <folder of the conversation log>/memory, i.e.
// <CLAUDE_CONFIG_DIR or ~/.claude>/projects/<slug>/memory; fallback: slug of the cwd (every non-alphanumeric char -> "-").
// Returned only if it exists (never created).
export function dossierMemoire(cwd, transcript) {
  try {
    if (transcript) {
      const d = path.join(path.dirname(transcript), 'memory');
      if (fs.existsSync(d)) return d;
    }
    if (!cwd) return null;
    const projets = path.join(dossierClaude(), 'projects');
    const slug = String(cwd).replace(/[^a-zA-Z0-9]/g, '-');
    let d = path.join(projets, slug, 'memory');
    if (fs.existsSync(d)) return d;
    const proche = fs.readdirSync(projets).find((n) => n.toLowerCase() === slug.toLowerCase());
    d = proche && path.join(projets, proche, 'memory');
    return d && fs.existsSync(d) ? d : null;
  } catch { return null; }
}

// Lines that existed in the memory at the recorded commit and are gone now (committed or not).
// The old content is read with `git cat-file --batch` (no filter, no textconv), the current one by Node.
// null = check impossible. Warning material only: nothing is ever undone.
export function suppressionsMemoire(memDir, head, limite) {
  const reste = () => Math.min(3000, limite - Date.now() - 300);
  if (!memDir || !estHash(head) || !fs.existsSync(memDir)) return null;
  const liste = git(memDir, ['ls-tree', '-r', '-z', '--name-only', head, '--', '.'], reste());
  if (liste === null) return null;
  const noms = z(liste).filter((n) => !/[\n\r]/.test(n)).slice(0, 500);
  if (!noms.length) return [];
  const out = git(memDir, ['cat-file', '--batch'], reste(), { input: noms.map((n) => `${head}:./${n}`).join('\n') + '\n', brut: true });
  if (out === null) return null;
  const res = [];
  let pos = 0;
  for (const n of noms) {
    const fin = out.indexOf(10, pos);
    if (fin < 0) return null;
    const entete = out.subarray(pos, fin).toString('utf8').split(' ');
    pos = fin + 1;
    if (entete[1] !== 'blob') continue; // "missing", submodule...
    const taille = Number(entete[2]);
    const ancien = out.subarray(pos, pos + taille).toString('utf8');
    pos += taille + 1;
    let actuel = '';
    try { actuel = fs.readFileSync(path.join(memDir, n), 'utf8'); } catch { /* deleted */ }
    const sup = lignesSupprimees(ancien, actuel);
    if (sup > 0) res.push(`${n.slice(0, 120)} (-${sup})`);
  }
  return res;
}
// Multiset difference: how many lines of `ancien` no longer appear in `actuel` (line endings ignored).
export function lignesSupprimees(ancien, actuel) {
  const norm = (s) => s.replace(/\r\n?/g, '\n').split('\n').filter((l, i, a) => i < a.length - 1 || l !== '');
  const a = norm(ancien);
  if (ancien.replace(/\r\n?/g, '\n') === actuel.replace(/\r\n?/g, '\n')) return 0;
  const reste = new Map();
  for (const l of norm(actuel)) reste.set(l, (reste.get(l) || 0) + 1);
  let n = 0;
  for (const l of a) { const c = reste.get(l) || 0; if (c) reste.set(l, c - 1); else n++; }
  return n;
}

// Files of the working folder changed since the relay: tracked and untracked files whose modification
// date is after the relay, plus files deleted by commits since the recorded commit. Names are read with
// -z (no quoting: accented names stay readable). null = not a git folder.
export function fichiersDepuis(cwd, headCwd, depuisMs, limite) {
  const reste = () => Math.min(3000, limite - Date.now() - 300);
  if (!cwd) return null;
  // Tracked and untracked files in ONE git call, which also tells whether this is a git folder (each git
  // start costs 60-100 ms on Windows: 3 calls -> 1 on this path), at most 2 s.
  const tous = git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], Math.min(2000, reste()));
  if (tous === null && git(cwd, ['rev-parse', '--show-toplevel'], reste()) === null) return null;
  const base = estHash(headCwd) && git(cwd, ['cat-file', '-e', `${headCwd}^{commit}`], reste()) !== null ? headCwd : null;
  const commits = new Set(base ? z(git(cwd, ['diff', '--name-only', '-z', '--relative', base, 'HEAD'], reste())) : []);
  const candidats = new Set([...z(tous), ...commits]);
  // Dates read by Node (git would refresh its index and could run filters), 1.5 s at most: ~0.13 ms per
  // file measured on an exFAT drive, so a huge repository gives a partial list ("…") rather than a slow /clear.
  const fin = Math.min(limite - 300, Date.now() + 1500);
  const res = [];
  let i = 0;
  let coupe = false;
  for (const n of candidats) {
    if (++i % 200 === 0 && Date.now() > fin) { coupe = true; break; }
    let st = null; try { st = fs.statSync(path.join(cwd, n)); } catch { /* deleted */ }
    if (st ? st.mtimeMs > depuisMs + 500 : commits.has(n)) res.push(st ? n : `${n} (${T().supprime})`);
  }
  res.sort();
  if (coupe) res.push('…');
  return res;
}

// Joins items up to about `max` characters, then "+N more".
export function liste(items, max) {
  const pris = [];
  let long = 0;
  for (const it of items) {
    const s = String(it).slice(0, 120);
    if (pris.length && long + s.length + 2 > max) break;
    pris.push(s); long += s.length + 2;
  }
  const reste = items.length - pris.length;
  return pris.join(', ') + (reste > 0 ? ` (${T().autres(reste)})` : '');
}

// Required sections, kept short and tolerant: any heading (#… or **…**) containing these words, FR or EN.
const SECTIONS = [
  /prochaine\s+[ée]tape|next\s+step/i,
  /v[ée]rifi|verified|checked/i,
  /feu\s+vert|go[- ]?ahead|approval|attente|awaiting|waiting/i,
];
// Precise patterns only (no entropy guessing): warn, never mask.
const SECRETS = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'sk-…'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:password|passwd|pwd)\s*=\s*["']?(?![<*${.…])[^\s"'`]{4,}/i, 'password='],
];
export function analyserRelais(texte) {
  const s = String(texte);
  const lignes = s.split(/\r?\n/);
  const pleines = lignes.filter((l) => l.trim()).length;
  const titres = lignes.filter((l) => /^\s*(#{1,6}\s|\*\*)/.test(l)).join('\n');
  const t = T();
  const manquantes = SECTIONS.map((re, i) => (re.test(titres) ? null : t.sections[i])).filter(Boolean);
  const secrets = [];
  lignes.forEach((l, i) => { for (const [re, nom] of SECRETS) if (re.test(l)) secrets.push(t.ligne(i + 1, nom)); });
  return { pleines, car: s.length, trop: pleines > LIMITE_LIGNES || s.length > LIMITE_CAR, manquantes, secrets: secrets.slice(0, 5) };
}

// Which cited path may be probed on disk. The relay is text written by Claude (it can be influenced by a
// prompt injection), so a path is only probed if it is LOCAL: a drive-letter path (Windows), a single-
// slash absolute path (elsewhere), or a relative path that stays under the cwd. Never \\host\share,
// //host, \\?\, \\.\, URLs (file:, http:...), "~", or anything with control characters: probing a UNC
// path would make Windows contact a remote SMB server and send the user's NTLM hash.
// Returns the absolute path to probe, or null. Pure: touches neither the disk nor the network.
export function cheminSondable(c, cwd) {
  c = String(c || '');
  if (!c || /[\x00-\x1f\x7f]/.test(c) || /^[\\/]{2}/.test(c) || c.startsWith('~')) return null;
  if (/^[a-z][a-z0-9+.-]+:/i.test(c)) return null;               // file:, http:, ... (not "C:")
  const win = process.platform === 'win32';
  const local = (p) => (win ? /^[A-Za-z]:[\\/]/.test(p) && !/^[A-Za-z]:[\\/]{2}/.test(p) : /^\/(?!\/)/.test(p));
  if (win && /^\/[a-z]\//i.test(c)) c = `${c[1]}:${c.slice(2)}`;   // Git Bash form /d/x
  if (win ? /^[A-Za-z]:[\\/]/.test(c) : c.startsWith('/')) return local(c) ? path.normalize(c) : null;
  if (/^[\\/]/.test(c) || /^[A-Za-z]:/.test(c)) return null;       // \x, /x on Windows, C:x (drive-relative)
  const base = String(cwd || '');
  if (!base || !local(base) || /^[\\/]{2}/.test(base)) return null;
  const p = path.resolve(base, c);
  const rel = path.relative(base, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return local(p) ? p : null;
}

// Paths cited between backticks that do not exist (relative ones resolved from the real cwd).
export function cheminsAbsents(texte, cwd) {
  const res = [];
  for (const m of String(texte).matchAll(/`([^`\s]{3,200})`/g)) {
    const c = m[1].replace(/#L\d+.*$/, '').replace(/:\d+(?:[-:]\d+)*$/, '').replace(/[),.;]+$/, '');
    if (/:\/\/|[*?<>|"$]/.test(c) || c.startsWith('-') || !/[\\/]/.test(c)) continue;
    const prefixe = /^([A-Za-z]:[\\/]|\.{1,2}[\\/])/.test(c) || /^\/[^/]+\/./.test(c);
    if (!prefixe && !/\.[A-Za-z0-9]{1,8}$/.test(c)) continue; // "origin/main", "/clear": not file paths
    const p = cheminSondable(c, cwd);
    if (!p) continue;
    try { if (!fs.existsSync(p)) res.push(c.slice(0, 120)); } catch { /* ignore */ }
  }
  return [...new Set(res)].slice(0, 5);
}

// Title shown on screen: "title:" line, else the "# " heading, else the first heading that is not a
// section of the format ("## Goal"...), else the first line of text, else the file name.
const SECTION_FORMAT = /^(objectif|goal|o[uù] on en est|where (we are|things stand)|o[uù] lire quoi|where to read what|v[ée]rifi|verified|d[ée]cisions?|en attente|waiting|prochaine [ée]tape|next step|pi[èe]ges?|pitfalls?|fichiers touch|files touched|contexte?|context)\b/i;
export function titreRelais(texte, nom) {
  const s = String(texte);
  const t = s.match(/^(?:titre|title):\s*(.+)$/m);
  if (t && t[1].trim()) return t[1].trim().slice(0, 100);
  const lignes = s.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').split(/\r?\n/);
  const nu = (l) => l.replace(/^\s*(#{1,6}\s+|[-*+>]\s+)/, '').replace(/\*\*|__|`|\s+#+\s*$|\s+\*$/g, '').trim();
  const titres = lignes.filter((l) => /^#{1,6}\s+\S/.test(l));
  const l = titres.find((x) => /^#\s/.test(x)) || titres.find((x) => !SECTION_FORMAT.test(nu(x)))
    || lignes.find((x) => !/^\s*#/.test(x) && /\p{L}{2}/u.test(x));
  return ((l && nu(l)) || nom).replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function compterARanger() {
  try {
    return fs.readFileSync(fichierARanger(), 'utf8').split(/\r?\n/).filter((l) => /^\s*([-*+]|\d+[.)])\s+\S/.test(l)).length;
  } catch { return 0; }
}

const deux = (n) => String(n).padStart(2, '0');
export const heure = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
};

// A relay is being requested (auto threshold or /relais): remember the project, the real cwd and the
// memory HEAD BEFORE Claude writes anything in this turn, so the memory guard also covers the relay turn.
export function noterDemande(e) {
  const sid = idSid(e.session_id);
  const meta = lireMeta(sid) || {};
  const memDir = dossierMemoire(e.cwd, e.transcript_path);
  ecrireMeta(sid, {
    ...meta, sid, cle: cleProjet(e), cwd: e.cwd, demandeLe: Date.now(), averti: false,
    memDir, headMemDemande: memDir ? gitHead(memDir, 2000) : null,
  });
}

// After the FIRST measured answer of a session reloaded from a relay: the tally (tokens re-read before the
// relay, now, freed per action). Shown once, then forgotten. null = nothing to show (yet).
// Run by the Stop hook (controle.mjs), in v1 and v2.
export function bilanReprise(e) {
  const f = path.join(dossierRelais(), '.etat', `bilan_${idSid(e.session_id)}.json`);
  if (!fs.existsSync(f)) return null;
  const { avant } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const maintenant = dernierContexte(e.transcript_path);
  if (!maintenant) return null; // no measured answer yet: try again at the next one
  fs.unlinkSync(f);
  if (!(avant > maintenant)) return null;
  const libere = avant - maintenant;
  return T().bilan(k(avant), k(maintenant), k(libere), Math.round((libere / avant) * 100));
}
