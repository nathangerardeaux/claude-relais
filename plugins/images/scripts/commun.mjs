// Shared helpers of the images plugin: language, messages, config files, probes of the WebUI folder and of
// the Codex install. No secret is ever read or printed.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------- language and messages
export function langue() {
  const forcee = String(process.env.IMAGES_LANG || process.env.RELAIS_LANG || '').toLowerCase();
  if (forcee === 'fr' || forcee === 'en') return forcee;
  let loc = '';
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* ignore */ }
  loc = loc || process.env.LC_ALL || process.env.LANG || '';
  return /^fr/i.test(loc) ? 'fr' : 'en';
}

export const TEXTES = {
  fr: {
    'non-configure': () => "Aucun moteur d'images choisi. Choisis-en un avec : configurer --moteur gratuit (Stable Diffusion local, gratuit) ou configurer --moteur codex (Codex avec un forfait ChatGPT Plus/Pro).",
    'sd-introuvable': (d) => `Stable Diffusion WebUI est introuvable (${d}). Indique son dossier : configurer --moteur gratuit --sd-dossier "D:\\...\\stable-diffusion-webui".`,
    'sd-sans-venv': (p) => `L'environnement Python de Stable Diffusion est introuvable (${p}). Lance une fois webui-user.bat dans le dossier de WebUI pour le créer.`,
    'sd-python': (v, d) => `Le venv de Stable Diffusion utilise Python ${v}, or WebUI sous Windows demande Python 3.10 (torch 2.1.2 n'existe pas pour ${v}) : le premier démarrage échouerait. Il faut recréer le dossier venv de ${d} avec Python 3.10 (supprimer venv, puis lancer webui-user.bat avec PYTHON réglé sur un python 3.10). Je ne l'ai pas fait.`,
    'sd-sans-modele': (d) => `Aucun checkpoint Stable Diffusion installé : WebUI ne peut pas générer. Télécharge un modèle (.safetensors, par exemple SDXL) et place-le dans ${d}, puis relance.`,
    'sd-arret': (fin, log) => `Stable Diffusion s'est arrêté pendant son démarrage. Fin du journal (${log}) :\n${fin}`,
    'sd-demarrage-en-cours': (s, log) => `Stable Diffusion démarre encore (${s} s d'attente écoulées, le premier démarrage peut prendre plusieurs minutes). Il continue en arrière-plan : relance la même commande dans un moment. Journal : ${log}`,
    'sd-demarre': (u) => `Stable Diffusion est démarré (${u}).`,
    'sd-erreur': (c, t) => `Stable Diffusion a refusé la demande (HTTP ${c}) : ${t}`,
    'sd-memoire': () => "Stable Diffusion a manqué de mémoire vidéo (8 Go). Réessaie avec une image plus petite (par exemple 768x768 ou 1024x768).",
    'sd-image': () => "Stable Diffusion n'a pas renvoyé d'image PNG valide.",
    'sd-coupe': (s) => `Stable Diffusion n'a pas répondu en ${s} s (génération trop longue ou serveur planté). Vérifie l'état avec la commande etat.`,
    'codex-introuvable': (p) => `Le programme Codex est introuvable (${p}). Installe-le ou indique son chemin : configurer --moteur codex --codex-exe "...".`,
    'codex-forfait': () => "Forfait ChatGPT Plus/Pro requis : l'outil de génération d'images de Codex n'est pas disponible avec ce compte (forfait gratuit). Passe à un forfait payant, ou choisis le moteur gratuit (Stable Diffusion local).",
    'codex-connexion': () => "Codex n'est pas connecté à un compte ChatGPT. Connecte-toi avec : codex login (avec CODEX_HOME réglé si besoin).",
    'codex-rien': (m) => `Codex n'a produit aucune image${m ? ` (réponse : ${m})` : ''}.`,
    'codex-coupe': (s) => `Codex n'a pas fini en ${s} s : génération interrompue.`,
    'codex-erreur': (c, t) => `Codex a échoué (code ${c})${t ? ` : ${t}` : ''}.`,
    'existe': (f, s) => `Le fichier existe déjà : ${f}. Je n'écrase jamais un fichier. Choisis un autre nom, par exemple ${s}.`,
    'args': (t) => `Arguments invalides : ${t}`,
    'config-ok': (m, f) => `Moteur choisi : ${m === 'codex' ? 'Codex (forfait ChatGPT Plus/Pro)' : 'gratuit (Stable Diffusion local)'}. Réglages enregistrés dans ${f}.`,
    'aucun-moteur-arg': () => 'Indique le moteur : --moteur gratuit ou --moteur codex.',
  },
  en: {
    'non-configure': () => 'No image engine chosen yet. Pick one with: configurer --moteur gratuit (local Stable Diffusion, free) or configurer --moteur codex (Codex with a ChatGPT Plus/Pro plan).',
    'sd-introuvable': (d) => `Stable Diffusion WebUI not found (${d}). Give its folder: configurer --moteur gratuit --sd-dossier "D:\\...\\stable-diffusion-webui".`,
    'sd-sans-venv': (p) => `The Stable Diffusion Python environment is missing (${p}). Run webui-user.bat once in the WebUI folder to create it.`,
    'sd-python': (v, d) => `The Stable Diffusion venv uses Python ${v}, but WebUI on Windows needs Python 3.10 (torch 2.1.2 has no build for ${v}): the first start would fail. The venv folder of ${d} must be recreated with Python 3.10 (delete venv, then run webui-user.bat with PYTHON set to a 3.10 python). I did not do it.`,
    'sd-sans-modele': (d) => `No Stable Diffusion checkpoint installed: WebUI cannot generate. Download a model (.safetensors, for example SDXL) and put it in ${d}, then try again.`,
    'sd-arret': (fin, log) => `Stable Diffusion stopped while starting. End of the log (${log}):\n${fin}`,
    'sd-demarrage-en-cours': (s, log) => `Stable Diffusion is still starting (${s} s of waiting used; the first start can take several minutes). It keeps running in the background: run the same command again in a moment. Log: ${log}`,
    'sd-demarre': (u) => `Stable Diffusion is started (${u}).`,
    'sd-erreur': (c, t) => `Stable Diffusion rejected the request (HTTP ${c}): ${t}`,
    'sd-memoire': () => 'Stable Diffusion ran out of video memory (8 GB). Try a smaller image (for example 768x768 or 1024x768).',
    'sd-image': () => 'Stable Diffusion did not return a valid PNG image.',
    'sd-coupe': (s) => `Stable Diffusion did not answer within ${s} s (generation too long or server crashed). Check with the etat command.`,
    'codex-introuvable': (p) => `The Codex program was not found (${p}). Install it or give its path: configurer --moteur codex --codex-exe "...".`,
    'codex-forfait': () => 'ChatGPT Plus/Pro plan required: the Codex image generation tool is not available with this account (free plan). Upgrade to a paid plan, or pick the free engine (local Stable Diffusion).',
    'codex-connexion': () => 'Codex is not signed in to a ChatGPT account. Sign in with: codex login (with CODEX_HOME set if needed).',
    'codex-rien': (m) => `Codex produced no image${m ? ` (answer: ${m})` : ''}.`,
    'codex-coupe': (s) => `Codex did not finish within ${s} s: generation interrupted.`,
    'codex-erreur': (c, t) => `Codex failed (code ${c})${t ? `: ${t}` : ''}.`,
    'existe': (f, s) => `The file already exists: ${f}. I never overwrite a file. Pick another name, for example ${s}.`,
    'args': (t) => `Invalid arguments: ${t}`,
    'config-ok': (m, f) => `Engine chosen: ${m === 'codex' ? 'Codex (ChatGPT Plus/Pro plan)' : 'free (local Stable Diffusion)'}. Settings saved in ${f}.`,
    'aucun-moteur-arg': () => 'Give the engine: --moteur gratuit or --moteur codex.',
  },
};
export const msg = (code, ...a) => TEXTES[langue()][code](...a);
export const echec = (code, ...a) => ({ ok: false, code, message: msg(code, ...a) });

// ---------------------------------------------------------------- config and state files
export const dossierEtat = () => process.env.IMAGES_DOSSIER
  || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'images');
export const fichierConfig = () => path.join(dossierEtat(), 'config.json');
export const lireJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
export const ecrireJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };

export function lireConfig() {
  const c = lireJSON(fichierConfig());
  return c && typeof c === 'object' ? c : {};
}

export const SD_DEFAUT = 'D:\\stable-diffusion-webui';
export const CODEX_DEFAUT = 'D:\\outils\\codex\\node_modules\\.bin\\codex.cmd';
export const CODEX_HOME_DEFAUT = 'D:\\outils\\codex\\home';
export const existe = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

export function dossierSD(cfg) {
  if (cfg.sdDossier) return cfg.sdDossier;
  return [process.env.IMAGES_SD_DOSSIER, SD_DEFAUT, path.join(os.homedir(), 'stable-diffusion-webui')]
    .find((d) => d && existe(path.join(d, 'launch.py'))) || SD_DEFAUT;
}

// Checkpoint files (.safetensors / .ckpt) under models/Stable-diffusion, 4 levels deep at most.
export function fichiersModeles(dossier) {
  const base = path.join(dossier, 'models', 'Stable-diffusion');
  const res = [];
  const marcher = (d, niveau) => {
    let entrees = [];
    try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && niveau < 4) marcher(p, niveau + 1);
      else if (e.isFile() && /\.(safetensors|ckpt)$/i.test(e.name)) res.push(path.relative(base, p));
    }
  };
  marcher(base, 0);
  return res;
}

export const pythonVenv = (dossier) => path.join(dossier, 'venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python');
export const versionVenv = (dossier) => /^version\s*=\s*(\S+)/m.exec(fs.readFileSync(path.join(dossier, 'venv', 'pyvenv.cfg'), 'utf8').toString())?.[1] || '';
export const venvAvecTorch = (dossier) => existe(path.join(dossier, 'venv', 'Lib', 'site-packages', 'torch'));
export const lireVersionVenv = (dossier) => { try { return versionVenv(dossier); } catch { return ''; } };

export const vivant = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const fichierDemarrage = () => path.join(dossierEtat(), 'sd-demarrage.json');

export function finDuJournal(log) {
  try {
    const t = fs.statSync(log).size;
    const n = Math.min(t, 1500);
    const fd = fs.openSync(log, 'r');
    try { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, t - n); return b.toString('utf8').trim(); } finally { fs.closeSync(fd); }
  } catch { return ''; }
}


// ---------------------------------------------------------------- Codex
// A .js/.mjs/.cjs path is run with node (test stand-in); anything else is spawned directly (no shell).
export function commande(exe, args) {
  return /\.(m?js|cjs)$/i.test(exe) ? { cmd: process.execPath, args: [exe, ...args] } : { cmd: exe, args };
}

// Real codex.exe from a shim (...\node_modules\.bin\codex.cmd): it lives in node_modules\@openai\*\vendor\*\bin.
export function exeDepuisShim(shim) {
  const racine = path.resolve(path.dirname(shim), '..', '@openai');
  let trouve = '';
  const marcher = (d, niveau) => {
    if (trouve || niveau > 6) return;
    let entrees = [];
    try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isFile() && e.name.toLowerCase() === 'codex.exe' && path.basename(d).toLowerCase() === 'bin') { trouve = p; return; }
      if (e.isDirectory()) marcher(p, niveau + 1);
    }
  };
  marcher(racine, 0);
  return trouve;
}

export function depuisPath(noms) {
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    for (const n of noms) { if (d && existe(path.join(d, n))) return path.join(d, n); }
  }
  return '';
}

export function trouverCodex(cfg) {
  let candidat = cfg.codexExe || depuisPath(['codex.exe', 'codex.cmd']) || CODEX_DEFAUT;
  if (!existe(candidat)) return { exe: '', demande: candidat };
  if (/\.(cmd|bat|ps1)$/i.test(candidat)) {
    const reel = exeDepuisShim(candidat);
    if (!reel) return { exe: '', demande: candidat };
    candidat = reel;
  }
  return { exe: candidat, demande: cfg.codexExe || candidat };
}

export const homeCodex = (cfg) => cfg.codexHome || process.env.CODEX_HOME || (existe(CODEX_HOME_DEFAUT) ? CODEX_HOME_DEFAUT : '');
export const dossierImagesCodex = (cfg) => path.join(homeCodex(cfg) || path.join(os.homedir(), '.codex'), 'generated_images');
export const envCodex = (cfg) => { const h = homeCodex(cfg); return h ? { ...process.env, CODEX_HOME: h } : { ...process.env }; };
export const fichierForfait = () => path.join(dossierEtat(), 'codex-forfait.json');

export function statutCodex(cfg, exe) {
  if (!exe) return { connecte: false, texte: '' };
  const c = commande(exe, ['login', 'status']);
  const r = spawnSync(c.cmd, c.args, { env: envCodex(cfg), encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const texte = `${r.stdout || ''}\n${r.stderr || ''}`.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^WARNING/i.test(l)) || '';
  return { connecte: r.status === 0 && /logged in/i.test(texte), texte: texte.slice(0, 120) };
}

// Codex on a FREE plan answers (agent_message) that the image tool "isn't available in this session".
export const REGEX_FORFAIT = /(image generation|imagegen)[^.]*(isn['\u2019]t|is not|not)\s+available|(isn['\u2019]t|is not|not)\s+available\s+in\s+this\s+session/i;
export const REGEX_CONNEXION = /not logged in|log in|sign in|unauthorized|\b401\b|authentication/i;
export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// ---------------------------------------------------------------- git and "dubious ownership"
// On exFAT / FAT32 / network drives git cannot record owners and refuses the repository ("detected dubious
// ownership", error 128), which breaks the clones made by launch.py. safe.directory is given through the
// ENVIRONMENT of the WebUI process only (GIT_CONFIG_COUNT / KEY_n / VALUE_n, command scope = honoured by git):
// never `git config --global`. Git >= 2.46 understands "<folder>/*"; older versions only "*", which would turn
// the protection off for every repository: they get the exact WebUI folders instead (its own clone, the
// repositories launch.py clones, and the repositories/ and extensions/ already there).
export const DEPOTS_WEBUI = ['stable-diffusion-stability-ai', 'generative-models', 'k-diffusion', 'BLIP', 'stable-diffusion-webui-assets'];
export const GIT_COMMUN = ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe'];
export function gitReel() {
  for (const g of ['git', ...GIT_COMMUN.filter(existe)]) {
    let r; try { r = spawnSync(g, ['--version'], { encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { continue; }
    const m = r.status === 0 && /git version (\S+)/.exec(String(r.stdout));
    if (m) return { version: m[1], exe: g };
  }
  return null;
}
export function versionGit() {
  const s = surcharge();
  if (s && 'git' in s) return typeof s.git === 'string' ? s.git : (s.git?.version || '');
  return gitReel()?.version || '';
}
const gitRecent = (v) => { const [a, b] = String(v).split('.').map(Number); return a > 2 || (a === 2 && b >= 46); };
function dossiersGitWebui(dossier) {
  const res = new Set([dossier, ...DEPOTS_WEBUI.map((d) => path.join(dossier, 'repositories', d))]);
  for (const sous of ['repositories', 'extensions']) {
    let entrees = []; try { entrees = fs.readdirSync(path.join(dossier, sous), { withFileTypes: true }); } catch {}
    for (const e of entrees) if (e.isDirectory()) res.add(path.join(dossier, sous, e.name));
  }
  return [...res].map((d) => d.replace(/\\/g, '/'));
}
export function envGitSafe(dossier, base = process.env) {
  const env = { ...base };
  const n = Number(env.GIT_CONFIG_COUNT) || 0; // keep what is already there: append
  const dir = path.resolve(dossier).replace(/\\/g, '/');
  const valeurs = gitRecent(versionGit()) ? [dir, `${dir}/*`] : dossiersGitWebui(path.resolve(dossier));
  valeurs.forEach((v, i) => { env[`GIT_CONFIG_KEY_${n + i}`] = 'safe.directory'; env[`GIT_CONFIG_VALUE_${n + i}`] = v; });
  env.GIT_CONFIG_COUNT = String(n + valeurs.length);
  return env;
}

// ---------------------------------------------------------------- environment for WebUI processes
// Same environment as webui.bat (venv first in PATH), arguments through COMMANDLINE_ARGS; the user's
// webui-user.bat is never touched. Caches stay on the WebUI drive (nothing heavy on C:).
// Stability-AI deleted its github.com/Stability-AI/stablediffusion repository, which WebUI 1.10 still clones
// on first launch ("Repository not found"): unless the user chose another one, use the mirror kept by a WebUI
// maintainer, which holds the exact commit WebUI asks for (cf1d67a6).
export const DEPOT_SD_MIROIR = 'https://github.com/w-e-w/stablediffusion.git';
export function envSD(dossier, args) {
  const tmp = path.join(dossier, 'tmp');
  return {
    ...envGitSafe(dossier),
    STABLE_DIFFUSION_REPO: process.env.STABLE_DIFFUSION_REPO || DEPOT_SD_MIROIR,
    COMMANDLINE_ARGS: args.filter(Boolean).join(' '),
    ERROR_REPORTING: 'FALSE',
    PYTHONUNBUFFERED: '1',
    PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(tmp, 'pip-cache'),
    HF_HOME: process.env.HF_HOME || path.join(tmp, 'huggingface'),
    PATH: `${path.dirname(pythonVenv(dossier))}${path.delimiter}${process.env.PATH || ''}`,
  };
}

// ---------------------------------------------------------------- test hooks (never set in normal use)
// IMAGES_SONDE = a JSON file whose keys replace what the probes would find on the PC (gpu, git, pythons,
// winget, node, libreMo, disques, plateforme). IMAGES_SIMULATION = a log file: every external command of the
// installer (winget, git clone, venv, npm, login, first launch) is written there as JSON and NOT run.
export const surcharge = () => (process.env.IMAGES_SONDE ? lireJSON(process.env.IMAGES_SONDE) : null);
export const sonde = (cle, reel) => { const s = surcharge(); return s && cle in s ? s[cle] : reel(); };
export const simulation = () => process.env.IMAGES_SIMULATION || '';
const ENV_JOURNALISEE = ['COMMANDLINE_ARGS', 'STABLE_DIFFUSION_REPO', 'PIP_CACHE_DIR', 'HF_HOME', 'npm_config_cache', 'UV_PYTHON_INSTALL_DIR', 'CODEX_HOME'];
function journaliser(cmd, args, o) {
  const env = {};
  for (const k of Object.keys(o.env || {})) if (ENV_JOURNALISEE.includes(k) || /^GIT_CONFIG_/.test(k)) env[k] = o.env[k];
  fs.mkdirSync(path.dirname(simulation()), { recursive: true });
  fs.appendFileSync(simulation(), `${JSON.stringify({ cmd, args, cwd: o.cwd || '', env })}\n`);
}

// Runs an external command (no shell) and waits. Returns { code, sortie (last 3000 characters), coupe, simule }.
export function executer(cmd, args, o = {}) {
  if (simulation()) { journaliser(cmd, args, o); return Promise.resolve({ code: 0, sortie: '', coupe: false, simule: true }); }
  return new Promise((resolve) => {
    let sortie = ''; let coupe = false;
    const garder = (d) => { sortie = (sortie + d).slice(-3000); };
    const enfant = spawn(cmd, args, { cwd: o.cwd, env: o.env || process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const minuteur = o.delai ? setTimeout(() => { coupe = true; enfant.kill(); }, o.delai * 1000) : null;
    enfant.stdout.on('data', garder);
    enfant.stderr.on('data', garder);
    enfant.on('error', (e) => { clearTimeout(minuteur); resolve({ code: 1, sortie: String(e.message), coupe, simule: false }); });
    enfant.on('close', (code) => { clearTimeout(minuteur); resolve({ code: code ?? 1, sortie, coupe, simule: false }); });
  });
}

// Starts a long command in the background (hidden window, output to `log`), detached from this process.
export function lancerFond(cmd, args, o) {
  if (simulation()) { journaliser(cmd, args, o); return { pid: 0, simule: true, fini: Promise.resolve(0) }; }
  fs.mkdirSync(path.dirname(o.log), { recursive: true });
  const fd = fs.openSync(o.log, 'w');
  const enfant = spawn(cmd, args, { cwd: o.cwd, env: o.env, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const fini = new Promise((resolve) => { enfant.on('exit', (c) => resolve(c ?? 1)); enfant.on('error', () => resolve(1)); });
  enfant.unref();
  return { pid: enfant.pid, simule: false, fini };
}

// Short bilingual text helper for messages built on the fly.
export const t = (fr, en) => (langue() === 'fr' ? fr : en);
