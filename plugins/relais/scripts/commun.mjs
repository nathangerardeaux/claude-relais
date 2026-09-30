// Shared helpers for the relais plugin. Everything is defensive: a hook must NEVER block or break a
// session. When in doubt, stay silent. 100% local: no network access, no data sent anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Thresholds, in tokens re-read on every action (override with environment variables).
// A relay at 150k cut re-read tokens by 79% on a real 3-week conversation (see README).
export const SEUIL_AVERTIR = Number(process.env.RELAIS_SEUIL_K || 150) * 1000;
export const SEUIL_INSISTER = Number(process.env.RELAIS_SEUIL_FORT_K || 250) * 1000;
export const RAPPEL_TOUS_LES = 100000; // one more reminder every +100k, never on every message

export const dossierRelais = () => {
  // RELAIS_DOSSIER: for tests (never write into the real ~/.claude during a trial run).
  const d = process.env.RELAIS_DOSSIER || path.join(os.homedir(), '.claude', 'relais');
  fs.mkdirSync(path.join(d, '.etat'), { recursive: true });
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

const TEXTES = {
  fr: {
    avertir: (c) => `Relais : cette conversation pèse ${c} tokens, relus à chaque action. Pense à /relais quand l'étape en cours est finie.`,
    insister: (c) => `Relais : cette conversation pèse ${c} tokens, relus à CHAQUE action. Tape /relais puis /clear pour repartir d'une session légère.`,
    noteAvertir: (c) => `[jauge relais] Le contexte fait ${c} tokens, relus à chaque appel d'outil. Si la demande ouvre un nouveau sujet ou si la tâche précédente est bouclée, propose en UNE ligne de taper /relais. Sinon continue normalement.`,
    noteInsister: (c) => `[jauge relais] Le contexte fait ${c} tokens, relus à chaque appel d'outil : c'est ce qui fait exploser la consommation. Termine proprement l'étape en cours, puis termine ta réponse par UNE ligne proposant de taper /relais (tu écriras un résumé court, puis /clear repartira de ce résumé). Ne lance pas le relais toi-même sans accord.`,
    dispo: (t, d) => `Relais disponible : « ${t} » (écrit il y a ${d}). Dis « reprends le relais » pour repartir de là.`,
    noteDispo: (p, t, d) => `[relais] Un relais de session récent existe : ${p} (« ${t} », il y a ${d}). Ne le lis que si l'utilisateur demande de reprendre le relais ou reprend visiblement ce sujet.`,
    repris: (t, d) => `Relais repris : « ${t} » (écrit il y a ${d}).`,
    noteRepris: `[relais] Cette session prend la suite d'une conversation précédente devenue trop lourde. Voici le relais écrit à la fin de celle-ci : c'est ton point de départ. Ne relis pas les fichiers qu'il résume sauf besoin réel ; enchaîne sur la « prochaine étape ». Si l'utilisateur parle d'autre chose, suis-le.`,
    tronque: '[… relais tronqué]',
  },
  en: {
    avertir: (c) => `Relay: this conversation is ${c} tokens, re-read on every action. Consider /relais once the current step is done.`,
    insister: (c) => `Relay: this conversation is ${c} tokens, re-read on EVERY action. Type /relais then /clear to start again from a light session.`,
    noteAvertir: (c) => `[relais gauge] Context is ${c} tokens, re-read on every tool call. If the request starts a new topic or the previous task is done, suggest in ONE line that the user types /relais. Otherwise carry on normally.`,
    noteInsister: (c) => `[relais gauge] Context is ${c} tokens, re-read on every tool call: this is what makes usage explode. Finish the current step cleanly, then end your answer with ONE line suggesting the user types /relais (you will write a short handoff, then /clear will resume from it). Do not start the relay yourself without their agreement.`,
    dispo: (t, d) => `Relay available: "${t}" (written ${d} ago). Say "resume the relay" to continue from it.`,
    noteDispo: (p, t, d) => `[relais] A recent session relay exists: ${p} ("${t}", ${d} ago). Only read it if the user asks to resume the relay or clearly picks that topic back up.`,
    repris: (t, d) => `Relay resumed: "${t}" (written ${d} ago).`,
    noteRepris: `[relais] This session continues a previous conversation that had grown too heavy. Below is the relay written at the end of it: it is your starting point. Do not re-read the files it summarizes unless really needed; continue with the "Next step". If the user talks about something else, follow them.`,
    tronque: '[… relay truncated]',
  },
};
export const T = () => TEXTES[langue()];

export function sortieJSON(obj) {
  process.stdout.write(JSON.stringify(obj));
}
