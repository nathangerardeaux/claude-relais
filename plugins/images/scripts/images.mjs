#!/usr/bin/env node
// images plugin: one script, four commands (no npm dependency, plain fetch / child_process).
//   configurer --moteur gratuit|codex [--sd-dossier D] [--sd-port N] [--sd-args "..."] [--sd-python P]
//              [--codex-exe P] [--codex-home D]
//   etat
//   verifier [--moteur gratuit|codex] [--dossier D] [--texte]   (prerequisites report, changes nothing)
//   installer --etape NAME [--oui] [--dossier D] ...             (one install step; without --oui only shows the plan)
//   demarrer [--attente S]                      (starts the Stable Diffusion API if it is not running)
//   generer --prompt "..." [--negatif "..."] [--largeur N --hauteur N] [--sortie f.png] [--moteur ...]
//           [--pas N] [--cfg N] [--graine N] [--delai S] [--attente S]
// Every command prints JSON on stdout. Exit code: 0 ok, 1 refused or failed, 2 bad arguments.
// Engines: "gratuit" = AUTOMATIC1111 Stable Diffusion WebUI (local API), "codex" = OpenAI Codex CLI
// signed in with a PAID ChatGPT plan (built-in $imagegen skill). Nothing is sent anywhere by this
// script itself; no secret is ever read or printed (Codex keeps its own login in CODEX_HOME).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  commande, dormir, dossierEtat, dossierImagesCodex, dossierSD, echec, ecrireJSON, envCodex, envSD, existe, exeDepuisShim, fichierConfig, fichierDemarrage,
  IMAGE_EXT, REGEX_CONNEXION, REGEX_FORFAIT, fichierForfait, fichiersModeles, finDuJournal, homeCodex, langue, lireConfig, lireJSON, lireVersionVenv, msg, pythonVenv, statutCodex, trouverCodex, venvAvecTorch, vivant,
} from './commun.mjs';
import { cmdInstaller, cmdVerifier } from './installation.mjs';


// ---------------------------------------------------------------- arguments
// Every flag is declared: an unknown flag, a missing value or a bad number is refused (exit code 2).
const SPEC = {
  configurer: { moteur: 's', 'sd-dossier': 's', 'sd-port': 'i', 'sd-args': 's', 'sd-python': 's', 'codex-exe': 's', 'codex-home': 's' },
  etat: {},
  demarrer: { attente: 'i' },
  verifier: { moteur: 's', dossier: 's', texte: 'b' },
  installer: { etape: 's', oui: 'b', dossier: 's', methode: 's', recreer: 'b', repartir: 'b', url: 's', sha256: 's', taille: 'i', nom: 's', attente: 'i', delai: 'i' },
  generer: { prompt: 's', negatif: 's', largeur: 'i', hauteur: 'i', sortie: 's', moteur: 's', pas: 'i', cfg: 'n', graine: 'i', delai: 'i', attente: 'i' },
};
const BORNES = { 'sd-port': [1, 65535], attente: [0, 3600], largeur: [64, 2048], hauteur: [64, 2048], pas: [1, 150], cfg: [1, 30], graine: [-1, 4294967295], delai: [1, 3600] };
const MAX_PROMPT = 4000;

function lireArgs(commande, argv) {
  const spec = SPEC[commande];
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z0-9-]+)(?:=([\s\S]*))?$/.exec(argv[i]);
    if (!m) return { erreur: `"${argv[i]}"` };
    const cle = m[1];
    if (!(cle in spec)) return { erreur: `--${cle}` };
    if (spec[cle] === 'b') { if (m[2] !== undefined) return { erreur: `--${cle} (sans valeur / no value)` }; o[cle] = true; continue; }
    let v = m[2];
    if (v === undefined) { if (i + 1 >= argv.length) return { erreur: `--${cle} (valeur manquante / missing value)` }; v = argv[++i]; }
    if (spec[cle] === 's') {
      if (!String(v).trim()) return { erreur: `--${cle} (vide / empty)` };
      o[cle] = String(v);
    } else {
      const n = Number(v);
      const [min, max] = BORNES[cle] || [-Infinity, Infinity];
      if (v === '' || !Number.isFinite(n) || (spec[cle] === 'i' && !Number.isInteger(n)) || n < min || n > max) return { erreur: `--${cle} ${v} (${min}..${max})` };
      o[cle] = n;
    }
  }
  if (o.moteur && !['gratuit', 'codex'].includes(o.moteur)) return { erreur: `--moteur ${o.moteur} (gratuit | codex)` };
  if (o.prompt && o.prompt.length > MAX_PROMPT) return { erreur: `--prompt (max ${MAX_PROMPT})` };
  return { o };
}


// ---------------------------------------------------------------- Stable Diffusion
const PORTS_DEFAUT = [7861, 7860]; // 7861 = API alone (--nowebui), 7860 = WebUI with --api

const urlsSD = (cfg) => (cfg.sdPort ? [cfg.sdPort] : PORTS_DEFAUT).map((p) => `http://127.0.0.1:${p}`);

async function sdModeles(url) {
  try {
    const r = await fetch(`${url}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch { return null; }
}

async function sdActif(cfg) {
  for (const url of urlsSD(cfg)) {
    const modeles = await sdModeles(url);
    if (modeles) return { url, modeles };
  }
  return null;
}

// Makes sure the Stable Diffusion API answers: reuses a running one, else starts WebUI in API mode
// (hidden window, background) and waits up to `attente` seconds. Returns { ok, url, modeles } or a failure.
async function assurerSD(cfg, attente) {
  const deja = await sdActif(cfg);
  if (deja) return { ok: true, ...deja };

  const dossier = dossierSD(cfg);
  if (!existe(path.join(dossier, 'launch.py'))) return echec('sd-introuvable', dossier);
  const python = cfg.sdPython || pythonVenv(dossier);
  if (!existe(python)) return echec('sd-sans-venv', python);
  if (!cfg.sdPython) {
    const v = lireVersionVenv(dossier);
    if (v && !/^3\.10\./.test(v) && !venvAvecTorch(dossier)) return echec('sd-python', v, dossier);
  }
  if (!fichiersModeles(dossier).length) return echec('sd-sans-modele', path.join(dossier, 'models', 'Stable-diffusion'));

  const port = cfg.sdPort || PORTS_DEFAUT[0];
  const tmp = path.join(dossier, 'tmp');
  const log = path.join(tmp, 'images-plugin.log');
  let pid = 0;
  let sorti = null; // exit code once our child is gone
  const suivi = lireJSON(fichierDemarrage());
  if (suivi?.pid && vivant(suivi.pid) && Date.now() - Date.parse(suivi.depuis || 0) < 45 * 60 * 1000) {
    pid = suivi.pid; // a start is already under way (another call): only wait for it
  } else {
    fs.mkdirSync(tmp, { recursive: true });
    const sortieLog = fs.openSync(log, 'a');
    const env = envSD(dossier, ['--api', '--nowebui', '--port', String(port), '--medvram-sdxl', cfg.sdArgs || '']);
    const enfant = spawn(python, ['launch.py'], { cwd: dossier, env, detached: true, windowsHide: true, stdio: ['ignore', sortieLog, sortieLog] });
    fs.closeSync(sortieLog);
    pid = enfant.pid;
    enfant.on('exit', (code) => { sorti = code ?? 1; });
    enfant.on('error', () => { sorti = 1; });
    ecrireJSON(fichierDemarrage(), { pid, depuis: new Date().toISOString(), port });
    enfant.unref();
  }

  const fin = Date.now() + attente * 1000;
  while (Date.now() < fin) {
    await dormir(2000);
    const a = await sdActif(cfg);
    if (a) return { ok: true, ...a, demarre: true };
    if (sorti !== null || !vivant(pid)) {
      try { fs.rmSync(fichierDemarrage(), { force: true }); } catch { /* ignore */ }
      return echec('sd-arret', finDuJournal(log) || '(vide / empty)', log);
    }
  }
  return echec('sd-demarrage-en-cours', attente, log);
}

const SDXL_NOM = /xl|pony|illustrious|noobai/i;
function estSDXL(m) {
  if (!m) return false;
  if (SDXL_NOM.test(`${m.model_name || ''} ${m.title || ''}`)) return true;
  try { return fs.statSync(m.filename).size > 5.5e9; } catch { return false; } // SD1.5 files are 2 to 4 GB
}

async function modeleCourant(url, modeles) {
  try {
    const o = await (await fetch(`${url}/sdapi/v1/options`, { signal: AbortSignal.timeout(5000) })).json();
    const titre = o?.sd_model_checkpoint;
    const m = modeles.find((x) => x.title === titre || x.model_name === titre);
    if (m) return m;
  } catch { /* fall through */ }
  return modeles[0];
}

const NEGATIF_DEFAUT = 'lowres, blurry, bad anatomy, bad hands, extra fingers, deformed, jpeg artifacts, watermark';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const multiple8 = (n) => Math.max(64, Math.round(n / 8) * 8);

async function genererSD(cfg, o, sortie) {
  const sd = await assurerSD(cfg, o.attente ?? 480);
  if (!sd.ok) return sd;
  if (!sd.modeles.length) return echec('sd-sans-modele', path.join(dossierSD(cfg), 'models', 'Stable-diffusion'));
  const modele = await modeleCourant(sd.url, sd.modeles);
  const xl = estSDXL(modele);
  const largeur = multiple8(o.largeur ?? (xl ? 1024 : 512));
  const hauteur = multiple8(o.hauteur ?? (xl ? 1024 : 512));
  const corps = {
    prompt: o.prompt,
    negative_prompt: o.negatif ?? NEGATIF_DEFAUT,
    width: largeur,
    height: hauteur,
    steps: o.pas ?? (xl ? 28 : 25),
    cfg_scale: o.cfg ?? (xl ? 6 : 7),
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    seed: o.graine ?? -1,
    batch_size: 1,
    n_iter: 1,
    send_images: true,
    save_images: false,
  };
  const delai = o.delai ?? 600;
  let rep;
  try {
    rep = await fetch(`${sd.url}/sdapi/v1/txt2img`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(delai * 1000),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return echec('sd-coupe', delai);
    return echec('sd-introuvable', sd.url);
  }
  if (!rep.ok) {
    const texte = (await rep.text().catch(() => '')).slice(0, 400);
    return /out of memory|OutOfMemory/i.test(texte) ? echec('sd-memoire') : echec('sd-erreur', rep.status, texte);
  }
  const j = await rep.json().catch(() => null);
  const b64 = String(j?.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  const png = Buffer.from(b64, 'base64');
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return echec('sd-image');
  let graine;
  try { graine = JSON.parse(j.info).seed; } catch { /* seed unknown */ }
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, png, { flag: 'wx' }); // 'wx': never overwrite, even after a race
  return { ok: true, fichier: sortie, details: { modele: modele?.model_name || modele?.title || '', largeur, hauteur, pas: corps.steps, cfg: corps.cfg_scale, graine, sdxl: xl } };
}


function imagesApres(dossier, debut) {
  const res = [];
  const marcher = (d, niveau) => {
    let entrees = [];
    try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && niveau < 4) marcher(p, niveau + 1);
      else if (e.isFile() && IMAGE_EXT.test(e.name)) {
        const s = fs.statSync(p);
        const t = Math.max(s.mtimeMs, s.birthtimeMs);
        if (t >= debut) res.push({ p, t });
      }
    }
  };
  marcher(dossier, 0);
  return res.sort((a, b) => b.t - a.t);
}

function analyserEvenements(sortieStd) {
  const messages = [];
  const erreurs = [];
  for (const ligne of String(sortieStd).split(/\r?\n/)) {
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    const item = e?.item || e?.msg || e;
    if (item?.type === 'agent_message') messages.push(String(item.text ?? item.message ?? ''));
    else if (e?.type === 'error' || e?.type === 'turn.failed') erreurs.push(String(e.message ?? e.error?.message ?? ''));
  }
  return { messages, erreurs };
}

const formatPaysage = (l, h) => (l && h ? (l / h > 1.2 ? '\nFormat: landscape (about 3:2).' : l / h < 0.83 ? '\nFormat: portrait (about 2:3).' : '\nFormat: square.') : '');

async function genererCodex(cfg, o, sortie) {
  const { exe, demande } = trouverCodex(cfg);
  if (!exe) return echec('codex-introuvable', demande);
  const dossierImages = dossierImagesCodex(cfg);
  const debut = Date.now();
  const delai = o.delai ?? 360;
  const consigne = `$imagegen ${o.prompt}${formatPaysage(o.largeur, o.hauteur)}`;
  const c = commande(exe, ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', consigne]);
  fs.mkdirSync(dossierEtat(), { recursive: true });

  const resultat = await new Promise((resolve) => {
    let out = ''; let err = ''; let coupe = false;
    const enfant = spawn(c.cmd, c.args, { cwd: dossierEtat(), env: envCodex(cfg), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const minuteur = setTimeout(() => { coupe = true; enfant.kill(); }, delai * 1000);
    enfant.stdout.on('data', (d) => { out += d; });
    enfant.stderr.on('data', (d) => { err += d; });
    enfant.on('error', (e) => { clearTimeout(minuteur); resolve({ out, err: String(e.message), code: 1, coupe }); });
    enfant.on('close', (code) => { clearTimeout(minuteur); resolve({ out, err, code, coupe }); });
  });

  const { messages, erreurs } = analyserEvenements(resultat.out);
  const images = imagesApres(dossierImages, debut - 200);
  if (images.length) {
    const source = images[0].p;
    let cible = sortie;
    const ext = path.extname(source).toLowerCase();
    if (ext !== path.extname(sortie).toLowerCase()) cible = sortie.slice(0, -path.extname(sortie).length) + ext;
    if (existe(cible)) return echec('existe', cible, suivantLibre(cible));
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.copyFileSync(source, cible, fs.constants.COPYFILE_EXCL);
    try { fs.rmSync(fichierForfait(), { force: true }); } catch { /* ignore */ }
    return { ok: true, fichier: cible, details: { source } };
  }
  if (resultat.coupe) return echec('codex-coupe', delai);
  const tout = [...messages, ...erreurs].join(' ');
  if (REGEX_FORFAIT.test(tout) || REGEX_FORFAIT.test(resultat.out)) {
    try { ecrireJSON(fichierForfait(), { depuis: new Date().toISOString() }); } catch { /* ignore */ }
    return echec('codex-forfait');
  }
  if (REGEX_CONNEXION.test(`${erreurs.join(' ')} ${resultat.err}`)) return echec('codex-connexion');
  if (resultat.code !== 0) return echec('codex-erreur', resultat.code, (erreurs[0] || resultat.err).replace(/\s+/g, ' ').slice(0, 300));
  return echec('codex-rien', (messages.at(-1) || '').replace(/\s+/g, ' ').slice(0, 300));
}

// ---------------------------------------------------------------- output file
// Same name with -2, -3... until it is free.
function suivantLibre(f) {
  const { dir, name, ext } = path.parse(f);
  for (let i = 2; i < 10000; i++) { const p = path.join(dir, `${name}-${i}${ext}`); if (!existe(p)) return p; }
  return f;
}

function sortiePrevue(arg) {
  if (arg) return path.resolve(arg);
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const nom = `image-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
  const f = path.resolve(nom);
  return existe(f) ? suivantLibre(f) : f;
}

// ---------------------------------------------------------------- commands
function cmdConfigurer(o) {
  const cfg = lireConfig();
  const moteur = o.moteur || cfg.moteur;
  if (!moteur) return { sortie: { ok: false, code: 'args', message: msg('aucun-moteur-arg') }, code: 2 };
  if (o['sd-dossier'] && !existe(path.join(path.resolve(o['sd-dossier']), 'launch.py'))) return { sortie: echec('sd-introuvable', path.resolve(o['sd-dossier'])), code: 1 };
  if (o['codex-exe'] && !existe(path.resolve(o['codex-exe']))) return { sortie: echec('codex-introuvable', path.resolve(o['codex-exe'])), code: 1 };
  if (o['sd-python'] && !existe(path.resolve(o['sd-python']))) return { sortie: echec('sd-sans-venv', path.resolve(o['sd-python'])), code: 1 };
  const nouveau = { ...cfg, moteur };
  if (o['sd-dossier']) nouveau.sdDossier = path.resolve(o['sd-dossier']);
  if (o['sd-port']) nouveau.sdPort = o['sd-port'];
  if (o['sd-args']) nouveau.sdArgs = o['sd-args'];
  if (o['sd-python']) nouveau.sdPython = path.resolve(o['sd-python']);
  if (o['codex-exe']) nouveau.codexExe = path.resolve(o['codex-exe']);
  if (o['codex-home']) nouveau.codexHome = path.resolve(o['codex-home']);
  ecrireJSON(fichierConfig(), nouveau);
  return { sortie: { ok: true, moteur, fichierConfig: fichierConfig(), config: nouveau, message: msg('config-ok', moteur, fichierConfig()) }, code: 0 };
}

async function cmdEtat() {
  const cfg = lireConfig();
  const dossier = dossierSD(cfg);
  const actif = await sdActif(cfg);
  const fichiers = fichiersModeles(dossier);
  const version = lireVersionVenv(dossier);
  const suivi = lireJSON(fichierDemarrage());
  const { exe, demande } = trouverCodex(cfg);
  const statut = statutCodex(cfg, exe);
  const forfait = lireJSON(fichierForfait());
  const sd = {
    dossier, trouve: existe(path.join(dossier, 'launch.py')),
    pythonVenv: existe(pythonVenv(dossier)), versionPython: version,
    pythonCompatible: !version || /^3\.10\./.test(version) || venvAvecTorch(dossier),
    checkpointsFichiers: fichiers,
    api: { actif: !!actif, url: actif?.url || '', modeles: (actif?.modeles || []).map((m) => m.title) },
    demarrageEnCours: !!(suivi?.pid && vivant(suivi.pid) && !actif),
  };
  const codex = {
    exe, demande, trouve: !!exe, home: homeCodex(cfg), dossierImages: dossierImagesCodex(cfg),
    connecte: statut.connecte, statut: statut.texte,
    forfaitRequis: !!forfait, forfaitConstateLe: forfait?.depuis || '',
  };
  const problemes = [];
  if (!cfg.moteur) problemes.push(msg('non-configure'));
  if (cfg.moteur === 'gratuit' || !cfg.moteur) {
    if (!sd.trouve) problemes.push(msg('sd-introuvable', dossier));
    else if (!sd.pythonVenv) problemes.push(msg('sd-sans-venv', pythonVenv(dossier)));
    else if (!sd.pythonCompatible) problemes.push(msg('sd-python', version, dossier));
    if (sd.trouve && !fichiers.length && !sd.api.modeles.length) problemes.push(msg('sd-sans-modele', path.join(dossier, 'models', 'Stable-diffusion')));
  }
  if (cfg.moteur === 'codex' || !cfg.moteur) {
    if (!codex.trouve) problemes.push(msg('codex-introuvable', demande));
    else if (!codex.connecte) problemes.push(msg('codex-connexion'));
    if (codex.forfaitRequis) problemes.push(msg('codex-forfait'));
  }
  return { sortie: { ok: true, configure: !!cfg.moteur, moteur: cfg.moteur || null, fichierConfig: fichierConfig(), sd, codex, problemes }, code: 0 };
}

async function cmdDemarrer(o) {
  const cfg = lireConfig();
  const r = await assurerSD(cfg, o.attente ?? 480);
  if (!r.ok) return { sortie: r, code: 1 };
  return { sortie: { ok: true, url: r.url, modeles: r.modeles.map((m) => m.title), message: msg('sd-demarre', r.url) }, code: 0 };
}

async function cmdGenerer(o) {
  if (!o.prompt) return { sortie: { ok: false, code: 'args', message: msg('args', '--prompt') }, code: 2 };
  const cfg = lireConfig();
  const moteur = o.moteur || cfg.moteur;
  if (!moteur) return { sortie: echec('non-configure'), code: 1 };
  const sortie = sortiePrevue(o.sortie);
  if (path.extname(sortie).toLowerCase() !== '.png') return { sortie: { ok: false, code: 'args', message: msg('args', '--sortie (.png)') }, code: 2 };
  if (existe(sortie)) return { sortie: echec('existe', sortie, suivantLibre(sortie)), code: 1 };
  const t0 = Date.now();
  const r = moteur === 'codex' ? await genererCodex(cfg, o, sortie) : await genererSD(cfg, o, sortie);
  if (!r.ok) return { sortie: { ok: false, code: r.code, moteur, message: r.message }, code: 1 };
  return { sortie: { ok: true, fichier: r.fichier, moteur, secondes: Math.round((Date.now() - t0) / 100) / 10, ...r.details && { details: r.details } }, code: 0 };
}

async function main() {
  const [commande_, ...reste] = process.argv.slice(2);
  if (!commande_ || !SPEC[commande_]) {
    console.log(JSON.stringify({ ok: false, code: 'args', message: msg('args', `${commande_ || ''} (configurer | etat | verifier | installer | demarrer | generer)`) }));
    return 2;
  }
  const { o, erreur } = lireArgs(commande_, reste);
  if (erreur) { console.log(JSON.stringify({ ok: false, code: 'args', message: msg('args', erreur) })); return 2; }
  let r;
  try {
    r = commande_ === 'configurer' ? cmdConfigurer(o)
      : commande_ === 'etat' ? await cmdEtat()
        : commande_ === 'verifier' ? await cmdVerifier(o)
          : commande_ === 'installer' ? await cmdInstaller(o)
            : commande_ === 'demarrer' ? await cmdDemarrer(o)
              : await cmdGenerer(o);
  } catch (e) {
    r = { sortie: { ok: false, code: 'interne', message: String(e?.message || e).slice(0, 300) }, code: 1 };
  }
  if (commande_ === 'verifier' && o.texte && r.sortie.texte) { console.log(r.sortie.texte); return r.code; }
  console.log(commande_ === 'etat' || commande_ === 'verifier' ? JSON.stringify(r.sortie, null, 2) : JSON.stringify(r.sortie));
  return r.code;
}

process.exitCode = await main();

