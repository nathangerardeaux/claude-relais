// Prerequisites report (`verifier`) and guided installation (`installer`) of the images plugin.
// Rules: `verifier` changes nothing. `installer --etape X` without --oui only shows the plan (command,
// size, destination) and runs nothing: the skill asks the user, and only an explicit yes adds --oui.
// Every step is one small action; the downloads go to the folder the user chose (nothing heavy on C:).
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  dormir, dossierEtat, dossierSD, envCodex, envGitSafe, envSD, gitReel, executer, existe, exeDepuisShim, fichiersModeles, fichierConfig, homeCodex, lancerFond,
  langue, lireConfig, lireJSON, lireVersionVenv, ecrireJSON, pythonVenv, simulation, sonde, statutCodex, t, trouverCodex, venvAvecTorch, vivant,
} from './commun.mjs';

export const SDXL = {
  url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
  nom: 'sd_xl_base_1.0.safetensors',
  taille: 6938078334,
  sha256: '31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b',
};
const WEBUI_DEPOT = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';
const BESOIN_MO = { webui: 1000, venv: 6000, modele: 7000, marge: 1000 }; // about 15 GB when nothing is there yet
const VRAM_MIN_MO = 6144;

const echec = (code, fr, en) => ({ ok: false, code, message: t(fr, en) });
const ETAPES = { gratuit: ['git', 'python', 'webui', 'venv', 'premier-demarrage', 'modele'], codex: ['node', 'codex', 'connexion'] };

// ---------------------------------------------------------------- probes (each can be replaced by IMAGES_SONDE in tests)
const sync = (cmd, args, ms = 8000) => {
  try { return spawnSync(cmd, args, { encoding: 'utf8', timeout: ms, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return { status: -1, stdout: '', stderr: '' }; }
};
const plateforme = () => sonde('plateforme', () => process.platform);

function gpuReel() {
  const r = sync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  if (r.status === 0 && String(r.stdout).trim()) {
    const gpus = String(r.stdout).trim().split(/\r?\n/).map((l) => { const [nom, vram] = l.split(',').map((s) => s.trim()); return { nom, vramMo: Number(vram) || null }; });
    const g = gpus.sort((a, b) => (b.vramMo || 0) - (a.vramMo || 0))[0];
    return { nvidia: true, nom: g.nom, vramMo: g.vramMo, autres: [] };
  }
  let noms = [];
  if (process.platform === 'win32') {
    const p = sync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], 15000);
    noms = String(p.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const nv = noms.find((n) => /nvidia/i.test(n));
  return { nvidia: !!nv, nom: nv || '', vramMo: null, autres: noms.filter((n) => n !== nv) };
}
const sondeGPU = () => sonde('gpu', gpuReel) || { nvidia: false, nom: '', vramMo: null, autres: [] };

const sondeGit = () => { const s = sonde('git', gitReel); return typeof s === 'string' ? { version: s, exe: 'git' } : s; };

const sondeWinget = () => sonde('winget', () => sync('winget', ['--version']).status === 0);
const sondeUv = () => sonde('uv', () => sync('uv', ['--version']).status === 0);

function pythonsReels(cfg) {
  const cand = new Set();
  if (cfg.python310) cand.add(cfg.python310);
  for (const l of String(sync('py', ['-0p']).stdout || '').split(/\r?\n/)) { const m = /([A-Za-z]:\\.*?pythonw?\.exe)/i.exec(l); if (m) cand.add(m[1].trim()); }
  const uv = sync('uv', ['python', 'find', '3.10']);
  if (uv.status === 0) cand.add(String(uv.stdout).split(/\r?\n/)[0].trim());
  for (const base of [path.join(process.env.APPDATA || '', 'uv', 'python'), path.join(process.env.LOCALAPPDATA || '', 'uv', 'python')]) {
    try { for (const e of fs.readdirSync(base)) if (/^cpython-3\.10/.test(e)) cand.add(path.join(base, e, 'python.exe')); } catch { /* none */ }
  }
  cand.add(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'));
  cand.add('C:\\Python310\\python.exe');
  cand.add(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Python310', 'python.exe'));
  for (const d of String(process.env.PATH || '').split(path.delimiter)) { if (d) cand.add(path.join(d, process.platform === 'win32' ? 'python.exe' : 'python3.10')); }
  const trouves = [];
  for (const c of cand) {
    if (!c || /WindowsApps/i.test(c) || !existe(c)) continue; // the WindowsApps python is a Store stub
    const r = sync(c, ['--version'], 6000);
    const m = /Python (3\.10\.\d+)/.exec(`${r.stdout}${r.stderr}`);
    if (m && !trouves.some((x) => x.chemin.toLowerCase() === c.toLowerCase())) trouves.push({ chemin: c, version: m[1] });
  }
  return trouves;
}
const sondePython = (cfg) => sonde('pythons', () => pythonsReels(cfg)) || [];

function sondeNode() {
  return sonde('node', () => {
    const base = path.dirname(process.execPath);
    const npmCli = [path.join(base, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(base, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find(existe) || '';
    return { version: process.version, exe: process.execPath, npmCli };
  });
}

function libreReel(chemin) {
  let d = path.resolve(chemin);
  while (!existe(d) && path.dirname(d) !== d) d = path.dirname(d);
  try { const s = fs.statfsSync(d); return Math.floor((Number(s.bavail) * Number(s.bsize)) / 1048576); } catch { return null; }
}
const libreMo = (chemin) => sonde('libreMo', () => libreReel(chemin));

function disquesReels() {
  if (process.platform !== 'win32') return [];
  const p = sync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID + '|' + $_.FreeSpace }"], 15000);
  return String(p.stdout || '').split(/\r?\n/).map((l) => /^([A-Za-z]:)\|(\d+)/.exec(l.trim())).filter(Boolean)
    .map((m) => ({ racine: `${m[1]}\\`, libreMo: Math.floor(Number(m[2]) / 1048576) }));
}

// Folder proposed when the user has none: the fixed non-system drive with the most free space, else the user profile.
function proposerDossier(sous) {
  const systeme = String(process.env.SystemDrive || 'C:').toLowerCase();
  const autres = (sonde('disques', disquesReels) || []).filter((d) => d.racine.slice(0, 2).toLowerCase() !== systeme).sort((a, b) => b.libreMo - a.libreMo);
  return autres.length ? path.join(autres[0].racine, sous) : path.join(os.homedir(), sous.split(path.sep).pop());
}

// An absolute LOCAL path (drive letter on Windows); network paths are refused.
const cheminLocal = (d) => (process.platform === 'win32' ? /^[A-Za-z]:[\\/]/.test(d) : d.startsWith('/'));

// ---------------------------------------------------------------- state of the WebUI install
function dossierInstallSD(cfg, demande) {
  if (demande) return path.resolve(demande);
  if (cfg.sdDossier) return cfg.sdDossier;
  const connu = dossierSD(cfg);
  return existe(path.join(connu, 'launch.py')) ? connu : proposerDossier('stable-diffusion-webui');
}

function etatVenv(dossier) {
  const v = lireVersionVenv(dossier);
  const py = existe(pythonVenv(dossier));
  if (!v && !py && !existe(path.join(dossier, 'venv'))) return { etat: 'absent', version: '' };
  if (!py || !v) return { etat: 'casse', version: v };
  return /^3\.10\./.test(v) ? { etat: 'ok', version: v } : { etat: 'mauvais-python', version: v };
}

const journalInstallation = (dossier) => path.join(dossier, 'tmp', 'images-installation.log');
const fichierInstallation = () => path.join(dossierEtat(), 'sd-installation.json');
function queueJournal(f, n = 20000) {
  try {
    const s = fs.statSync(f).size; const fd = fs.openSync(f, 'r');
    try { const b = Buffer.alloc(Math.min(s, n)); fs.readSync(fd, b, 0, b.length, s - b.length); return b.toString('utf8'); } finally { fs.closeSync(fd); }
  } catch { return ''; }
}
const MARQUEUR_FIN = 'Exiting because of --exit argument';
function premierDemarrageFait(dossier) {
  if (queueJournal(journalInstallation(dossier)).includes(MARQUEUR_FIN)) return true;
  let n = 0; try { n = fs.readdirSync(path.join(dossier, 'repositories')).length; } catch { /* none */ }
  return venvAvecTorch(dossier) && n >= 3; // a first launch done by hand (webui-user.bat)
}
const installationEnCours = () => { const s = lireJSON(fichierInstallation()); return !!(s?.pid && vivant(s.pid)); };

function modeleEtat(dossier, nom) {
  const fichiers = fichiersModeles(dossier);
  if (fichiers.length) return { etat: 'ok', fichiers };
  let part = 0; try { part = fs.statSync(path.join(dossier, 'models', 'Stable-diffusion', `${nom}.part`)).size; } catch { /* none */ }
  return part ? { etat: 'partiel', part } : { etat: 'manque' };
}

// ---------------------------------------------------------------- the prerequisites report
const Go = (mo) => ((mo * 1.048576) / 1000).toFixed(1); // MiB in, decimal GB out (the way sizes are announced)
const MO = (n) => Math.round(n / 1048576);

function elementsGratuit(cfg, demande) {
  const dossier = dossierInstallSD(cfg, demande);
  const els = [];
  const ajoute = (id, etat, detail, etape) => els.push({ id, etat, detail, ...(etape ? { etape } : {}) });

  const pf = plateforme();
  ajoute('plateforme', pf === 'win32' ? 'ok' : 'bloquant', pf === 'win32' ? 'Windows'
    : t(`${pf} : l'installation guidée ne gère que Windows pour le moment. Sur Linux ou macOS, installe AUTOMATIC1111 en suivant son README puis indique le dossier avec configurer.`,
      `${pf}: the guided install only handles Windows for now. On Linux or macOS install AUTOMATIC1111 following its README, then give the folder to configurer.`));

  const g = sondeGPU();
  if (!g.nvidia) {
    ajoute('gpu', 'bloquant', t(`Aucune carte NVIDIA détectée${g.autres.length ? ` (vu : ${g.autres.join(', ')})` : ''}. Sans NVIDIA, Stable Diffusion tourne sur le processeur et reste inutilisable (plusieurs minutes par image). Ce plugin ne gère ni AMD ni Mac pour le moment : choisis plutôt le moteur Codex (forfait ChatGPT payant).`,
      `No NVIDIA graphics card detected${g.autres.length ? ` (seen: ${g.autres.join(', ')})` : ''}. Without NVIDIA, Stable Diffusion runs on the CPU and is unusably slow (minutes per image). This plugin supports neither AMD nor Mac for now: pick the Codex engine instead (paid ChatGPT plan).`));
  } else if (g.vramMo && g.vramMo < VRAM_MIN_MO) {
    ajoute('gpu', 'avertissement', t(`${g.nom}, ${Go(g.vramMo)} Go de VRAM : en dessous de 6 Go, SDXL échoue ou est très lent ; préfère un modèle SD 1.5.`, `${g.nom}, ${Go(g.vramMo)} GB of VRAM: under 6 GB, SDXL fails or is very slow; prefer an SD 1.5 model.`));
  } else if (!g.vramMo) {
    ajoute('gpu', 'avertissement', t(`${g.nom} (VRAM inconnue : installe le pilote NVIDIA pour que nvidia-smi réponde).`, `${g.nom} (VRAM unknown: install the NVIDIA driver so nvidia-smi answers).`));
  } else {
    ajoute('gpu', 'ok', `${g.nom}, ${Go(g.vramMo)} ${t('Go', 'GB')} VRAM`);
  }

  const git = sondeGit();
  ajoute('git', git ? 'ok' : 'manque', git ? `git ${git.version}` : t('Git est absent (nécessaire pour télécharger WebUI). Commande : winget install --id Git.Git -e', 'Git is missing (needed to download WebUI). Command: winget install --id Git.Git -e'), git ? null : 'git');

  const py = sondePython(cfg)[0];
  ajoute('python', py ? 'ok' : 'manque', py ? `Python ${py.version} (${py.chemin})`
    : t('Python 3.10 est absent (WebUI exige la 3.10 sous Windows, pas la 3.13). Commande : winget install --id Python.Python.3.10 -e ou uv python install 3.10', 'Python 3.10 is missing (WebUI needs 3.10 on Windows, not 3.13). Command: winget install --id Python.Python.3.10 -e or uv python install 3.10'), py ? null : 'python');

  const webui = existe(path.join(dossier, 'launch.py'));
  ajoute('webui', webui ? 'ok' : 'manque', webui ? dossier : t(`WebUI n'est pas téléchargé (dossier prévu : ${dossier}).`, `WebUI is not downloaded (planned folder: ${dossier}).`), webui ? null : 'webui');

  const v = webui ? etatVenv(dossier) : { etat: 'absent', version: '' };
  if (v.etat === 'ok') ajoute('venv', 'ok', t(`venv Python ${v.version}`, `venv Python ${v.version}`));
  else if (v.etat === 'absent') ajoute('venv', 'manque', t('Pas de venv (environnement Python de WebUI).', 'No venv (WebUI Python environment).'), 'venv');
  else ajoute('venv', 'mauvais', v.etat === 'casse'
    ? t('Le venv existe mais est cassé (python ou pyvenv.cfg introuvable). À recréer (installer --etape venv --recreer --oui) : l\'ancien dossier est renommé, pas supprimé.', 'The venv exists but is broken (python or pyvenv.cfg missing). To recreate (installer --etape venv --recreer --oui): the old folder is renamed, not deleted.')
    : t(`Le venv utilise Python ${v.version}, il faut la 3.10 (torch 2.1.2 n'existe pas pour ${v.version}). À recréer (installer --etape venv --recreer --oui) : l'ancien dossier est renommé, pas supprimé.`, `The venv uses Python ${v.version}, 3.10 is required (torch 2.1.2 has no build for ${v.version}). To recreate (installer --etape venv --recreer --oui): the old folder is renamed, not deleted.`), 'venv');

  if (v.etat !== 'ok') ajoute('installation', 'manque', t('Le premier lancement (installation de torch et des dépendances, plusieurs Go) viendra après le venv.', 'The first launch (torch and dependencies, several GB) comes after the venv.'), 'premier-demarrage');
  else if (premierDemarrageFait(dossier)) ajoute('installation', 'ok', t('Dépendances installées (torch, dépôts).', 'Dependencies installed (torch, repositories).'));
  else if (installationEnCours()) ajoute('installation', 'en-cours', t(`Installation en cours en arrière-plan. Journal : ${journalInstallation(dossier)}`, `Installation running in the background. Log: ${journalInstallation(dossier)}`), 'premier-demarrage');
  else ajoute('installation', 'manque', t('Premier lancement à faire (installe torch et les dépendances, 10 à 30 minutes).', 'First launch still to do (installs torch and dependencies, 10 to 30 minutes).'), 'premier-demarrage');

  const m = webui ? modeleEtat(dossier, SDXL.nom) : { etat: 'manque' };
  if (m.etat === 'ok') ajoute('modele', 'ok', m.fichiers.join(', '));
  else if (m.etat === 'partiel') ajoute('modele', 'partiel', t(`Téléchargement entamé (${MO(m.part)} Mo sur ${MO(SDXL.taille)}) : relancer la même étape reprend où il s'est arrêté.`, `Download started (${MO(m.part)} MB of ${MO(SDXL.taille)}): running the same step again resumes it.`), 'modele');
  else ajoute('modele', 'manque', t(`Aucun modèle (checkpoint). Proposé : SDXL 1.0 base, ${Go(SDXL.taille / 1048576)} Go.`, `No model (checkpoint). Proposed: SDXL 1.0 base, ${Go(SDXL.taille / 1048576)} GB.`), 'modele');

  let besoin = BESOIN_MO.marge;
  if (!webui) besoin += BESOIN_MO.webui;
  if (v.etat !== 'ok' || !premierDemarrageFait(dossier)) besoin += BESOIN_MO.venv;
  if (m.etat !== 'ok') besoin += BESOIN_MO.modele;
  const libre = libreMo(dossier);
  const lecteur = path.parse(path.resolve(dossier)).root;
  els.splice(2, 0, libre === null
    ? { id: 'disque', etat: 'avertissement', detail: t(`Espace libre sur ${lecteur} : impossible à lire (il faut environ ${Go(besoin)} Go).`, `Free space on ${lecteur}: could not be read (about ${Go(besoin)} GB needed).`) }
    : libre >= besoin
      ? { id: 'disque', etat: 'ok', detail: t(`${Go(libre)} Go libres sur ${lecteur} (environ ${Go(besoin)} Go nécessaires).`, `${Go(libre)} GB free on ${lecteur} (about ${Go(besoin)} GB needed).`) }
      : { id: 'disque', etat: 'bloquant', detail: t(`${Go(libre)} Go libres sur ${lecteur}, il en faut environ ${Go(besoin)} Go (WebUI 1 Go, torch et venv 6 Go, SDXL 7 Go). Libère de la place ou choisis un autre disque avec --dossier.`, `${Go(libre)} GB free on ${lecteur}, about ${Go(besoin)} GB needed (WebUI 1 GB, torch and venv 6 GB, SDXL 7 GB). Free some space or pick another drive with --dossier.`) });
  return { els, dossier };
}

function elementsCodex(cfg, demande) {
  const els = [];
  const ajoute = (id, etat, detail, etape) => els.push({ id, etat, detail, ...(etape ? { etape } : {}) });
  const dossier = demande ? path.resolve(demande) : (cfg.codexDossier || proposerDossier(path.join('outils', 'codex')));
  ajoute('forfait', 'avertissement', t('La génération d\'images par Codex exige un forfait ChatGPT PAYANT (Plus ou Pro). Un compte gratuit peut se connecter mais ne peut pas générer. Sinon, choisis le moteur gratuit (Stable Diffusion).', 'Image generation through Codex needs a PAID ChatGPT plan (Plus or Pro). A free account can sign in but cannot generate. Otherwise pick the free engine (Stable Diffusion).'));
  const node = sondeNode();
  const nodeOk = !!(node && node.npmCli);
  ajoute('node', nodeOk ? 'ok' : 'manque', nodeOk ? `Node.js ${node.version}` : t('Node.js (avec npm) est absent. Commande : winget install OpenJS.NodeJS.LTS', 'Node.js (with npm) is missing. Command: winget install OpenJS.NodeJS.LTS'), nodeOk ? null : 'node');
  const { exe } = trouverCodex(cfg);
  ajoute('codex', exe ? 'ok' : 'manque', exe || t(`Codex n'est pas installé (dossier prévu : ${dossier}, environ 450 Mo).`, `Codex is not installed (planned folder: ${dossier}, about 450 MB).`), exe ? null : 'codex');
  const home = homeCodex(cfg);
  ajoute('codex-home', 'info', home || t(`Dossier de connexion Codex : ${path.join(dossier, 'home')} (créé à l'installation).`, `Codex login folder: ${path.join(dossier, 'home')} (created by the install).`));
  const st = exe ? statutCodex(cfg, exe) : { connecte: false, texte: '' };
  ajoute('connexion', st.connecte ? 'ok' : 'manque', st.connecte ? st.texte : t('Pas connecté à un compte ChatGPT (codex login ouvre le navigateur, tu te connectes).', 'Not signed in to a ChatGPT account (codex login opens the browser, you sign in).'), st.connecte ? null : 'connexion');
  const libre = libreMo(dossier);
  const lecteur = path.parse(path.resolve(dossier)).root;
  const besoin = exe ? 0 : 1500;
  els.push(libre === null ? { id: 'disque', etat: 'avertissement', detail: t(`Espace libre sur ${lecteur} : illisible.`, `Free space on ${lecteur}: unreadable.`) }
    : libre >= besoin ? { id: 'disque', etat: 'ok', detail: t(`${Go(libre)} Go libres sur ${lecteur}.`, `${Go(libre)} GB free on ${lecteur}.`) }
      : { id: 'disque', etat: 'bloquant', detail: t(`${Go(libre)} Go libres sur ${lecteur}, il en faut environ 1,5.`, `${Go(libre)} GB free on ${lecteur}, about 1.5 needed.`) });
  return { els, dossier };
}

const LIBELLES = {
  plateforme: ['Système', 'System'], gpu: ['Carte graphique', 'Graphics card'], disque: ['Espace disque', 'Disk space'], git: ['Git', 'Git'],
  python: ['Python 3.10', 'Python 3.10'], webui: ['WebUI (AUTOMATIC1111)', 'WebUI (AUTOMATIC1111)'], venv: ['Environnement Python (venv)', 'Python environment (venv)'],
  installation: ['Premier lancement (torch)', 'First launch (torch)'], modele: ['Modèle (checkpoint)', 'Model (checkpoint)'],
  forfait: ['Forfait ChatGPT', 'ChatGPT plan'], node: ['Node.js', 'Node.js'], codex: ['Codex', 'Codex'], 'codex-home': ['Dossier Codex', 'Codex folder'], connexion: ['Connexion ChatGPT', 'ChatGPT sign-in'],
};
const ETIQUETTES = { ok: 'OK', manque: 'MANQUE', mauvais: 'A REFAIRE', partiel: 'PARTIEL', 'en-cours': 'EN COURS', avertissement: 'ATTENTION', bloquant: 'BLOQUANT', info: 'INFO' };
const ETIQUETTES_EN = { ok: 'OK', manque: 'MISSING', mauvais: 'REDO', partiel: 'PARTIAL', 'en-cours': 'RUNNING', avertissement: 'WARNING', bloquant: 'BLOCKING', info: 'INFO' };

export async function cmdVerifier(o) {
  const cfg = lireConfig();
  const moteur = o.moteur || cfg.moteur;
  if (!moteur) return { sortie: { ok: false, code: 'args', message: t('Indique le moteur : --moteur gratuit ou --moteur codex.', 'Give the engine: --moteur gratuit or --moteur codex.') }, code: 2 };
  if (o.dossier && !cheminLocal(o.dossier)) return { sortie: echec('args', `--dossier doit être un chemin absolu local : ${o.dossier}`, `--dossier must be a local absolute path: ${o.dossier}`), code: 2 };
  const { els, dossier } = moteur === 'codex' ? elementsCodex(cfg, o.dossier) : elementsGratuit(cfg, o.dossier);
  const bloquants = els.filter((e) => e.etat === 'bloquant').map((e) => e.id);
  const aFaire = els.filter((e) => ['manque', 'mauvais', 'partiel', 'en-cours'].includes(e.etat) && e.etape);
  const prochaine = bloquants.length ? null : (aFaire[0]?.etape || null);
  const pret = !bloquants.length && !aFaire.length;
  const etiq = langue() === 'fr' ? ETIQUETTES : ETIQUETTES_EN;
  const lignes = [t(`Prérequis du moteur ${moteur === 'codex' ? 'Codex (forfait ChatGPT payant)' : 'gratuit (Stable Diffusion local)'} :`, `Prerequisites of the ${moteur === 'codex' ? 'Codex (paid ChatGPT plan)' : 'free (local Stable Diffusion)'} engine:`)];
  for (const e of els) lignes.push(`[${etiq[e.etat]}] ${LIBELLES[e.id][langue() === 'fr' ? 0 : 1]} : ${e.detail}`);
  lignes.push(bloquants.length ? t('Bloquant : rien ne sera installé tant que ce point n\'est pas réglé.', 'Blocking: nothing will be installed until this is solved.')
    : pret ? t('Tout est prêt.', 'Everything is ready.')
      : t(`Prochaine étape : installer --etape ${prochaine} (montre le plan ; ajoute --oui seulement après l'accord de l'utilisateur).`, `Next step: installer --etape ${prochaine} (shows the plan; add --oui only after the user agrees).`));
  return { sortie: { ok: true, moteur, pret, dossier, elements: els, bloquants, prochaineEtape: prochaine, texte: lignes.join('\n') }, code: 0 };
}

// ---------------------------------------------------------------- installation steps
const ARGS_WINGET = ['-e', '--accept-package-agreements', '--accept-source-agreements'];
const sauverConfig = (patch) => ecrireJSON(fichierConfig(), { ...lireConfig(), ...patch });
const verifierBloquants = (cfg, o, gratuit = true) => {
  const { els } = gratuit ? elementsGratuit(cfg, o.dossier) : elementsCodex(cfg, o.dossier);
  return els.find((e) => e.etat === 'bloquant');
};

const boucleLocale = (u) => { try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };
function urlAutorisee(u) {
  let x; try { x = new URL(u); } catch { return false; }
  const boucle = boucleLocale(u);
  return x.protocol === 'https:' || (x.protocol === 'http:' && boucle);
}

function hacher(f) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Downloads `url` to `final` through `final.part`, resuming (HTTP Range) from what is already there, then
// checks the SHA-256 and renames. A bad hash keeps the .part and says so. Progress goes to stderr.
export async function telecharger({ url, final, taille, sha256, delai = 540, repartir = false }) {
  const part = `${final}.part`;
  fs.mkdirSync(path.dirname(final), { recursive: true });
  if (existe(final)) {
    if (!sha256) return { ok: true, deja: true, verifie: false, fichier: final };
    return (await hacher(final)) === sha256 ? { ok: true, deja: true, verifie: true, fichier: final }
      : echec('modele-different', `${final} existe déjà mais son empreinte SHA-256 ne correspond pas : je ne l'écrase pas. Renomme-le ou choisis un autre nom (--nom).`, `${final} already exists but its SHA-256 does not match: I do not overwrite it. Rename it or pick another name (--nom).`);
  }
  if (repartir) fs.rmSync(part, { force: true });
  let debut = existe(part) ? fs.statSync(part).size : 0;
  let total = taille || 0;
  if (total && debut > total) { fs.rmSync(part, { force: true }); debut = 0; } // bigger than the real file: corrupt, start over
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), delai * 1000);
  const partiel = (raison) => {
    const n = existe(part) ? fs.statSync(part).size : 0;
    return { ...echec('dl-partiel', `Téléchargement interrompu (${raison}) : ${MO(n)} Mo reçus${total ? ` sur ${MO(total)}` : ''}. Le fichier ${part} est gardé : relance la même commande pour reprendre.`, `Download interrupted (${raison}): ${MO(n)} MB received${total ? ` of ${MO(total)}` : ''}. The file ${part} is kept: run the same command again to resume.`), recu: n, total };
  };
  try {
    if (!(total && debut === total)) {
      let rep = await fetch(url, { headers: debut ? { Range: `bytes=${debut}-` } : {}, signal: ctl.signal });
      if (rep.status === 416) { fs.rmSync(part, { force: true }); debut = 0; rep = await fetch(url, { signal: ctl.signal }); }
      if (rep.status === 200 && debut > 0) debut = 0; // the server ignored Range: start over
      else if (rep.status !== 200 && rep.status !== 206) return echec('dl-http', `Le serveur a répondu HTTP ${rep.status} pour ${url}.`, `The server answered HTTP ${rep.status} for ${url}.`);
      let annonce = 0;
      if (rep.status === 206) { const m = /\/(\d+)\s*$/.exec(rep.headers.get('content-range') || ''); if (m) annonce = Number(m[1]); }
      else annonce = Number(rep.headers.get('content-length') || 0);
      total = taille || annonce;
      if (taille && annonce && annonce !== taille) { await rep.body?.cancel(); return echec('dl-taille', `Le fichier annoncé fait ${annonce} octets au lieu de ${taille} : ce n'est pas le bon fichier, rien n'est enregistré.`, `The announced file is ${annonce} bytes instead of ${taille}: wrong file, nothing saved.`); }
      const libre = libreMo(path.dirname(final));
      if (libre !== null && total && libre < Math.ceil((total - debut) / 1048576) + 300) { await rep.body?.cancel(); return echec('disque-plein', `Pas assez de place : ${Go(libre)} Go libres, il en faut ${Go(Math.ceil((total - debut) / 1048576) + 300)}.`, `Not enough space: ${Go(libre)} GB free, ${Go(Math.ceil((total - debut) / 1048576) + 300)} needed.`); }
      let dernier = Date.now(); let recu = debut;
      const compteur = new Transform({ transform(chunk, _e, cb) { recu += chunk.length; if (Date.now() - dernier > 5000) { dernier = Date.now(); process.stderr.write(`${t('telechargement', 'download')} : ${MO(recu)} / ${total ? MO(total) : '?'} ${t('Mo', 'MB')}\n`); } cb(null, chunk); } });
      try {
        await pipeline(Readable.fromWeb(rep.body), compteur, fs.createWriteStream(part, { flags: debut ? 'a' : 'w' }), { signal: ctl.signal });
      } catch (e) { return partiel(e?.name === 'AbortError' ? t('délai écoulé', 'time budget over') : String(e?.cause?.code || e?.message || e).slice(0, 80)); }
    }
    const n = fs.statSync(part).size;
    if (total && n < total) return partiel(t('flux coupé', 'stream cut'));
    if (sha256) {
      const h = await hacher(part);
      if (h !== sha256) return { ...echec('dl-hash', `L'empreinte SHA-256 ne correspond pas (attendue ${sha256}, obtenue ${h}). Le fichier ${part} est gardé mais PAS renommé : ne l'utilise pas. Relance avec --repartir pour tout retélécharger.`, `The SHA-256 does not match (expected ${sha256}, got ${h}). The file ${part} is kept but NOT renamed: do not use it. Run again with --repartir to download everything again.`), attendu: sha256, obtenu: h, partiel: part };
    }
    fs.renameSync(part, final);
    return { ok: true, fichier: final, octets: n, verifie: !!sha256 };
  } catch (e) {
    return e?.name === 'AbortError' ? partiel(t('délai écoulé', 'time budget over')) : partiel(String(e?.cause?.code || e?.message || e).slice(0, 80));
  } finally { clearTimeout(minuteur); }
}

// Each preparer returns { fait } (nothing to do), { refus } or { plan, lancer }.
function preparer(etape, o, cfg) {
  const prerequis = (fr, en) => ({ refus: echec('prerequis', fr, en) });
  const bloque = (gratuit) => { const b = verifierBloquants(cfg, o, gratuit); return b ? { refus: { ok: false, code: 'bloquant', message: b.detail } } : null; };
  const delai = o.delai;
  const dossier = ETAPES.gratuit.includes(etape) ? dossierInstallSD(cfg, o.dossier) : null;
  const termine = (texte) => ({ ok: true, message: texte });

  switch (etape) {
    case 'git': {
      if (sondeGit()) return { fait: t('Git est déjà installé.', 'Git is already installed.') };
      if (!sondeWinget()) return { refus: echec('winget-absent', 'winget est absent : installe Git à la main depuis https://git-scm.com/download/win puis relance.', 'winget is missing: install Git by hand from https://git-scm.com/download/win then run again.') };
      const args = ['install', '--id', 'Git.Git', ...ARGS_WINGET];
      return {
        plan: { titre: t('Installer Git avec winget', 'Install Git with winget'), commande: ['winget', ...args], taille: t('environ 350 Mo', 'about 350 MB'), destination: t('C:\\Program Files\\Git (géré par winget ; une fenêtre d\'autorisation Windows peut s\'ouvrir)', 'C:\\Program Files\\Git (managed by winget; a Windows permission prompt may open)') },
        async lancer() {
          const r = await executer('winget', args, { delai: delai || 900 });
          if (r.simule) return termine(t('Commande winget enregistrée (simulation).', 'winget command recorded (simulation).'));
          return sondeGit() || r.code === 0 ? termine(t('Git est installé. Si la suite ne le trouve pas, redémarre Claude Code pour qu\'il voie le nouveau PATH.', 'Git is installed. If the next step cannot find it, restart Claude Code so it sees the new PATH.'))
            : echec('echec-commande', `winget a échoué (code ${r.code}) : ${r.sortie.slice(-300)}`, `winget failed (code ${r.code}): ${r.sortie.slice(-300)}`);
        },
      };
    }
    case 'python': {
      const py = sondePython(cfg)[0];
      if (py) return { fait: t(`Python ${py.version} est déjà présent (${py.chemin}).`, `Python ${py.version} is already there (${py.chemin}).`) };
      const methode = o.methode || (sondeWinget() ? 'winget' : sondeUv() ? 'uv' : '');
      if (!['winget', 'uv'].includes(methode)) return { refus: echec('winget-absent', 'Ni winget ni uv ne sont disponibles : installe Python 3.10 à la main depuis https://www.python.org/downloads/ (version 3.10.x) puis relance.', 'Neither winget nor uv is available: install Python 3.10 by hand from https://www.python.org/downloads/ (3.10.x) then run again.') };
      if ((methode === 'winget' && !sondeWinget()) || (methode === 'uv' && !sondeUv())) return { refus: echec('winget-absent', `${methode} n'est pas disponible sur ce PC.`, `${methode} is not available on this PC.`) };
      const cible = o.dossier ? path.resolve(o.dossier) : '';
      const wargs = ['install', '--id', 'Python.Python.3.10', ...ARGS_WINGET, ...(cible ? ['--location', cible] : [])];
      const [cmd, args, env] = methode === 'winget' ? ['winget', wargs, undefined] : ['uv', ['python', 'install', '3.10'], cible ? { ...process.env, UV_PYTHON_INSTALL_DIR: cible } : undefined];
      return {
        plan: { titre: t(`Installer Python 3.10 (${methode})`, `Install Python 3.10 (${methode})`), commande: [cmd, ...args], taille: t('environ 30 Mo à télécharger, 100 Mo installés', 'about 30 MB to download, 100 MB installed'),
          destination: cible || (methode === 'winget' ? t('dossier par défaut de l\'installeur Python (ajoute --dossier pour en choisir un)', 'default folder of the Python installer (add --dossier to choose one)') : t('dossier par défaut de uv (ajoute --dossier pour en choisir un)', 'default uv folder (add --dossier to choose one)')) },
        async lancer() {
          const r = await executer(cmd, args, { delai: delai || 900, env });
          if (r.simule) return termine(t('Commande enregistrée (simulation).', 'Command recorded (simulation).'));
          const apres = sondePython(cfg)[0];
          return apres ? termine(t(`Python ${apres.version} installé (${apres.chemin}).`, `Python ${apres.version} installed (${apres.chemin}).`))
            : echec('echec-commande', `L'installation de Python a échoué ou Python 3.10 reste introuvable (code ${r.code}) : ${r.sortie.slice(-300)}`, `The Python install failed or Python 3.10 is still not found (code ${r.code}): ${r.sortie.slice(-300)}`);
        },
      };
    }
    case 'webui': {
      if (existe(path.join(dossier, 'launch.py'))) { sauverConfig({ sdDossier: dossier }); return { fait: t(`WebUI est déjà dans ${dossier}.`, `WebUI is already in ${dossier}.`) }; }
      const b = bloque(true); if (b) return b;
      const git = sondeGit();
      if (!git) return prerequis('Git est absent : fais d\'abord l\'étape git.', 'Git is missing: do the git step first.');
      if (existe(dossier) && fs.readdirSync(dossier).length) return { refus: echec('dossier-occupe', `Le dossier ${dossier} n'est pas vide : choisis-en un autre avec --dossier.`, `The folder ${dossier} is not empty: pick another with --dossier.`) };
      const libre = libreMo(dossier);
      if (libre !== null && libre < BESOIN_MO.webui + 500) return { refus: echec('disque-plein', `Pas assez de place sur ce disque (${Go(libre)} Go libres).`, `Not enough space on this drive (${Go(libre)} GB free).`) };
      const args = ['clone', WEBUI_DEPOT, dossier];
      return {
        plan: { titre: t('Télécharger Stable Diffusion WebUI (git clone)', 'Download Stable Diffusion WebUI (git clone)'), commande: [git.exe, ...args], taille: t('environ 1 Go (estimation)', 'about 1 GB (estimate)'), destination: dossier },
        async lancer() {
          fs.mkdirSync(path.dirname(dossier), { recursive: true });
          const r = await executer(git.exe, args, { env: envGitSafe(dossier), delai: delai || 900 });
          if (r.simule) return { ...termine(t('Commande git enregistrée (simulation).', 'git command recorded (simulation).')), dossier };
          if (!existe(path.join(dossier, 'launch.py'))) return echec('echec-commande', `git clone a échoué (code ${r.code}) : ${r.sortie.slice(-300)}`, `git clone failed (code ${r.code}): ${r.sortie.slice(-300)}`);
          sauverConfig({ sdDossier: dossier });
          return { ...termine(t(`WebUI téléchargé dans ${dossier} et enregistré dans la configuration.`, `WebUI downloaded to ${dossier} and saved in the configuration.`)), dossier };
        },
      };
    }
    case 'venv': {
      if (!existe(path.join(dossier, 'launch.py'))) return prerequis(`WebUI est introuvable dans ${dossier} : fais d'abord l'étape webui.`, `WebUI not found in ${dossier}: do the webui step first.`);
      const b = bloque(true); if (b) return b;
      const py = sondePython(cfg)[0];
      if (!py) return prerequis('Python 3.10 est introuvable : fais d\'abord l\'étape python.', 'Python 3.10 not found: do the python step first.');
      const v = etatVenv(dossier);
      if (v.etat === 'ok') return { fait: t(`Le venv (Python ${v.version}) est déjà bon.`, `The venv (Python ${v.version}) is already good.`) };
      const venv = path.join(dossier, 'venv');
      const ancien = `${venv}.ancien-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
      if (v.etat !== 'absent' && !o.recreer) {
        return { refus: echec('venv-existant', v.etat === 'casse' ? `Il existe un venv cassé dans ${venv}. Pour le recréer, ajoute --recreer (l'ancien est renommé en ${path.basename(ancien)}, pas supprimé).` : `Le venv de ${venv} utilise Python ${v.version} au lieu de la 3.10. Pour le recréer, ajoute --recreer (l'ancien est renommé en ${path.basename(ancien)}, pas supprimé).`,
          v.etat === 'casse' ? `There is a broken venv in ${venv}. To recreate it add --recreer (the old one is renamed to ${path.basename(ancien)}, not deleted).` : `The venv in ${venv} uses Python ${v.version} instead of 3.10. To recreate it add --recreer (the old one is renamed to ${path.basename(ancien)}, not deleted).`) };
      }
      const args = ['-m', 'venv', venv];
      return {
        plan: { titre: t('Créer le venv Python 3.10 de WebUI', 'Create the WebUI Python 3.10 venv'), commande: [py.chemin, ...args], taille: t('environ 20 Mo (les paquets viennent à l\'étape suivante)', 'about 20 MB (packages come with the next step)'),
          destination: venv + (v.etat !== 'absent' ? t(` (l'ancien venv est d'abord renommé en ${path.basename(ancien)})`, ` (the old venv is first renamed to ${path.basename(ancien)})`) : '') },
        async lancer() {
          if (v.etat !== 'absent') fs.renameSync(venv, ancien);
          const r = await executer(py.chemin, args, { cwd: dossier, delai: delai || 300 });
          if (r.simule) return termine(t('Commande venv enregistrée (simulation).', 'venv command recorded (simulation).'));
          const apres = etatVenv(dossier);
          return apres.etat === 'ok' ? termine(t(`Venv créé (Python ${apres.version}).${v.etat !== 'absent' ? ` L'ancien est dans ${ancien} (supprime-le à la main pour libérer la place).` : ''}`, `Venv created (Python ${apres.version}).${v.etat !== 'absent' ? ` The old one is in ${ancien} (delete it by hand to free the space).` : ''}`))
            : echec('echec-commande', `La création du venv a échoué (code ${r.code}) : ${r.sortie.slice(-300)}`, `Creating the venv failed (code ${r.code}): ${r.sortie.slice(-300)}`);
        },
      };
    }
    case 'premier-demarrage': {
      if (!existe(path.join(dossier, 'launch.py'))) return prerequis(`WebUI est introuvable dans ${dossier}.`, `WebUI not found in ${dossier}.`);
      const b = bloque(true); if (b) return b;
      const v = etatVenv(dossier);
      if (v.etat !== 'ok') return prerequis('Il faut d\'abord un venv Python 3.10 (étape venv).', 'A Python 3.10 venv is needed first (venv step).');
      if (premierDemarrageFait(dossier)) return { fait: t('Les dépendances de WebUI sont déjà installées.', 'The WebUI dependencies are already installed.') };
      const libre = libreMo(dossier);
      if (libre !== null && libre < BESOIN_MO.venv) return { refus: echec('disque-plein', `Pas assez de place (${Go(libre)} Go libres, il en faut 6).`, `Not enough space (${Go(libre)} GB free, 6 needed).`) };
      const python = pythonVenv(dossier);
      const log = journalInstallation(dossier);
      const args = ['launch.py', '--exit'];
      return {
        plan: { titre: t('Premier lancement de WebUI : installe torch (CUDA) et les dépendances, puis s\'arrête (--exit)', 'First WebUI launch: installs torch (CUDA) and the dependencies, then stops (--exit)'),
          commande: [python, ...args], taille: t('5 à 6 Go de téléchargements, 10 à 30 minutes', '5 to 6 GB of downloads, 10 to 30 minutes'), destination: `${dossier} (venv, caches pip et HuggingFace dans ${path.join(dossier, 'tmp')})`, journal: log },
        async lancer() {
          const deja = lireJSON(fichierInstallation());
          let fini = null;
          if (!(deja?.pid && vivant(deja.pid))) {
            const f = lancerFond(python, args, { cwd: dossier, env: envSD(dossier, []), log });
            if (f.simule) return termine(t('Premier lancement enregistré (simulation).', 'First launch recorded (simulation).'));
            ecrireJSON(fichierInstallation(), { pid: f.pid, depuis: new Date().toISOString() });
            fini = f.fini;
          }
          const pid = fini ? lireJSON(fichierInstallation()).pid : deja.pid;
          let termineExit = false; fini?.then(() => { termineExit = true; });
          const limite = Date.now() + (o.attente ?? 540) * 1000;
          let dernierMsg = Date.now();
          while (Date.now() < limite) {
            await dormir(3000);
            if (queueJournal(log).includes(MARQUEUR_FIN)) { try { fs.rmSync(fichierInstallation(), { force: true }); } catch { /* ignore */ } return termine(t('Dépendances installées : WebUI est prêt à démarrer. Il reste le modèle si aucun n\'est installé.', 'Dependencies installed: WebUI is ready to start. A model is still needed if none is installed.')); }
            if (termineExit || !vivant(pid)) { try { fs.rmSync(fichierInstallation(), { force: true }); } catch { /* ignore */ } break; }
            if (Date.now() - dernierMsg > 30000) { dernierMsg = Date.now(); process.stderr.write(`${queueJournal(log, 300).split(/\r?\n/).filter(Boolean).pop() || ''}\n`); }
          }
          if (queueJournal(log).includes(MARQUEUR_FIN)) return termine(t('Dépendances installées.', 'Dependencies installed.'));
          if (!termineExit && vivant(pid)) return echec('installation-en-cours', `L'installation continue en arrière-plan (plusieurs minutes encore). Journal : ${log}. Relance la même commande ou verifier pour suivre.`, `The installation keeps running in the background (several more minutes). Log: ${log}. Run the same command or verifier to follow it.`);
          return echec('installation-echec', `L'installation s'est arrêtée avant la fin. Fin du journal (${log}) :\n${queueJournal(log, 1200).trim()}`, `The installation stopped before the end. End of the log (${log}):\n${queueJournal(log, 1200).trim()}`);
        },
      };
    }
    case 'modele': {
      if (!existe(path.join(dossier, 'launch.py'))) return prerequis(`WebUI est introuvable dans ${dossier} : fais d'abord l'étape webui.`, `WebUI not found in ${dossier}: do the webui step first.`);
      const url = o.url || SDXL.url;
      if (!urlAutorisee(url)) return { refus: echec('url', `Adresse refusée : ${url} (https obligatoire).`, `Address refused: ${url} (https required).`) };
      const personnalise = !!o.url;
      const nom = o.nom || (personnalise ? decodeURIComponent(path.basename(new URL(url).pathname)) : SDXL.nom);
      if (!/^[\w.()+\- ]+\.(safetensors|ckpt)$/i.test(nom)) return { refus: echec('args', `Nom de fichier modèle invalide : ${nom} (.safetensors ou .ckpt).`, `Invalid model file name: ${nom} (.safetensors or .ckpt).`) };
      const taille = personnalise ? o.taille : (o.taille || SDXL.taille);
      const sha256 = personnalise ? (o.sha256 || '').toLowerCase() : (o.sha256 || SDXL.sha256).toLowerCase();
      if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return { refus: echec('args', '--sha256 doit faire 64 caractères hexadécimaux.', '--sha256 must be 64 hexadecimal characters.') };
      const final = path.join(dossier, 'models', 'Stable-diffusion', nom);
      return {
        plan: { titre: personnalise ? t(`Télécharger le modèle ${nom}`, `Download the model ${nom}`) : t('Télécharger le modèle SDXL 1.0 base (Stability AI)', 'Download the SDXL 1.0 base model (Stability AI)'),
          commande: ['GET', url, t('(reprise automatique, vérification SHA-256)', '(automatic resume, SHA-256 check)')], taille: taille ? t(`${Go(taille / 1048576)} Go`, `${Go(taille / 1048576)} GB`) : t('taille inconnue', 'unknown size'), destination: final,
          ...(sha256 ? {} : { avertissement: t('Aucune empreinte SHA-256 donnée : le fichier ne sera pas vérifié.', 'No SHA-256 given: the file will not be verified.') }) },
        async lancer() {
          if (simulation() && !boucleLocale(url)) return echec('url', 'Mode simulation : aucun téléchargement hors de cette machine.', 'Simulation mode: no download from outside this machine.');
          const r = await telecharger({ url, final, taille, sha256, delai: delai || 540, repartir: !!o.repartir });
          if (!r.ok) return r;
          return { ...termine(r.deja ? t(`Le modèle est déjà là (${final}).`, `The model is already there (${final}).`) : t(`Modèle téléchargé${r.verifie ? ' et vérifié (SHA-256)' : ''} : ${final}`, `Model downloaded${r.verifie ? ' and verified (SHA-256)' : ''}: ${final}`)), fichier: final, verifie: r.verifie, ...(r.deja ? { deja: true } : {}) };
        },
      };
    }
    case 'node': {
      const n = sondeNode();
      if (n?.npmCli) return { fait: t(`Node.js ${n.version} et npm sont déjà là.`, `Node.js ${n.version} and npm are already there.`) };
      if (!sondeWinget()) return { refus: echec('winget-absent', 'winget est absent : installe Node.js LTS à la main depuis https://nodejs.org puis relance.', 'winget is missing: install Node.js LTS by hand from https://nodejs.org then run again.') };
      const args = ['install', '--id', 'OpenJS.NodeJS.LTS', ...ARGS_WINGET];
      return {
        plan: { titre: t('Installer Node.js LTS avec winget', 'Install Node.js LTS with winget'), commande: ['winget', ...args], taille: t('environ 30 Mo à télécharger, 150 Mo installés', 'about 30 MB to download, 150 MB installed'), destination: 'C:\\Program Files\\nodejs' },
        async lancer() {
          const r = await executer('winget', args, { delai: delai || 900 });
          if (r.simule) return termine(t('Commande enregistrée (simulation).', 'Command recorded (simulation).'));
          return r.code === 0 ? termine(t('Node.js installé. Redémarre Claude Code pour qu\'il voie le nouveau PATH.', 'Node.js installed. Restart Claude Code so it sees the new PATH.'))
            : echec('echec-commande', `winget a échoué (code ${r.code}) : ${r.sortie.slice(-300)}`, `winget failed (code ${r.code}): ${r.sortie.slice(-300)}`);
        },
      };
    }
    case 'codex': {
      const cible = o.dossier ? path.resolve(o.dossier) : (cfg.codexDossier || proposerDossier(path.join('outils', 'codex')));
      if (!o.dossier && trouverCodex(cfg).exe) return { fait: t(`Codex est déjà installé (${trouverCodex(cfg).exe}).`, `Codex is already installed (${trouverCodex(cfg).exe}).`) };
      const b = bloque(false); if (b) return b;
      const n = sondeNode();
      if (!n?.npmCli) return prerequis('Node.js (avec npm) est absent : fais d\'abord l\'étape node.', 'Node.js (with npm) is missing: do the node step first.');
      const args = [n.npmCli, 'install', '--prefix', cible, '@openai/codex'];
      const env = { ...process.env, npm_config_cache: path.join(cible, '.npm-cache') };
      const home = cfg.codexHome || process.env.CODEX_HOME || path.join(cible, 'home');
      return {
        plan: { titre: t('Installer Codex CLI (npm, dans un dossier à part)', 'Install Codex CLI (npm, in a folder of its own)'), commande: [n.exe, ...args], taille: t('environ 450 Mo', 'about 450 MB'), destination: `${cible} (${t('cache npm et connexion dans', 'npm cache and login in')} ${cible}${path.sep}.npm-cache, ${home})` },
        async lancer() {
          fs.mkdirSync(cible, { recursive: true });
          const r = await executer(n.exe, args, { cwd: cible, env, delai: delai || 900 });
          if (r.simule) { fs.mkdirSync(home, { recursive: true }); return { ...termine(t('Commande npm enregistrée (simulation).', 'npm command recorded (simulation).')), dossier: cible }; }
          const shim = path.join(cible, 'node_modules', '.bin', 'codex.cmd');
          if (!exeDepuisShim(shim)) return echec('echec-commande', `npm a échoué ou codex.exe est introuvable (code ${r.code}) : ${r.sortie.slice(-300)}`, `npm failed or codex.exe was not found (code ${r.code}): ${r.sortie.slice(-300)}`);
          fs.mkdirSync(home, { recursive: true });
          sauverConfig({ codexExe: shim, codexHome: home, codexDossier: cible });
          return { ...termine(t(`Codex installé dans ${cible}, enregistré dans la configuration (connexion dans ${home}).`, `Codex installed in ${cible}, saved in the configuration (login in ${home}).`)), dossier: cible };
        },
      };
    }
    case 'connexion': {
      const { exe } = trouverCodex(cfg);
      if (!exe) return prerequis('Codex est introuvable : fais d\'abord l\'étape codex.', 'Codex not found: do the codex step first.');
      const st = statutCodex(cfg, exe);
      if (st.connecte) return { fait: t(`Déjà connecté (${st.texte}). Rappel : la génération d'images exige un forfait ChatGPT payant (Plus/Pro).`, `Already signed in (${st.texte}). Reminder: image generation needs a paid ChatGPT plan (Plus/Pro).`) };
      const commandeCodex = /\.(m?js|cjs)$/i.test(exe) ? [process.execPath, exe, 'login'] : [exe, 'login'];
      return {
        plan: { titre: t('Connecter Codex à ton compte ChatGPT (codex login)', 'Sign Codex in to your ChatGPT account (codex login)'), commande: commandeCodex, taille: t('rien à télécharger', 'nothing to download'),
          destination: t(`connexion enregistrée dans ${homeCodex(cfg) || '~/.codex'}`, `login stored in ${homeCodex(cfg) || '~/.codex'}`),
          avertissement: t('Une page de navigateur s\'ouvre : l\'utilisateur se connecte lui-même. Un compte gratuit se connecte mais ne peut PAS générer d\'images (forfait Plus ou Pro requis).', 'A browser page opens: the user signs in himself. A free account signs in but can NOT generate images (Plus or Pro plan required).') },
        async lancer() {
          const r = await executer(commandeCodex[0], commandeCodex.slice(1), { env: envCodex(cfg), delai: o.attente || 300 });
          if (r.simule) return termine(t('Commande de connexion enregistrée (simulation).', 'Login command recorded (simulation).'));
          const apres = statutCodex(cfg, exe);
          const url = /https?:\/\/\S+/.exec(r.sortie)?.[0] || '';
          return apres.connecte ? termine(t(`Connecté (${apres.texte}). Rappel : il faut un forfait ChatGPT payant pour générer des images.`, `Signed in (${apres.texte}). Reminder: a paid ChatGPT plan is needed to generate images.`))
            : echec('connexion-incomplete', `La connexion n'est pas terminée${r.coupe ? ' (délai écoulé)' : ''}.${url ? ` Si le navigateur ne s'est pas ouvert, ouvre : ${url}` : ''}`, `Sign-in is not finished${r.coupe ? ' (time over)' : ''}.${url ? ` If the browser did not open, open: ${url}` : ''}`);
        },
      };
    }
    default: return { refus: echec('args', `étape inconnue : ${etape}`, `unknown step: ${etape}`) };
  }
}

export async function cmdInstaller(o) {
  const cfg = lireConfig();
  if (!o.etape) return { sortie: { ok: false, code: 'args', message: t(`Indique l'étape : --etape ${[...ETAPES.gratuit, ...ETAPES.codex].join(' | ')}`, `Give the step: --etape ${[...ETAPES.gratuit, ...ETAPES.codex].join(' | ')}`) }, code: 2 };
  if (![...ETAPES.gratuit, ...ETAPES.codex].includes(o.etape)) return { sortie: echec('args', `Étape inconnue : ${o.etape}`, `Unknown step: ${o.etape}`), code: 2 };
  if (o.dossier && !cheminLocal(o.dossier)) return { sortie: echec('args', `--dossier doit être un chemin absolu local : ${o.dossier}`, `--dossier must be a local absolute path: ${o.dossier}`), code: 2 };
  if (o.methode && !['winget', 'uv'].includes(o.methode)) return { sortie: echec('args', '--methode : winget ou uv', '--methode: winget or uv'), code: 2 };
  if (ETAPES.gratuit.includes(o.etape) && !['git', 'python'].includes(o.etape) && plateforme() !== 'win32') return { sortie: echec('plateforme', 'L\'installation guidée ne gère que Windows pour le moment.', 'The guided install only handles Windows for now.'), code: 1 };
  const p = preparer(o.etape, o, cfg);
  if (p.refus) return { sortie: { ...p.refus, etape: o.etape }, code: 1 };
  if (p.fait) return { sortie: { ok: true, etape: o.etape, deja: true, execute: false, message: p.fait }, code: 0 };
  if (!o.oui) {
    return { sortie: { ok: true, etape: o.etape, execute: false, plan: p.plan, message: t('Rien n\'a été fait. Montre ce plan à l\'utilisateur ; s\'il dit oui, relance la même commande avec --oui.', 'Nothing was done. Show this plan to the user; if he says yes, run the same command with --oui.') }, code: 0 };
  }
  const r = await p.lancer();
  return { sortie: { ...r, etape: o.etape, execute: true, ...(simulation() ? { simule: true } : {}) }, code: r.ok ? 0 : 1 };
}
