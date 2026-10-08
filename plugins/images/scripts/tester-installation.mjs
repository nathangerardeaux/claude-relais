// Tests for the guided install (verifier / installer) of the images plugin. FAKES ONLY: the probes are
// replaced through IMAGES_SONDE, every external command (winget, git clone, venv, npm, login, first launch) is
// logged through IMAGES_SIMULATION instead of run, and the model download talks to a local fake HTTP server
// (with Range support). Nothing is installed, downloaded or launched for real. Usage: node tester-installation.mjs
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ici, 'images.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'images-install-test-'));
const CFG = path.join(TMP, 'cfg');
const SIM = path.join(TMP, 'commandes.jsonl');
const SONDE = path.join(TMP, 'sonde.json');

let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${!cond && detail ? ' : ' + String(detail).slice(0, 400) : ''}`); };

// A healthy Windows PC with an 8 GB NVIDIA card; each case overrides what it needs.
const BON_PC = {
  plateforme: 'win32',
  gpu: { nvidia: true, nom: 'NVIDIA GeForce RTX 4060 Laptop GPU', vramMo: 8188, autres: [] },
  git: '2.45.0',
  pythons: [{ chemin: 'C:\\Python310\\python.exe', version: '3.10.11' }],
  winget: true,
  uv: false,
  node: { version: 'v24.0.0', exe: 'C:\\node\\node.exe', npmCli: 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js' },
  libreMo: 90000,
  disques: [{ racine: 'C:\\', libreMo: 2000 }, { racine: 'D:\\', libreMo: 90000 }],
};

const lancer = (args, { sonde = {}, sim = true, env = {}, retirer = [] } = {}) => new Promise((resolve) => {
  const s = { ...BON_PC, ...sonde };
  for (const k of retirer) delete s[k];
  fs.writeFileSync(SONDE, JSON.stringify(s));
  const e = { ...process.env, IMAGES_DOSSIER: CFG, IMAGES_LANG: 'fr', IMAGES_SONDE: SONDE, ...env };
  if (sim) e.IMAGES_SIMULATION = SIM; else delete e.IMAGES_SIMULATION;
  delete e.CODEX_HOME;
  const p = spawn(process.execPath, [SCRIPT, ...args], { env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => { let json = null; try { json = JSON.parse(out); } catch { json = out.trim() ? 'TEXT' : null; } resolve({ code, json, out, err }); });
});
const appels = () => (fs.existsSync(SIM) ? fs.readFileSync(SIM, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const viderSim = () => fs.rmSync(SIM, { force: true });
const ecrireConfig = (c) => { fs.mkdirSync(CFG, { recursive: true }); fs.writeFileSync(path.join(CFG, 'config.json'), JSON.stringify(c)); };
const lireConfig = () => JSON.parse(fs.readFileSync(path.join(CFG, 'config.json'), 'utf8'));
const elem = (r, id) => r.json?.elements?.find((x) => x.id === id);

// A fake WebUI folder: launch.py, optional venv (version given), optional model.
const fabriquerWebui = (d, { venv = '', modele = false, journalFin = false } = {}) => {
  fs.mkdirSync(path.join(d, 'models', 'Stable-diffusion'), { recursive: true });
  fs.writeFileSync(path.join(d, 'launch.py'), '');
  if (venv) {
    fs.mkdirSync(path.join(d, 'venv', 'Scripts'), { recursive: true });
    fs.writeFileSync(path.join(d, 'venv', 'Scripts', 'python.exe'), '');
    fs.writeFileSync(path.join(d, 'venv', 'pyvenv.cfg'), `home = C:\\Python\nversion = ${venv}\n`);
  }
  if (modele) fs.writeFileSync(path.join(d, 'models', 'Stable-diffusion', 'm.safetensors'), 'x');
  if (journalFin) { fs.mkdirSync(path.join(d, 'tmp'), { recursive: true }); fs.writeFileSync(path.join(d, 'tmp', 'images-installation.log'), 'Installing...\nExiting because of --exit argument\n'); }
};

// ================================================================ verifier: gratuit
let r = await lancer(['verifier']);
verif('verifier: no engine given and none saved = exit 2', r.code === 2 && r.json?.ok === false, r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', 'relatif\\sd']);
verif('verifier: relative folder refused', r.code === 2, r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', '\\\\serveur\\partage\\sd']);
verif('verifier: network folder refused', r.code === 2, r.out);

const SD1 = path.join(TMP, 'sd-neuf');
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1]);
verif('verifier: healthy PC, nothing installed: OK for system, GPU, disk, git, python; next step = webui', r.code === 0 && r.json.ok === true
  && ['plateforme', 'gpu', 'disque', 'git', 'python'].every((id) => elem(r, id)?.etat === 'ok') && elem(r, 'webui')?.etat === 'manque' && r.json.prochaineEtape === 'webui' && r.json.pret === false && r.json.bloquants.length === 0, r.out);
verif('verifier: GPU line shows name and VRAM, JSON also carries a readable text', /RTX 4060/.test(elem(r, 'gpu').detail) && /8\.\d/.test(elem(r, 'gpu').detail) && /^Prérequis/.test(r.json.texte) && /\[MANQUE\] WebUI/.test(r.json.texte) && /Prochaine étape : installer --etape webui/.test(r.json.texte), r.json.texte);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1, '--texte']);
verif('verifier --texte prints only the readable text', r.code === 0 && r.json === 'TEXT' && /^Prérequis/.test(r.out) && /\[OK\] Carte graphique/.test(r.out), r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { env: { IMAGES_LANG: 'en' } });
verif('verifier: English text', /^Prerequisites of the free/.test(r.json.texte) && /\[MISSING\] WebUI/.test(r.json.texte) && /Next step: installer --etape webui/.test(r.json.texte), r.json?.texte);

r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { git: null } });
verif('verifier: git missing = manque, step git first, winget command given', elem(r, 'git').etat === 'manque' && elem(r, 'git').etape === 'git' && r.json.prochaineEtape === 'git' && /winget install --id Git\.Git -e/.test(elem(r, 'git').detail), r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { pythons: [] } });
verif('verifier: Python 3.10 missing = manque, step python, both commands given', elem(r, 'python').etat === 'manque' && r.json.prochaineEtape === 'python' && /Python\.Python\.3\.10/.test(elem(r, 'python').detail) && /uv python install 3\.10/.test(elem(r, 'python').detail), r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { gpu: { nvidia: false, nom: '', vramMo: null, autres: ['Intel(R) UHD Graphics', 'AMD Radeon RX 6600'] } } });
verif('verifier: no NVIDIA = blocking, says CPU unusable and AMD/Mac unsupported, no next step', elem(r, 'gpu').etat === 'bloquant' && /processeur/.test(elem(r, 'gpu').detail) && /AMD ni Mac/.test(elem(r, 'gpu').detail) && /Codex/.test(elem(r, 'gpu').detail)
  && r.json.bloquants.includes('gpu') && r.json.prochaineEtape === null && /Bloquant/.test(r.json.texte), r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { gpu: { nvidia: true, nom: 'GTX 1650', vramMo: 4096, autres: [] } } });
verif('verifier: under 6 GB of VRAM = warning only (not blocking)', elem(r, 'gpu').etat === 'avertissement' && /6 Go/.test(elem(r, 'gpu').detail) && r.json.bloquants.length === 0 && r.json.prochaineEtape === 'webui', r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { gpu: { nvidia: true, nom: 'RTX', vramMo: null, autres: [] } } });
verif('verifier: unknown VRAM = warning', elem(r, 'gpu').etat === 'avertissement' && /nvidia-smi/.test(elem(r, 'gpu').detail), r.out);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { libreMo: 5000 } });
verif('verifier: not enough free disk = blocking with the figures', elem(r, 'disque').etat === 'bloquant' && /5\.2 Go libres/.test(elem(r, 'disque').detail) && /environ 15\.\d Go/.test(elem(r, 'disque').detail) && r.json.prochaineEtape === null, elem(r, 'disque')?.detail);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { libreMo: 15500 } });
verif('verifier: about 15 GB free is enough', elem(r, 'disque').etat === 'ok', elem(r, 'disque')?.detail);
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD1], { sonde: { plateforme: 'linux' } });
verif('verifier: not Windows = blocking', elem(r, 'plateforme').etat === 'bloquant' && r.json.prochaineEtape === null, r.out);

// states of an existing WebUI folder
const SD2 = path.join(TMP, 'sd-313');
fabriquerWebui(SD2, { venv: '3.13.12' });
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD2]);
verif('verifier: venv with Python 3.13 = to redo, offers --recreer (renamed, not deleted)', elem(r, 'venv').etat === 'mauvais' && /3\.13\.12/.test(elem(r, 'venv').detail) && /--recreer/.test(elem(r, 'venv').detail) && /renommé/.test(elem(r, 'venv').detail) && r.json.prochaineEtape === 'venv', r.out);
const SD3 = path.join(TMP, 'sd-casse');
fabriquerWebui(SD3);
fs.mkdirSync(path.join(SD3, 'venv'), { recursive: true });
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD3]);
verif('verifier: empty venv folder = broken, to redo', elem(r, 'venv').etat === 'mauvais' && /cassé/.test(elem(r, 'venv').detail), r.out);
const SD4 = path.join(TMP, 'sd-310');
fabriquerWebui(SD4, { venv: '3.10.19' });
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD4]);
verif('verifier: good venv, first launch to do, model missing, next = premier-demarrage', elem(r, 'venv').etat === 'ok' && elem(r, 'installation').etat === 'manque' && elem(r, 'modele').etat === 'manque' && r.json.prochaineEtape === 'premier-demarrage', r.out);
fs.writeFileSync(path.join(SD4, 'models', 'Stable-diffusion', `sd_xl_base_1.0.safetensors.part`), Buffer.alloc(3 * 1048576));
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD4]);
verif('verifier: a .part file is reported as a partial model (resume)', elem(r, 'modele').etat === 'partiel' && /3 Mo/.test(elem(r, 'modele').detail), elem(r, 'modele')?.detail);
const SD5 = path.join(TMP, 'sd-pret');
fabriquerWebui(SD5, { venv: '3.10.19', modele: true, journalFin: true });
r = await lancer(['verifier', '--moteur', 'gratuit', '--dossier', SD5]);
verif('verifier: everything there = pret, no next step', r.json.pret === true && r.json.prochaineEtape === null && r.json.elements.every((e) => ['ok', 'avertissement', 'info'].includes(e.etat)) && /Tout est prêt/.test(r.json.texte), r.out);

// ================================================================ verifier: codex
const CODEX_FAUX = path.join(TMP, 'faux-codex.mjs');
fs.writeFileSync(CODEX_FAUX, `
const a = process.argv.slice(2);
if (a[0] === 'login' && a[1] === 'status') { if (process.env.FAKE_CODEX_MODE === 'connecte') { console.log('Logged in using ChatGPT'); process.exit(0); } console.error('Not logged in'); process.exit(1); }
process.exit(0);
`);
const ABSENT = path.join(TMP, 'pas-de-codex.exe');
ecrireConfig({ moteur: 'codex', codexExe: ABSENT });
r = await lancer(['verifier']);
verif('verifier codex: paid-plan warning is always shown, up front', elem(r, 'forfait')?.etat === 'avertissement' && /PAYANT/.test(elem(r, 'forfait').detail) && /^\[ATTENTION\]/m.test(r.json.texte.split('\n')[1]), r.out);
verif('verifier codex: Codex missing, node present: next step codex, proposed folder on the free non-system drive', elem(r, 'node').etat === 'ok' && elem(r, 'codex').etat === 'manque' && r.json.prochaineEtape === 'codex' && r.json.dossier === path.join('D:\\', 'outils', 'codex') && /450 Mo/.test(elem(r, 'codex').detail), r.out);
r = await lancer(['verifier'], { sonde: { node: { version: 'v16.0.0', exe: 'C:\\n.exe', npmCli: '' } } });
verif('verifier codex: Node.js missing = step node first, winget command given', elem(r, 'node').etat === 'manque' && r.json.prochaineEtape === 'node' && /winget install OpenJS\.NodeJS\.LTS/.test(elem(r, 'node').detail), r.out);
r = await lancer(['verifier'], { sonde: { disques: [{ racine: 'C:\\', libreMo: 2000 }] } });
verif('verifier codex: no other fixed drive = folder in the user profile', r.json.dossier === path.join(os.homedir(), 'codex'), r.json?.dossier);
ecrireConfig({ moteur: 'codex', codexExe: CODEX_FAUX });
r = await lancer(['verifier']);
verif('verifier codex: found but not signed in = connexion step', elem(r, 'codex').etat === 'ok' && elem(r, 'connexion').etat === 'manque' && r.json.prochaineEtape === 'connexion', r.out);
r = await lancer(['verifier'], { env: { FAKE_CODEX_MODE: 'connecte' } });
verif('verifier codex: signed in = ready (warning stays)', r.json.pret === true && elem(r, 'connexion').etat === 'ok' && elem(r, 'forfait').etat === 'avertissement', r.out);

// ================================================================ installer: arguments and "no --oui = nothing runs"
ecrireConfig({ moteur: 'gratuit', codexExe: ABSENT });
r = await lancer(['installer']);
verif('installer: no step = exit 2 listing the steps', r.code === 2 && /premier-demarrage/.test(r.json.message), r.out);
r = await lancer(['installer', '--etape', 'formater-le-disque', '--oui']);
verif('installer: unknown step refused', r.code === 2 && r.json?.ok === false, r.out);
r = await lancer(['installer', '--etape', 'git', '--oui=1']);
verif('installer: --oui takes no value', r.code === 2, r.out);
r = await lancer(['installer', '--etape', 'webui', '--dossier', 'relatif']);
verif('installer: relative --dossier refused', r.code === 2, r.out);
r = await lancer(['installer', '--etape', 'python', '--methode', 'pip']);
verif('installer: unknown --methode refused', r.code === 2, r.out);
r = await lancer(['installer', '--etape', 'git', '--moteur', 'gratuit']);
verif('installer: unknown flag refused', r.code === 2, r.out);

const SDV = path.join(TMP, 'sd-etapes');   // does not exist yet
const SDOCC = path.join(TMP, 'sd-occupe'); fs.mkdirSync(SDOCC, { recursive: true }); fs.writeFileSync(path.join(SDOCC, 'fichier.txt'), 'x');
const SDVENV = path.join(TMP, 'sd-venv-ok'); fabriquerWebui(SDVENV, { venv: '3.10.19' });
const SDSANSVENV = path.join(TMP, 'sd-sans-venv'); fabriquerWebui(SDSANSVENV);
const NODEPLAN = path.join(TMP, 'codex-neuf');
const sansOui = [
  ['git', ['--etape', 'git'], { sonde: { git: null } }],
  ['python', ['--etape', 'python'], { sonde: { pythons: [] } }],
  ['webui', ['--etape', 'webui', '--dossier', SDV], {}],
  ['venv', ['--etape', 'venv', '--dossier', SDSANSVENV], {}],
  ['premier-demarrage', ['--etape', 'premier-demarrage', '--dossier', SDVENV], {}],
  ['node', ['--etape', 'node'], { sonde: { node: { version: 'v16', exe: 'x', npmCli: '' } } }],
  ['codex', ['--etape', 'codex', '--dossier', NODEPLAN], {}],
  ['connexion', ['--etape', 'connexion'], { env: { FAKE_CODEX_MODE: 'pas-connecte' } }],
];
ecrireConfig({ moteur: 'gratuit', codexExe: CODEX_FAUX });
for (const [nom, args, opts] of sansOui) {
  viderSim();
  r = await lancer(['installer', ...args], opts);
  verif(`installer ${nom}: without --oui only the plan is shown, nothing is run`, r.code === 0 && r.json?.ok === true && r.json.execute === false && r.json.plan?.commande?.length > 0 && r.json.plan.taille && r.json.plan.destination && appels().length === 0 && /--oui/.test(r.json.message), r.out);
}
// with --oui the very same commands run (here: are logged)
const aucun = async (nom, args, opts, attendu) => {
  viderSim();
  const x = await lancer(['installer', ...args], opts);
  verif(nom, x.code === 1 && appels().length === 0 && x.json?.code === attendu, x.out);
  return x;
};

// ================================================================ installer: each step with --oui (commands logged, not run)
viderSim();
r = await lancer(['installer', '--etape', 'git', '--oui'], { sonde: { git: null } });
verif('git --oui: winget install --id Git.Git -e with the accept flags', r.code === 0 && r.json.execute === true && r.json.simule === true
  && JSON.stringify(appels()[0]?.args) === JSON.stringify(['install', '--id', 'Git.Git', '-e', '--accept-package-agreements', '--accept-source-agreements']) && appels()[0].cmd === 'winget', r.out + JSON.stringify(appels()));
r = await lancer(['installer', '--etape', 'git', '--oui']);
verif('git: already installed = nothing to do, nothing run', r.json?.deja === true && appels().length === 1);
await aucun('git: no winget = clear refusal with the manual link', ['--etape', 'git', '--oui'], { sonde: { git: null, winget: false } }, 'winget-absent');

viderSim();
r = await lancer(['installer', '--etape', 'python', '--oui', '--dossier', path.join(TMP, 'py')], { sonde: { pythons: [] } });
verif('python --oui (winget): Python.Python.3.10 with --location', appels()[0]?.cmd === 'winget' && appels()[0].args.includes('Python.Python.3.10') && appels()[0].args.join(' ').includes(`--location ${path.join(TMP, 'py')}`), JSON.stringify(appels()));
viderSim();
r = await lancer(['installer', '--etape', 'python', '--oui', '--dossier', path.join(TMP, 'py')], { sonde: { pythons: [], winget: false, uv: true } });
verif('python --oui (no winget, uv present): uv python install 3.10 into UV_PYTHON_INSTALL_DIR', appels()[0]?.cmd === 'uv' && appels()[0].args.join(' ') === 'python install 3.10' && appels()[0].env.UV_PYTHON_INSTALL_DIR === path.join(TMP, 'py'), JSON.stringify(appels()));
viderSim();
r = await lancer(['installer', '--etape', 'python', '--oui', '--methode', 'uv'], { sonde: { pythons: [], winget: true, uv: true } });
verif('python: --methode uv chosen explicitly', appels()[0]?.cmd === 'uv');
await aucun('python: neither winget nor uv = refusal pointing to python.org', ['--etape', 'python', '--oui'], { sonde: { pythons: [], winget: false, uv: false } }, 'winget-absent');

viderSim();
const SDCLONE = path.join(TMP, 'dossier-parent', 'sd-clone');
r = await lancer(['installer', '--etape', 'webui', '--oui', '--dossier', SDCLONE]);
verif('webui --oui: git clone <AUTOMATIC1111 repo> <chosen folder> (logged)', r.code === 0 && appels()[0]?.cmd === 'git' && JSON.stringify(appels()[0].args) === JSON.stringify(['clone', 'https://github.com/AUTOMATIC1111/stable-diffusion-webui', SDCLONE]), r.out + JSON.stringify(appels()));
verif('webui --oui in simulation does not claim the folder in the config', !fs.existsSync(path.join(CFG, 'config.json')) || !lireConfig().sdDossier);
await aucun('webui: Git missing = prerequisite refusal', ['--etape', 'webui', '--oui', '--dossier', SDCLONE], { sonde: { git: null } }, 'prerequis');
await aucun('webui: no NVIDIA = nothing downloaded (blocking)', ['--etape', 'webui', '--oui', '--dossier', SDCLONE], { sonde: { gpu: { nvidia: false, nom: '', vramMo: null, autres: [] } } }, 'bloquant');
await aucun('webui: non-empty folder refused', ['--etape', 'webui', '--oui', '--dossier', SDOCC], {}, 'dossier-occupe');
await aucun('webui: disk too small refused', ['--etape', 'webui', '--oui', '--dossier', SDCLONE], { sonde: { libreMo: 900 } }, 'bloquant');
r = await lancer(['installer', '--etape', 'webui', '--oui', '--dossier', SDVENV]);
verif('webui: already there = nothing run, folder saved in the config', r.json?.deja === true && appels().length === 0 && lireConfig().sdDossier === SDVENV, r.out);
ecrireConfig({ moteur: 'gratuit', codexExe: CODEX_FAUX });

// venv
viderSim();
r = await lancer(['installer', '--etape', 'venv', '--oui', '--dossier', SDSANSVENV]);
verif('venv --oui: <python 3.10> -m venv <folder>\\venv, run from the WebUI folder', r.code === 0 && appels()[0]?.cmd === 'C:\\Python310\\python.exe' && JSON.stringify(appels()[0].args) === JSON.stringify(['-m', 'venv', path.join(SDSANSVENV, 'venv')]) && appels()[0].cwd === SDSANSVENV, r.out + JSON.stringify(appels()));
await aucun('venv: no Python 3.10 = prerequisite refusal', ['--etape', 'venv', '--oui', '--dossier', SDSANSVENV], { sonde: { pythons: [] } }, 'prerequis');
await aucun('venv: WebUI folder missing = prerequisite refusal', ['--etape', 'venv', '--oui', '--dossier', path.join(TMP, 'rien-ici')], {}, 'prerequis');
r = await lancer(['installer', '--etape', 'venv', '--oui', '--dossier', SD2]);
verif('venv: existing Python 3.13 venv is NOT touched without --recreer', r.code === 1 && r.json.code === 'venv-existant' && /--recreer/.test(r.json.message) && fs.existsSync(path.join(SD2, 'venv', 'pyvenv.cfg')) && /3\.13/.test(fs.readFileSync(path.join(SD2, 'venv', 'pyvenv.cfg'), 'utf8')), r.out);
viderSim();
r = await lancer(['installer', '--etape', 'venv', '--dossier', SD2, '--recreer']);
verif('venv --recreer without --oui: plan only, old venv still in place', r.json.execute === false && /renommé en venv\.ancien-/.test(r.json.plan.destination) && fs.existsSync(path.join(SD2, 'venv', 'pyvenv.cfg')) && appels().length === 0, r.out);
r = await lancer(['installer', '--etape', 'venv', '--dossier', SD2, '--recreer', '--oui']);
const renomme = fs.readdirSync(SD2).find((n) => /^venv\.ancien-\d{14}$/.test(n));
verif('venv --recreer --oui: old venv RENAMED (not deleted), new venv command logged', r.code === 0 && !!renomme && fs.existsSync(path.join(SD2, renomme, 'pyvenv.cfg')) && !fs.existsSync(path.join(SD2, 'venv')) && appels()[0]?.args.join(' ') === `-m venv ${path.join(SD2, 'venv')}`, r.out + JSON.stringify(appels()));
r = await lancer(['installer', '--etape', 'venv', '--oui', '--dossier', SDVENV]);
verif('venv: a good 3.10 venv is left alone', r.json?.deja === true);

// first launch
viderSim();
r = await lancer(['installer', '--etape', 'premier-demarrage', '--oui', '--dossier', SDVENV]);
const a0 = appels()[0] || {};
verif('premier-demarrage --oui: venv python launch.py --exit, in the WebUI folder', r.code === 0 && a0.cmd === path.join(SDVENV, 'venv', 'Scripts', 'python.exe') && JSON.stringify(a0.args) === JSON.stringify(['launch.py', '--exit']) && a0.cwd === SDVENV, r.out + JSON.stringify(appels()));
verif('premier-demarrage: pip and HuggingFace caches point into the WebUI folder', a0.env?.PIP_CACHE_DIR === path.join(SDVENV, 'tmp', 'pip-cache') && a0.env?.HF_HOME === path.join(SDVENV, 'tmp', 'huggingface'), JSON.stringify(a0.env));
verif('premier-demarrage: deleted Stability-AI repository replaced by the mirror (STABLE_DIFFUSION_REPO)', a0.env?.STABLE_DIFFUSION_REPO === 'https://github.com/w-e-w/stablediffusion.git', JSON.stringify(a0.env));
// git "dubious ownership" (exFAT / FAT32 / network drives): safe.directory through the process environment only
const dirGit = SDVENV.replaceAll(path.sep, '/');
viderSim();
await lancer(['installer', '--etape', 'premier-demarrage', '--oui', '--dossier', SD4], { sonde: { git: '2.45.0' } });
let g = appels()[0]?.env || {};
const valeursGit = (env) => Object.keys(env).filter((k) => /^GIT_CONFIG_KEY_\d+$/.test(k) && env[k] === 'safe.directory').map((k) => env[k.replace('KEY', 'VALUE')]);
const dirGit4 = SD4.replaceAll(path.sep, '/');
verif('git safe.directory, git < 2.46: exact WebUI folders, never "*"', g.GIT_CONFIG_COUNT === '6' && g.GIT_CONFIG_VALUE_0 === dirGit4 && valeursGit(g).includes(`${dirGit4}/repositories/stable-diffusion-stability-ai`) && !valeursGit(g).includes('*'), JSON.stringify(g));
viderSim();
await lancer(['installer', '--etape', 'premier-demarrage', '--oui', '--dossier', SDVENV], { sonde: { git: '2.47.1.windows.1' } });
g = appels()[0]?.env || {};
verif('git safe.directory, git >= 2.46: <folder> and <folder>/* with forward slashes', g.GIT_CONFIG_COUNT === '2' && g.GIT_CONFIG_VALUE_0 === dirGit && g.GIT_CONFIG_VALUE_1 === `${dirGit}/*` && g.GIT_CONFIG_KEY_1 === 'safe.directory', JSON.stringify(g));
viderSim();
await lancer(['installer', '--etape', 'premier-demarrage', '--oui', '--dossier', SDVENV], { sonde: { git: '2.45.0' }, env: { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_VALUE_0: '1', GIT_CONFIG_KEY_1: 'c.d', GIT_CONFIG_VALUE_1: '2' } });
g = appels()[0]?.env || {};
verif('git safe.directory: an existing GIT_CONFIG_COUNT is kept and appended to', Number(g.GIT_CONFIG_COUNT) >= 8 && g.GIT_CONFIG_KEY_0 === 'a.b' && g.GIT_CONFIG_VALUE_1 === '2' && g.GIT_CONFIG_KEY_2 === 'safe.directory' && g.GIT_CONFIG_VALUE_2 === dirGit && !valeursGit(g).includes('*'), JSON.stringify(g));
viderSim();
await lancer(['installer', '--etape', 'webui', '--oui', '--dossier', path.join(TMP, 'clone-git')], { sonde: { git: '2.47.1' } });
g = appels()[0]?.env || {};
verif('git safe.directory: the git clone step gets it too, and never runs "git config"', g.GIT_CONFIG_COUNT === '2' && g.GIT_CONFIG_VALUE_1 === `${path.join(TMP, 'clone-git').replaceAll(path.sep, '/')}/*` && appels().every((c) => !c.args.includes('config')), JSON.stringify(appels()));
r = await lancer(['installer', '--etape', 'premier-demarrage', '--dossier', SDVENV]);
verif('premier-demarrage plan names the log file and the duration', /images-installation\.log$/.test(r.json.plan.journal) && /10 à 30 minutes/.test(r.json.plan.taille), r.out);
await aucun('premier-demarrage: needs a Python 3.10 venv first', ['--etape', 'premier-demarrage', '--oui', '--dossier', SDSANSVENV], {}, 'prerequis');
await aucun('premier-demarrage: no NVIDIA = refused before downloading torch', ['--etape', 'premier-demarrage', '--oui', '--dossier', SDVENV], { sonde: { gpu: { nvidia: false, nom: '', vramMo: null, autres: [] } } }, 'bloquant');
viderSim();
r = await lancer(['installer', '--etape', 'premier-demarrage', '--oui', '--dossier', SD5]);
verif('premier-demarrage: already done = nothing run', r.json?.deja === true && appels().length === 0, r.out);

// node, codex, login
viderSim();
r = await lancer(['installer', '--etape', 'node', '--oui'], { sonde: { node: { version: 'v16', exe: 'x', npmCli: '' } } });
verif('node --oui: winget install OpenJS.NodeJS.LTS', appels()[0]?.cmd === 'winget' && appels()[0].args.includes('OpenJS.NodeJS.LTS'), JSON.stringify(appels()));
r = await lancer(['installer', '--etape', 'node', '--oui']);
verif('node: already there = nothing run', r.json?.deja === true && appels().length === 1);

ecrireConfig({ moteur: 'codex', codexExe: ABSENT });
viderSim();
const CODEX_DIR = path.join(TMP, 'outils', 'codex');
r = await lancer(['installer', '--etape', 'codex', '--oui', '--dossier', CODEX_DIR]);
const ac = appels()[0] || {};
verif('codex --oui: node npm-cli.js install --prefix <folder> @openai/codex, npm cache inside the folder', r.code === 0 && ac.cmd === BON_PC.node.exe && JSON.stringify(ac.args) === JSON.stringify([BON_PC.node.npmCli, 'install', '--prefix', CODEX_DIR, '@openai/codex']) && ac.env?.npm_config_cache === path.join(CODEX_DIR, '.npm-cache'), r.out + JSON.stringify(appels()));
verif('codex --oui: the CODEX_HOME folder is created (<folder>\\home)', fs.existsSync(path.join(CODEX_DIR, 'home')), r.out);
await aucun('codex: Node.js missing = prerequisite refusal', ['--etape', 'codex', '--oui', '--dossier', CODEX_DIR], { sonde: { node: { version: 'v16', exe: 'x', npmCli: '' } } }, 'prerequis');
await aucun('codex: no room = blocking', ['--etape', 'codex', '--oui', '--dossier', CODEX_DIR], { sonde: { libreMo: 300 } }, 'bloquant');
ecrireConfig({ moteur: 'codex', codexExe: CODEX_FAUX });
r = await lancer(['installer', '--etape', 'codex', '--oui']);
verif('codex: already installed = nothing run', r.json?.deja === true, r.out);

viderSim();
r = await lancer(['installer', '--etape', 'connexion', '--oui'], { env: { FAKE_CODEX_MODE: 'pas-connecte' } });
verif('connexion --oui: codex login with the CODEX_HOME of the config (logged, the browser would open)', r.code === 0 && appels()[0]?.cmd === process.execPath && appels()[0].args.join(' ') === `${CODEX_FAUX} login`, r.out + JSON.stringify(appels()));
r = await lancer(['installer', '--etape', 'connexion'], { env: { FAKE_CODEX_MODE: 'pas-connecte' } });
verif('connexion plan: says up front that a free account cannot generate images', /gratuit/.test(r.json.plan.avertissement) && /Plus ou Pro/.test(r.json.plan.avertissement), r.out);
viderSim();
r = await lancer(['installer', '--etape', 'connexion', '--oui'], { env: { FAKE_CODEX_MODE: 'connecte' } });
verif('connexion: already signed in = nothing run, reminder of the paid plan', r.json?.deja === true && /payant/.test(r.json.message) && appels().length === 0, r.out);
ecrireConfig({ moteur: 'codex', codexExe: ABSENT });
await aucun('connexion: Codex not installed = prerequisite refusal', ['--etape', 'connexion', '--oui'], {}, 'prerequis');

// ================================================================ model download (fake HTTP server with Range)
const CONTENU = Buffer.alloc(300000); for (let i = 0; i < CONTENU.length; i++) CONTENU[i] = (i * 31 + (i >> 8)) & 255;
const AUTRE = Buffer.from(CONTENU); AUTRE[1000] ^= 0xff;
const HASH = crypto.createHash('sha256').update(CONTENU).digest('hex');
let mode = 'ok';
let requetes = [];
const serveur = http.createServer((req, res) => {
  requetes.push({ url: req.url, range: req.headers.range || '' });
  const corps = mode === 'mauvais' ? AUTRE : CONTENU;
  const m = /^bytes=(\d+)-$/.exec(req.headers.range || '');
  const debut = m && mode !== 'sans-range' ? Number(m[1]) : 0;
  if (debut >= corps.length && m) { res.writeHead(416, { 'Content-Range': `bytes */${corps.length}` }); return res.end(); }
  const tranche = corps.subarray(debut);
  if (m && mode !== 'sans-range') res.writeHead(206, { 'Content-Length': tranche.length, 'Content-Range': `bytes ${debut}-${corps.length - 1}/${corps.length}` });
  else res.writeHead(200, { 'Content-Length': tranche.length });
  if (mode === 'coupe') { res.write(tranche.subarray(0, Math.floor(tranche.length / 2))); setTimeout(() => res.socket.destroy(), 100); return undefined; }
  if (mode === 'fige') { res.write(tranche.subarray(0, Math.floor(tranche.length / 2))); return undefined; }
  return res.end(tranche);
});
await new Promise((resolve) => serveur.listen(0, '127.0.0.1', resolve));
const URL_MODELE = `http://127.0.0.1:${serveur.address().port}/m/mon-modele.safetensors`;
const SDM = path.join(TMP, 'sd-modele');
fabriquerWebui(SDM);
const FINAL = path.join(SDM, 'models', 'Stable-diffusion', 'mon-modele.safetensors');
const PART = `${FINAL}.part`;
const dl = (extra = [], opts = {}) => lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--sha256', HASH, '--taille', String(CONTENU.length), ...extra], { sim: false, ...opts });
ecrireConfig({ moteur: 'gratuit' });

requetes = [];
r = await dl();
verif('modele: without --oui the plan is shown and NO request is made', r.code === 0 && r.json.execute === false && r.json.plan.destination === FINAL && requetes.length === 0 && !fs.existsSync(PART), r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM], { sim: false });
verif('modele: default plan = SDXL 1.0 base, 6.9 GB, in models\\Stable-diffusion, SHA-256 check announced', r.json.plan.commande[1] === 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors'
  && /6\.9 Go/.test(r.json.plan.taille) && r.json.plan.destination === path.join(SDM, 'models', 'Stable-diffusion', 'sd_xl_base_1.0.safetensors') && /SHA-256/.test(r.json.plan.commande[2]), r.out);
requetes = [];
r = await dl(['--oui']);
verif('modele --oui: downloaded, hash verified, renamed, .part gone', r.code === 0 && r.json.ok === true && r.json.verifie === true && fs.readFileSync(FINAL).equals(CONTENU) && !fs.existsSync(PART) && requetes.length === 1 && requetes[0].range === '', r.out);
r = await dl(['--oui']);
verif('modele: already there with the right hash = no download', r.json?.deja === true && requetes.length === 1, r.out);
fs.writeFileSync(FINAL, 'autre contenu');
r = await dl(['--oui']);
verif('modele: an existing file with another hash is never overwritten', r.code === 1 && r.json.code === 'modele-different' && fs.readFileSync(FINAL, 'utf8') === 'autre contenu' && requetes.length === 1, r.out);
fs.rmSync(FINAL, { force: true });

mode = 'mauvais';
r = await dl(['--oui']);
verif('modele: hash mismatch keeps the .part, does NOT rename, reports both hashes', r.code === 1 && r.json.code === 'dl-hash' && fs.existsSync(PART) && !fs.existsSync(FINAL) && r.json.attendu === HASH && /^[0-9a-f]{64}$/.test(r.json.obtenu) && r.json.obtenu !== HASH && /--repartir/.test(r.json.message), r.out);
mode = 'ok';
r = await dl(['--oui', '--repartir']);
verif('modele: --repartir discards the bad .part and downloads again correctly', r.code === 0 && fs.readFileSync(FINAL).equals(CONTENU) && !fs.existsSync(PART), r.out);
fs.rmSync(FINAL, { force: true });

fs.writeFileSync(PART, CONTENU.subarray(0, 100000));
requetes = [];
r = await dl(['--oui']);
verif('modele: resume sends Range from the .part size and ends with the right file', r.code === 0 && requetes[0]?.range === 'bytes=100000-' && fs.readFileSync(FINAL).equals(CONTENU) && r.json.verifie === true, r.out + JSON.stringify(requetes));
fs.rmSync(FINAL, { force: true });

mode = 'coupe';
requetes = [];
r = await dl(['--oui']);
const apresCoupure = existe(PART) ? fs.statSync(PART).size : -1;
function existe(p) { return fs.existsSync(p); }
verif('modele: connection cut = partial result, .part kept with what was received', r.code === 1 && r.json.code === 'dl-partiel' && apresCoupure > 0 && apresCoupure < CONTENU.length && /relance la même commande/.test(r.json.message), r.out);
mode = 'ok';
requetes = [];
r = await dl(['--oui']);
verif('modele: rerun after the cut resumes (Range) and completes', r.code === 0 && requetes[0]?.range === `bytes=${apresCoupure}-` && fs.readFileSync(FINAL).equals(CONTENU), r.out + JSON.stringify(requetes));
fs.rmSync(FINAL, { force: true });

mode = 'sans-range';
fs.writeFileSync(PART, CONTENU.subarray(0, 100000));
r = await dl(['--oui']);
verif('modele: a server that ignores Range (HTTP 200) restarts from zero, file still correct', r.code === 0 && fs.readFileSync(FINAL).equals(CONTENU) && !fs.existsSync(PART), r.out);
fs.rmSync(FINAL, { force: true });

mode = 'fige';
r = await dl(['--oui', '--delai', '1']);
verif('modele: time budget over = partial result, .part kept', r.code === 1 && r.json.code === 'dl-partiel' && /délai écoulé/.test(r.json.message) && existe(PART), r.out);
mode = 'ok';
fs.rmSync(PART, { force: true });
requetes = [];
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--taille', '123', '--sha256', HASH, '--oui'], { sim: false });
verif('modele: announced size different from the expected one = wrong file, nothing saved', r.code === 1 && r.json.code === 'dl-taille' && !existe(PART) && !existe(FINAL), r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--sha256', HASH, '--taille', String(CONTENU.length), '--oui'], { sim: false, sonde: { libreMo: 100 } });
verif('modele: not enough disk space = refused before writing', r.code === 1 && r.json.code === 'disque-plein' && !existe(PART), r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', 'http://exemple.invalid/m.safetensors', '--oui'], { sim: false });
verif('modele: plain http to another machine refused', r.code === 1 && r.json.code === 'url', r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', 'ftp://exemple.invalid/m.safetensors', '--oui'], { sim: false });
verif('modele: non-http address refused', r.code === 1 && r.json.code === 'url', r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--nom', '..\\evil.safetensors', '--oui'], { sim: false });
verif('modele: path tricks in --nom refused', r.code === 1 && r.json.code === 'args', r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--nom', 'm.exe', '--oui'], { sim: false });
verif('modele: only .safetensors / .ckpt names accepted', r.code === 1 && r.json.code === 'args', r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--sha256', 'xyz', '--oui'], { sim: false });
verif('modele: malformed --sha256 refused', r.code === 1 && r.json.code === 'args', r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', path.join(TMP, 'rien'), '--oui'], { sim: false });
verif('modele: WebUI folder missing = prerequisite refusal', r.code === 1 && r.json.code === 'prerequis', r.out);
requetes = [];
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--oui'], { sim: true });
verif('modele: in simulation mode the real SDXL address is refused (no network)', r.code === 1 && r.json.code === 'url' && requetes.length === 0, r.out);
r = await lancer(['installer', '--etape', 'modele', '--dossier', SDM, '--url', URL_MODELE, '--oui'], { sim: false });
verif('modele: custom address without hash = downloaded, flagged as not verified', r.code === 0 && r.json.verifie === false && fs.readFileSync(FINAL).equals(CONTENU), r.out);

serveur.closeAllConnections?.();
serveur.close();

// ================================================================ style
const fichiers = [];
const lister = (d) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); x.isDirectory() ? lister(p) : fichiers.push(p); } };
lister(path.join(ici, '..'));
const tiret = fichiers.filter((f) => /[\u2013\u2014]/.test(fs.readFileSync(f, 'utf8')));
verif('style: no em dash or en dash anywhere in the plugin', tiret.length === 0, tiret.join(', '));

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folder deleted)`);
process.exit(ko ? 1 : 0);
