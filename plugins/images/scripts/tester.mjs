// Tests for the images plugin, in a TEMPORARY folder (never the real ~/.claude, never a real engine):
// a FAKE Stable Diffusion API (http server) and a FAKE codex (a node script standing in for codex.exe).
// Usage: node tester.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ici, 'images.mjs');
const RACINE = path.resolve(ici, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'images-test-'));
const CFG = path.join(TMP, 'cfg');
const SORTIES = path.join(TMP, 'sorties');
fs.mkdirSync(SORTIES, { recursive: true });
const envBase = { ...process.env, IMAGES_DOSSIER: CFG, IMAGES_LANG: 'fr' };
delete envBase.CODEX_HOME;

let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${!cond && detail ? ' : ' + detail : ''}`); };

// Runs the CLI asynchronously (the fake servers live in THIS process: the event loop must stay free).
const lancer = (args, env = {}, cwd = SORTIES) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, ...args], { env: { ...envBase, ...env }, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => {
    let json = null; try { json = JSON.parse(out); } catch { json = 'NOT-JSON'; }
    resolve({ code, json, out, err });
  });
});

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');
const estPNG = (f) => { try { return fs.readFileSync(f).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); } catch { return false; } };
const portLibre = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const ecrireConfig = (c) => { fs.mkdirSync(CFG, { recursive: true }); fs.writeFileSync(path.join(CFG, 'config.json'), JSON.stringify(c)); };
const lireConfig = () => JSON.parse(fs.readFileSync(path.join(CFG, 'config.json'), 'utf8'));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fake Stable Diffusion API
let modeSD = 'ok';
let dernierCorps = null;
const faux = http.createServer((req, res) => {
  const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/sdapi/v1/sd-models') return json([{ title: 'fake-sdxl.safetensors [abc]', model_name: 'fake-sdxl', filename: path.join(TMP, 'absent.safetensors') }]);
  if (req.url === '/sdapi/v1/options') return json({ sd_model_checkpoint: 'fake-sdxl.safetensors [abc]' });
  if (req.url === '/sdapi/v1/txt2img' && req.method === 'POST') {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      dernierCorps = JSON.parse(corps);
      if (modeSD === 'oom') return json({ error: 'OutOfMemoryError', errors: 'CUDA out of memory. Tried to allocate 2.00 GiB' }, 500);
      if (modeSD === 'pas-png') return json({ images: [Buffer.from('ceci n est pas un png du tout').toString('base64')], info: '{}' });
      json({ images: [PNG_B64], info: JSON.stringify({ seed: 4242 }) });
    });
    return undefined;
  }
  return json({ detail: 'Not Found' }, 404);
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const PORT_SD = faux.address().port;

// ---------------------------------------------------------------- fake codex (stands in for codex.exe)
const CODEX_FAUX = path.join(TMP, 'faux-codex.mjs');
const CODEX_HOME = path.join(TMP, 'codex-home');
const JOURNAL_CODEX = path.join(TMP, 'codex-appels.jsonl');
fs.writeFileSync(CODEX_FAUX, `
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2);
const mode = process.env.FAKE_CODEX_MODE || 'ok';
fs.appendFileSync(${JSON.stringify(JOURNAL_CODEX)}, JSON.stringify({ args: a, home: process.env.CODEX_HOME }) + '\\n');
const evt = (o) => console.log(JSON.stringify(o));
if (a[0] === 'login' && a[1] === 'status') {
  console.error('WARNING: failed to clean up stale arg0 temp dirs');
  if (mode === 'deconnecte') { console.error('Not logged in'); process.exit(1); }
  console.log('Logged in using ChatGPT');
  process.exit(0);
}
if (a[0] === 'exec') {
  evt({ type: 'thread.started', thread_id: 't1' });
  if (mode === 'ok') {
    const d = path.join(process.env.CODEX_HOME, 'generated_images', 'session-1');
    fs.mkdirSync(d, { recursive: true });
    setTimeout(() => {
      fs.writeFileSync(path.join(d, 'ig_nouvelle.png'), Buffer.from(${JSON.stringify(PNG_B64)}, 'base64'));
      evt({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'Done.' } });
      process.exit(0);
    }, 300);
  } else if (mode === 'forfait') {
    evt({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: "The built-in image generation tool isn't available in this session." } });
    process.exit(0);
  } else if (mode === 'rien') {
    evt({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'I can describe the picture in words instead.' } });
    process.exit(0);
  } else if (mode === 'connexion') {
    evt({ type: 'error', message: 'Not logged in. Please run codex login' });
    process.exit(1);
  } else if (mode === 'lent') {
    setTimeout(() => process.exit(0), 60000);
  }
}
`);

// ---------------------------------------------------------------- fake WebUI folder (launch.py is JS run by node)
const SD_DOSSIER = path.join(TMP, 'sd');
const JOURNAL_SD = path.join(TMP, 'sd-demarrage-args.txt');
const fabriquerSD = (dossier, { modele = true, launch = true } = {}) => {
  fs.mkdirSync(path.join(dossier, 'models', 'Stable-diffusion', 'sous-dossier'), { recursive: true });
  if (modele) fs.writeFileSync(path.join(dossier, 'models', 'Stable-diffusion', 'sous-dossier', 'fake.safetensors'), 'x');
  if (launch) fs.writeFileSync(path.join(dossier, 'launch.py'), `
const http = require('http'); const fs = require('fs');
const args = process.env.COMMANDLINE_ARGS || '';
fs.writeFileSync(${JSON.stringify(JOURNAL_SD)}, JSON.stringify({ args, cwd: process.cwd(), hf: process.env.HF_HOME, pip: process.env.PIP_CACHE_DIR, git: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GIT_CONFIG_'))) }));
const port = Number((/--port (\\d+)/.exec(args) || [])[1] || 7861);
setTimeout(() => {
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(req.url === '/sdapi/v1/sd-models' ? JSON.stringify([{ title: 'auto.safetensors [1]', model_name: 'auto', filename: 'x' }])
      : req.url === '/sdapi/v1/options' ? JSON.stringify({ sd_model_checkpoint: 'auto.safetensors [1]' })
      : JSON.stringify({ images: [${JSON.stringify(PNG_B64)}], info: '{"seed":7}' }));
  }).listen(port, '127.0.0.1');
}, 1500);
setTimeout(() => process.exit(0), 90000);
`);
};

// ================================================================ arguments and configuration
let r = await lancer(['configurer']);
verif('configurer: no engine given and none saved = exit 2', r.code === 2 && r.json?.ok === false, r.out);
r = await lancer(['configurer', '--moteur', 'midjourney']);
verif('configurer: unknown engine refused', r.code === 2 && r.json?.ok === false, r.out);
r = await lancer(['configurer', '--moteur', 'codex', '--bidule', '1']);
verif('configurer: unknown flag refused', r.code === 2, r.out);
r = await lancer(['configurer', '--moteur']);
verif('configurer: missing value refused', r.code === 2, r.out);
r = await lancer(['configurer', '--moteur', 'gratuit', '--sd-port', '99999']);
verif('configurer: port out of range refused', r.code === 2, r.out);
r = await lancer(['configurer', '--moteur', 'gratuit', '--sd-dossier', path.join(TMP, 'nexiste-pas')]);
verif('configurer: missing WebUI folder refused with a message', r.code === 1 && r.json?.code === 'sd-introuvable' && !fs.existsSync(path.join(CFG, 'config.json')), r.out);
r = await lancer(['configurer', '--moteur', 'codex', '--codex-exe', path.join(TMP, 'nexiste-pas.exe')]);
verif('configurer: missing codex path refused', r.code === 1 && r.json?.code === 'codex-introuvable', r.out);

fabriquerSD(SD_DOSSIER);
fs.mkdirSync(path.join(SD_DOSSIER, 'venv', 'Scripts'), { recursive: true });
r = await lancer(['configurer', '--moteur', 'gratuit', '--sd-dossier', SD_DOSSIER, '--sd-port', String(PORT_SD), '--sd-args', '--medvram']);
verif('configurer: gratuit written and read back', r.code === 0 && r.json?.ok === true && lireConfig().moteur === 'gratuit'
  && lireConfig().sdDossier === SD_DOSSIER && lireConfig().sdPort === PORT_SD && lireConfig().sdArgs === '--medvram', r.out);
r = await lancer(['configurer', '--moteur', 'codex', '--codex-exe', CODEX_FAUX, '--codex-home', CODEX_HOME]);
verif('configurer: switching engine keeps the other engine\'s settings', r.code === 0 && lireConfig().moteur === 'codex'
  && lireConfig().sdDossier === SD_DOSSIER && lireConfig().codexExe === CODEX_FAUX && lireConfig().codexHome === CODEX_HOME, r.out);
r = await lancer(['configurer', '--moteur', 'gratuit']);
verif('configurer: moteur alone keeps paths', r.code === 0 && lireConfig().codexHome === CODEX_HOME && lireConfig().sdDossier === SD_DOSSIER);

// ================================================================ etat
fs.mkdirSync(CODEX_HOME, { recursive: true });
fs.writeFileSync(path.join(CODEX_HOME, 'auth.json'), '{"tokens":{"access_token":"SECRET-TOKEN-123"}}');
r = await lancer(['etat']);
const e = r.json;
verif('etat: engine, SD API up, models, checkpoint files', r.code === 0 && e.moteur === 'gratuit' && e.configure === true && e.sd.api.actif === true
  && e.sd.api.modeles[0] === 'fake-sdxl.safetensors [abc]' && e.sd.checkpointsFichiers.length === 1 && e.sd.trouve === true, r.out.slice(0, 300));
verif('etat: Codex found through the fake exe and logged in (login status)', e.codex.trouve === true && e.codex.connecte === true && e.codex.statut === 'Logged in using ChatGPT', JSON.stringify(e.codex));
verif('etat: Codex home reported, no secret printed', e.codex.home === CODEX_HOME && !r.out.includes('SECRET-TOKEN-123'));
const appelsCodex = () => fs.readFileSync(JOURNAL_CODEX, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
verif('etat: login status called with CODEX_HOME', appelsCodex().some((c) => c.args.join(' ') === 'login status' && c.home === CODEX_HOME));
r = await lancer(['etat'], { FAKE_CODEX_MODE: 'deconnecte' });
verif('etat: Codex signed out is seen (login status), not a problem while the free engine is chosen', r.json.codex.connecte === false && !r.json.problemes.some((p) => /codex login/.test(p)), JSON.stringify(r.json.problemes));
ecrireConfig({ ...lireConfig(), moteur: 'codex' });
r = await lancer(['etat'], { FAKE_CODEX_MODE: 'deconnecte' });
verif('etat: engine codex + signed out lists the login problem', r.json.problemes.some((p) => /codex login/.test(p)), JSON.stringify(r.json.problemes));
ecrireConfig({ ...lireConfig(), moteur: 'gratuit' });
const rEn = await lancer(['etat'], { IMAGES_LANG: 'en' });
verif('etat: English works', rEn.json.ok === true);

// ================================================================ generation through Stable Diffusion
const f1 = path.join(SORTIES, 'sous', 'rouge.png');
r = await lancer(['generer', '--prompt', 'a red fox, watercolor', '--negatif', 'blurry, text', '--sortie', f1]);
verif('sd: generates a valid PNG at the given path (parent folder created)', r.code === 0 && r.json?.ok === true && r.json.fichier === f1 && r.json.moteur === 'gratuit' && estPNG(f1) && typeof r.json.secondes === 'number', r.out);
verif('sd: prompt, negative prompt forwarded; SDXL model detected = 1024x1024', dernierCorps?.prompt === 'a red fox, watercolor' && dernierCorps.negative_prompt === 'blurry, text'
  && dernierCorps.width === 1024 && dernierCorps.height === 1024 && dernierCorps.batch_size === 1 && r.json.details?.sdxl === true && r.json.details.graine === 4242, JSON.stringify(dernierCorps));
const avant = fs.readFileSync(f1);
r = await lancer(['generer', '--prompt', 'autre chose', '--sortie', f1]);
verif('sd: refuses to overwrite an existing file (and leaves it intact)', r.code === 1 && r.json?.code === 'existe' && /rouge-2\.png/.test(r.json.message) && fs.readFileSync(f1).equals(avant), r.out);
r = await lancer(['generer', '--prompt', 'autre chose', '--sortie', f1], { IMAGES_LANG: 'en' });
verif('sd: refusal explained in English', /never overwrite/.test(r.json?.message || ''), r.out);
r = await lancer(['generer', '--prompt', 'taille', '--largeur', '700', '--hauteur', '1210', '--pas', '12', '--cfg', '4.5', '--graine', '99', '--sortie', 'taille.png']);
verif('sd: sizes rounded to a multiple of 8, steps, cfg and seed forwarded; relative output resolved from cwd',
  r.code === 0 && estPNG(path.join(SORTIES, 'taille.png')) && dernierCorps.width === 704 && dernierCorps.height === 1208 && dernierCorps.steps === 12 && dernierCorps.cfg_scale === 4.5 && dernierCorps.seed === 99, JSON.stringify(dernierCorps));
r = await lancer(['generer', '--prompt', 'sans nom']);
verif('sd: default output name image-<date>.png in the current folder', r.code === 0 && /image-\d{8}-\d{6}\.png$/.test(r.json?.fichier || '') && estPNG(r.json.fichier), r.out);
r = await lancer(['generer', '--prompt', 'sans negatif', '--sortie', 'neg.png']);
verif('sd: a default negative prompt is sent when none is given', /lowres/.test(dernierCorps.negative_prompt), dernierCorps.negative_prompt);
modeSD = 'oom';
r = await lancer(['generer', '--prompt', 'trop gros', '--sortie', 'oom.png']);
verif('sd: out-of-memory answer explained, no file', r.code === 1 && r.json?.code === 'sd-memoire' && !fs.existsSync(path.join(SORTIES, 'oom.png')), r.out);
modeSD = 'pas-png';
r = await lancer(['generer', '--prompt', 'cassé', '--sortie', 'cassé.png']);
verif('sd: non-PNG answer refused, no file written', r.code === 1 && r.json?.code === 'sd-image' && !fs.existsSync(path.join(SORTIES, 'cassé.png')), r.out);
modeSD = 'ok';
r = await lancer(['generer', '--prompt', 'engine en override', '--moteur', 'gratuit', '--sortie', 'ov.png']);
verif('sd: --moteur overrides the saved engine', r.code === 0 && r.json?.moteur === 'gratuit');

// ================================================================ SD not running, auto start impossible
const portMort = await portLibre();
const SANS = path.join(TMP, 'sd-vide');
ecrireConfig({ moteur: 'gratuit', sdPort: portMort, sdDossier: path.join(TMP, 'pas-de-webui') });
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'a1.png']);
verif('sd down + WebUI folder missing: clear message, no file', r.code === 1 && r.json?.code === 'sd-introuvable' && /introuvable/.test(r.json.message) && !fs.existsSync(path.join(SORTIES, 'a1.png')), r.out);
fabriquerSD(SANS, { modele: false });
ecrireConfig({ moteur: 'gratuit', sdPort: portMort, sdDossier: SANS, sdPython: process.execPath });
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'a2.png']);
verif('sd down + no checkpoint installed: says so and starts nothing', r.code === 1 && r.json?.code === 'sd-sans-modele' && /checkpoint/i.test(r.json.message) && !fs.existsSync(path.join(CFG, 'sd-demarrage.json')), r.out);
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'a2.png'], { IMAGES_LANG: 'en' });
verif('sd down + no checkpoint: English message', /No Stable Diffusion checkpoint/.test(r.json?.message || ''), r.out);
ecrireConfig({ moteur: 'gratuit', sdPort: portMort, sdDossier: SD_DOSSIER });
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'a3.png']);
verif('sd down + venv python missing: clear message', r.json?.code === 'sd-sans-venv', r.out);
fs.writeFileSync(path.join(SD_DOSSIER, 'venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python'), '');
fs.writeFileSync(path.join(SD_DOSSIER, 'venv', 'pyvenv.cfg'), 'home = C:\\Python\nversion = 3.13.12\n');
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'a4.png']);
verif('sd down + venv Python 3.13 without torch: refused before a doomed first start', r.json?.code === 'sd-python' && /3\.10/.test(r.json.message), r.out);
verif('etat reports the incompatible venv Python', (await lancer(['etat'])).json.sd.pythonCompatible === false);

// ================================================================ auto start (fake launch.py)
const portAuto = await portLibre();
ecrireConfig({ moteur: 'gratuit', sdPort: portAuto, sdDossier: SD_DOSSIER, sdPython: process.execPath, sdArgs: '--medvram' });
const t0 = Date.now();
const SONDE_GIT = path.join(TMP, 'sonde-git.json');
fs.writeFileSync(SONDE_GIT, JSON.stringify({ git: '2.47.1' }));
// a GIT_CONFIG_COUNT already in the environment must be kept (our entries are appended)
r = await lancer(['generer', '--prompt', 'démarrage auto', '--sortie', 'auto.png', '--attente', '60'], { IMAGES_SONDE: SONDE_GIT, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' });
const suivi = fs.existsSync(path.join(CFG, 'sd-demarrage.json')) ? JSON.parse(fs.readFileSync(path.join(CFG, 'sd-demarrage.json'), 'utf8')) : {};
verif('auto start: WebUI launched in the background, waited for, image generated', r.code === 0 && r.json?.ok === true && estPNG(path.join(SORTIES, 'auto.png')) && Date.now() - t0 > 1200, r.out);
const lance = fs.existsSync(JOURNAL_SD) ? JSON.parse(fs.readFileSync(JOURNAL_SD, 'utf8')) : {};
const dirGit = SD_DOSSIER.replaceAll(path.sep, '/');
verif('auto start: git safe.directory given through the WebUI process environment only (git >= 2.46: folder and folder/*), existing GIT_CONFIG entry kept',
  lance.git?.GIT_CONFIG_COUNT === '3' && lance.git.GIT_CONFIG_KEY_0 === 'core.autocrlf' && lance.git.GIT_CONFIG_VALUE_0 === 'false'
  && lance.git.GIT_CONFIG_KEY_1 === 'safe.directory' && lance.git.GIT_CONFIG_VALUE_1 === dirGit && lance.git.GIT_CONFIG_KEY_2 === 'safe.directory' && lance.git.GIT_CONFIG_VALUE_2 === `${dirGit}/*`, JSON.stringify(lance.git));
verif('auto start: API-only arguments through COMMANDLINE_ARGS, user args appended', lance.args === `--api --nowebui --port ${portAuto} --medvram-sdxl --medvram`, JSON.stringify(lance));
verif('auto start: runs in the WebUI folder, caches kept next to it (not on C:)', lance.cwd === SD_DOSSIER && lance.hf?.startsWith(SD_DOSSIER) && lance.pip?.startsWith(SD_DOSSIER), JSON.stringify(lance));
fs.rmSync(JOURNAL_SD, { force: true });
r = await lancer(['generer', '--prompt', 'second appel', '--sortie', 'auto2.png']);
verif('auto start: a running API is reused, not started twice', r.code === 0 && !fs.existsSync(JOURNAL_SD), r.out);
try { process.kill(suivi.pid); } catch { /* already gone */ }

// ---- a start that dies at once reports the end of the log
const SD_MORT = path.join(TMP, 'sd-mort');
fabriquerSD(SD_MORT);
fs.writeFileSync(path.join(SD_MORT, 'launch.py'), "console.error('Traceback: boom'); process.exit(3);");
ecrireConfig({ moteur: 'gratuit', sdPort: await portLibre(), sdDossier: SD_MORT, sdPython: process.execPath });
fs.rmSync(path.join(CFG, 'sd-demarrage.json'), { force: true });
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'mort.png', '--attente', '30']);
verif('auto start: WebUI that exits at once is reported with the log tail', r.code === 1 && r.json?.code === 'sd-arret' && /boom/.test(r.json.message), r.out);
// ---- still starting after the wait: tells to run again
const SD_LENT = path.join(TMP, 'sd-lent');
fabriquerSD(SD_LENT);
fs.writeFileSync(path.join(SD_LENT, 'launch.py'), 'setTimeout(() => process.exit(0), 20000);');
ecrireConfig({ moteur: 'gratuit', sdPort: await portLibre(), sdDossier: SD_LENT, sdPython: process.execPath });
fs.rmSync(path.join(CFG, 'sd-demarrage.json'), { force: true });
r = await lancer(['generer', '--prompt', 'x', '--sortie', 'lent.png', '--attente', '3']);
verif('auto start: wait budget over = "still starting, run again" (process left running)', r.code === 1 && r.json?.code === 'sd-demarrage-en-cours', r.out);
const lentPid = JSON.parse(fs.readFileSync(path.join(CFG, 'sd-demarrage.json'), 'utf8')).pid;
try { process.kill(lentPid); } catch { /* already gone */ }

// ================================================================ generation through Codex
const IMAGES_CODEX = path.join(CODEX_HOME, 'generated_images');
fs.mkdirSync(path.join(IMAGES_CODEX, 'ancienne-session'), { recursive: true });
const ancienne = path.join(IMAGES_CODEX, 'ancienne-session', 'ig_ancienne.png');
fs.writeFileSync(ancienne, 'ANCIENNE-IMAGE');
const hier = new Date(Date.now() - 3600 * 1000);
fs.utimesSync(ancienne, hier, hier);
try { fs.utimesSync(ancienne, hier, hier); } catch { /* ignore */ }
ecrireConfig({ moteur: 'codex', codexExe: CODEX_FAUX, codexHome: CODEX_HOME });
fs.rmSync(JOURNAL_CODEX, { force: true });
const viderSession = () => fs.rmSync(path.join(IMAGES_CODEX, 'session-1'), { recursive: true, force: true }); // images the fake made in earlier cases
const fc = path.join(SORTIES, 'codex', 'logo.png');
r = await lancer(['generer', '--prompt', 'A cozy bakery logo, warm colours', '--largeur', '1536', '--hauteur', '1024', '--sortie', fc]);
verif('codex: copies the NEWEST image created after the start (not the old one)', r.code === 0 && r.json?.ok === true && r.json.moteur === 'codex' && r.json.fichier === fc && estPNG(fc), r.out);
const ex = appelsCodex().find((c) => c.args[0] === 'exec');
verif('codex: exec --skip-git-repo-check --sandbox read-only --json "$imagegen <prompt>", CODEX_HOME set',
  ex && ex.args.slice(0, 5).join(' ') === 'exec --skip-git-repo-check --sandbox read-only --json' && ex.args[5].startsWith('$imagegen A cozy bakery logo, warm colours') && /landscape/.test(ex.args[5]) && ex.home === CODEX_HOME, JSON.stringify(ex));
r = await lancer(['generer', '--prompt', 'x', '--sortie', fc]);
verif('codex: refuses to overwrite before calling Codex', r.json?.code === 'existe' && appelsCodex().filter((c) => c.args[0] === 'exec').length === 1, r.out);
viderSession();
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'forfait.png'], { FAKE_CODEX_MODE: 'forfait' });
verif('codex: free-plan message detected = "forfait ChatGPT Plus/Pro requis"', r.code === 1 && r.json?.code === 'codex-forfait' && /Plus\/Pro requis/.test(r.json.message) && !fs.existsSync(path.join(SORTIES, 'forfait.png')), r.out);
viderSession();
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'forfait.png'], { FAKE_CODEX_MODE: 'forfait', IMAGES_LANG: 'en' });
verif('codex: free-plan message in English', /plan required/.test(r.json?.message || ''), r.out);
r = await lancer(['etat']);
verif('etat: remembers the plan problem seen at generation', r.json.codex.forfaitRequis === true && r.json.problemes.some((p) => /Plus\/Pro/.test(p)), JSON.stringify(r.json.problemes));
viderSession();
r = await lancer(['generer', '--prompt', 'logo bis', '--sortie', 'apres-forfait.png']);
verif('codex: a later success clears the plan problem', r.code === 0 && (await lancer(['etat'])).json.codex.forfaitRequis === false);
viderSession();
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'rien.png'], { FAKE_CODEX_MODE: 'rien' });
verif('codex: no image and another answer = "no image" with Codex\'s words', r.code === 1 && r.json?.code === 'codex-rien' && /describe the picture/.test(r.json.message), r.out);
viderSession();
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'conn.png'], { FAKE_CODEX_MODE: 'connexion' });
verif('codex: not signed in is reported as such', r.code === 1 && r.json?.code === 'codex-connexion', r.out);
viderSession();
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'lent2.png', '--delai', '2'], { FAKE_CODEX_MODE: 'lent' });
verif('codex: timeout interrupts and says so', r.code === 1 && r.json?.code === 'codex-coupe', r.out);
ecrireConfig({ moteur: 'codex', codexExe: path.join(TMP, 'pas-de-codex.exe'), codexHome: CODEX_HOME });
r = await lancer(['generer', '--prompt', 'logo', '--sortie', 'introuvable.png']);
verif('codex: program not found = clear message', r.code === 1 && r.json?.code === 'codex-introuvable', r.out);
// shim resolution: a .cmd shim leads to node_modules/@openai/*/vendor/*/bin/codex.exe
const NM = path.join(TMP, 'npm', 'node_modules');
fs.mkdirSync(path.join(NM, '.bin'), { recursive: true });
fs.mkdirSync(path.join(NM, '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin'), { recursive: true });
fs.mkdirSync(path.join(NM, '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex-resources'), { recursive: true });
fs.writeFileSync(path.join(NM, '.bin', 'codex.cmd'), '@echo off');
fs.writeFileSync(path.join(NM, '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex-resources', 'codex-command-runner.exe'), '');
const reelFaux = path.join(NM, '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
fs.writeFileSync(reelFaux, '');
ecrireConfig({ moteur: 'codex', codexExe: path.join(NM, '.bin', 'codex.cmd'), codexHome: CODEX_HOME });
r = await lancer(['etat']);
verif('codex: the .cmd shim is resolved to the real codex.exe (spawned directly, no shell)', r.json.codex.exe === reelFaux && r.json.codex.trouve === true, JSON.stringify(r.json.codex));

// ================================================================ bad arguments, no engine
fs.rmSync(path.join(CFG, 'config.json'), { force: true });
r = await lancer(['generer', '--prompt', 'sans moteur', '--sortie', 'nm.png']);
verif('generer: no engine chosen = asks to configure, no file', r.code === 1 && r.json?.code === 'non-configure' && /configurer/.test(r.json.message), r.out);
ecrireConfig({ moteur: 'gratuit', sdPort: PORT_SD, sdDossier: SD_DOSSIER });
const mauvais = [
  ['no prompt', ['generer']],
  ['unknown command', ['peindre', '--prompt', 'x']],
  ['no command', []],
  ['unknown flag', ['generer', '--prompt', 'x', '--couleur', 'rouge']],
  ['positional word', ['generer', 'x']],
  ['prompt without value', ['generer', '--prompt']],
  ['empty prompt', ['generer', '--prompt', '  ']],
  ['width not a number', ['generer', '--prompt', 'x', '--largeur', 'abc']],
  ['width too small', ['generer', '--prompt', 'x', '--largeur', '10']],
  ['height too big', ['generer', '--prompt', 'x', '--hauteur', '99999']],
  ['steps not an integer', ['generer', '--prompt', 'x', '--pas', '2.5']],
  ['cfg out of range', ['generer', '--prompt', 'x', '--cfg', '100']],
  ['engine unknown', ['generer', '--prompt', 'x', '--moteur', 'dalle']],
  ['output not .png', ['generer', '--prompt', 'x', '--sortie', 'x.jpg']],
  ['prompt too long', ['generer', '--prompt', 'a'.repeat(4001)]],
  ['etat with an argument', ['etat', '--x', '1']],
];
for (const [nom, args] of mauvais) {
  const m = await lancer(args);
  verif(`bad args: ${nom} rejected (exit 2, ok false, no file)`, m.code === 2 && m.json?.ok === false && typeof m.json.message === 'string', m.out);
}
verif('bad args: nothing written to the output folder by rejected calls', !fs.readdirSync(SORTIES).some((n) => /^x\.|^nm\./.test(n)));

// ================================================================ repo wiring and style
const lireJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const plugin = lireJSON(path.join(ici, '..', '.claude-plugin', 'plugin.json'));
const place = lireJSON(path.join(RACINE, '.claude-plugin', 'marketplace.json'));
const entree = place.plugins.find((p) => p.name === 'images');
verif('repo: marketplace.json lists images with matching source and version', entree?.source === './plugins/images' && entree.version === plugin.version && plugin.name === 'images');
for (const s of ['images', 'configurer']) {
  const t = fs.readFileSync(path.join(ici, '..', 'skills', s, 'SKILL.md'), 'utf8');
  verif(`repo: skill ${s} has a name and a description`, new RegExp(`^---\\r?\\nname: ${s}\\r?\\ndescription: .{40,}`).test(t));
}
const fichiers = [];
const lister = (d) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); x.isDirectory() ? lister(p) : fichiers.push(p); } };
lister(path.join(ici, '..'));
const tiret = fichiers.filter((f) => /[\u2013\u2014]/.test(fs.readFileSync(f, 'utf8')));
verif('style: no em dash or en dash anywhere in the plugin', tiret.length === 0, tiret.join(', '));

faux.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folder deleted)`);
process.exit(ko ? 1 : 0);
