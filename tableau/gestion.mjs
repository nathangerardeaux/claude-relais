// Skill management: install, switch on/off everywhere or per project, and session profiles. Everything
// goes through Claude Code's own commands (`claude plugin ...`, `claude --settings <file>`): this file
// never edits Claude Code's settings itself, except the profile files it owns (<config>/tableau-relais/).
// `claude` is resolved to an absolute path from PATH (never the current folder) and started without a
// shell when it is an .exe; arguments only come from fixed lists or values checked against strict patterns.
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dossierClaude } from './analyse.mjs';
import { SKILLS_EXTERNES, STYLES_DESIGN } from './skills-externes.mjs';
import { tr } from './langue.mjs';

const ID_PLUGIN = /^[a-z0-9][a-z0-9._-]{0,63}@[a-z0-9][a-z0-9._-]{0,63}$/i;
const DEPOT_GITHUB = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const RESEAU = /^[\\/]{2}/;

// ------------------------------------------------------------------ finding and running programs
// First match in PATH, absolute folders only (a relative entry would mean "the current folder").
function chercherDansPath(noms) {
  const dossiers = String(process.env.PATH || '').split(path.delimiter).map((d) => d.trim().replace(/^"|"$/g, ''))
    .filter((d) => d && path.isAbsolute(d) && !RESEAU.test(d));
  for (const nom of noms) for (const d of dossiers) {
    const f = path.join(d, nom);
    try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ }
  }
  return null;
}

const cmdExe = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
const SUR_CMD = /^[A-Za-z0-9@._:\\/ =-]*$/; // nothing cmd.exe could interpret (no " & | ^ % < > ( ) !)

// { fichier, prefixe, verbatim } to run `programme`, or null. TABLEAU_CLAUDE (tests): a fake in Node.
export function programme(nom) {
  if (nom === 'claude' && process.env.TABLEAU_CLAUDE) return { fichier: process.execPath, prefixe: [process.env.TABLEAU_CLAUDE] };
  if (process.platform !== 'win32') { const f = chercherDansPath([nom]); return f ? { fichier: f, prefixe: [] } : null; }
  const exe = chercherDansPath([`${nom}.exe`, `${nom}.com`]);
  if (exe) return { fichier: exe, prefixe: [] };
  const cmd = chercherDansPath([`${nom}.cmd`]); // npm installs: a .cmd only cmd.exe can start
  return cmd && SUR_CMD.test(cmd) ? { fichier: cmdExe(), prefixe: ['/d', '/s', '/c'], cmd } : null;
}

function executer(nom, args, { cwd, timeout = 180000, env } = {}) {
  const p = programme(nom);
  if (!p) return Promise.resolve({ ok: false, sortie: '', erreur: tr({ fr: `Commande « ${nom} » introuvable sur ce PC.`, en: `Command "${nom}" not found on this PC.` }) });
  if (p.cmd && !args.every((a) => SUR_CMD.test(a))) return Promise.resolve({ ok: false, sortie: '', erreur: tr({ fr: 'Argument refusé.', en: 'Argument refused.' }) });
  const liste = p.cmd ? [...p.prefixe, `"${[`"${p.cmd}"`, ...args].join(' ')}"`] : [...p.prefixe, ...args];
  return new Promise((resoudre) => {
    execFile(p.fichier, liste, { cwd: cwd || dossierClaude(), timeout, windowsHide: true, maxBuffer: 8 << 20, windowsVerbatimArguments: !!p.cmd, env: env ? { ...process.env, ...env } : undefined },
      (err, stdout, stderr) => resoudre({ ok: !err, sortie: String(stdout || ''), erreur: err ? (String(stderr || '').trim() || err.message) : '' }));
  });
}

// `claude ... --json`: the whole output (pretty-printed lists), else its last line holding a JSON object
// (results printed after progress messages). A lone line such as `"x@1.0"` is valid JSON too: ignored.
async function claudeJson(args, options) {
  const r = await executer('claude', [...args, '--json'], options);
  try { return { ...r, json: JSON.parse(r.sortie) }; } catch { /* several lines */ }
  for (const l of r.sortie.trim().split(/\r?\n/).reverse()) {
    try { const j = JSON.parse(l); if (j && typeof j === 'object') return { ...r, json: j }; } catch { /* not JSON */ }
  }
  return { ...r, json: null };
}
const resultat = (r, defaut) => {
  if (r.json?.outcome === 'ok') return { ok: true, message: String(r.json.message || defaut) };
  return { ok: false, message: String(r.json?.message || r.erreur || tr({ fr: 'La commande a échoué.', en: 'The command failed.' })).slice(0, 600) };
};

// One change at a time (two `claude plugin` writing the same settings would race).
let file = Promise.resolve();
const unParUn = (f) => { const p = file.then(f, f); file = p.catch(() => {}); return p; };

// ------------------------------------------------------------------ project folders
export function validerProjet(chemin) {
  if (typeof chemin !== 'string' || !chemin.trim()) return { ok: false, raison: tr({ fr: 'Dossier du projet vide.', en: 'Empty project folder.' }) };
  const brut = chemin.trim();
  if (RESEAU.test(brut)) return { ok: false, raison: tr({ fr: 'Chemin réseau refusé.', en: 'Network path refused.' }) };
  const absolu = process.platform === 'win32' ? /^[A-Za-z]:[\\/]/.test(brut) : brut.startsWith('/');
  if (!absolu) return { ok: false, raison: tr({ fr: 'Chemin absolu attendu (ex. D:\\mon-projet).', en: 'Absolute path expected (e.g. D:\\my-project).' }) };
  let reel;
  try { reel = fs.realpathSync.native(brut); } catch { return { ok: false, raison: tr({ fr: `Dossier introuvable : ${brut}`, en: `Folder not found: ${brut}` }) }; }
  if (RESEAU.test(reel) || !fs.statSync(reel).isDirectory()) return { ok: false, raison: tr({ fr: `Pas un dossier local : ${brut}`, en: `Not a local folder: ${brut}` }) };
  return { ok: true, dossier: reel };
}

// ------------------------------------------------------------------ installed plugins
const couts = new Map(); // `${id}@${version}` -> always-on tokens (null = unknown)
async function cout(p) {
  const cle = `${p.id}#${p.version}`;
  if (couts.has(cle)) return couts.get(cle);
  const r = await executer('claude', ['plugin', 'details', p.id], { timeout: 30000 });
  const m = r.sortie.match(/Always-on:\s*~?\s*([\d\s\u00a0\u202f,.]+?)\s*tok/i);
  const v = m ? Number(m[1].replace(/[\s\u00a0\u202f,.]/g, '')) : null;
  couts.set(cle, Number.isFinite(v) ? v : null);
  return couts.get(cle);
}

// Installed plugins as Claude Code sees them; with `projet`, the state inside that folder.
export async function plugins(projet) {
  let cwd;
  if (projet) { const v = validerProjet(projet); if (!v.ok) return { ok: false, message: v.raison }; cwd = v.dossier; }
  const r = await claudeJson(['plugin', 'list'], { cwd, timeout: 60000 });
  if (!Array.isArray(r.json)) return { ok: false, message: r.erreur || tr({ fr: 'Liste des plugins illisible.', en: 'Unreadable plugin list.' }) };
  // One line per scope: a plugin set both everywhere and in a project ('local', listed from any folder)
  // comes twice, each line giving the same state, the one in effect in `cwd`. Keep one, the 'user' one.
  const parId = new Map();
  for (const p of r.json) {
    if (!ID_PLUGIN.test(String(p.id || ''))) continue;
    if (!parId.has(p.id) || (p.scope === 'user' && parId.get(p.id).scope !== 'user')) parId.set(p.id, p);
  }
  const res = await Promise.all([...parId.values()].map(async (p) => ({
    id: p.id, nom: p.id.split('@')[0], source: p.id.split('@')[1], version: String(p.version || ''),
    portee: String(p.scope || ''), actif: p.enabled === true, cout: await cout(p),
  })));
  return { ok: true, projet: cwd || '', plugins: res.sort((a, b) => a.nom.localeCompare(b.nom)) };
}

// portee 'user' = everywhere; 'local' = only in `projet` (written by Claude Code in
// <projet>/.claude/settings.local.json, a file that is yours alone, not shared through git).
export function activer({ id, actif, portee, projet }) {
  if (!ID_PLUGIN.test(String(id || ''))) return { ok: false, message: tr({ fr: 'Plugin inconnu.', en: 'Unknown plugin.' }) };
  if (typeof actif !== 'boolean') return { ok: false, message: tr({ fr: 'Paramètre « actif » attendu.', en: 'Parameter "actif" expected.' }) };
  if (!['user', 'local'].includes(portee)) return { ok: false, message: tr({ fr: 'Portée inconnue.', en: 'Unknown scope.' }) };
  let cwd;
  if (portee === 'local') { const v = validerProjet(projet); if (!v.ok) return { ok: false, message: v.raison }; cwd = v.dossier; }
  return unParUn(async () => resultat(await claudeJson(['plugin', actif ? 'enable' : 'disable', id, '--scope', portee], { cwd }),
    tr(actif ? { fr: 'Activé.', en: 'Turned on.' } : { fr: 'Désactivé.', en: 'Turned off.' })));
}

// ------------------------------------------------------------------ installing external skills
export function installerExterne(idFiche) {
  const f = SKILLS_EXTERNES.find((s) => s.id === idFiche);
  const a = f?.action;
  const invalide = () => ({ ok: false, message: tr({ fr: 'Fiche invalide.', en: 'Invalid card.' }) });
  if (!a) return { ok: false, message: tr({ fr: 'Rien à installer pour cette fiche.', en: 'Nothing to install for this card.' }) };
  return unParUn(async () => {
    if (a.type === 'plugin') {
      if (!DEPOT_GITHUB.test(a.marketplace) || !ID_PLUGIN.test(a.plugin)) return invalide();
      const m = resultat(await claudeJson(['plugin', 'marketplace', 'add', a.marketplace]), '');
      if (!m.ok) return { ok: false, message: tr({ fr: `Ajout de la marketplace impossible : ${m.message}`, en: `Could not add the marketplace: ${m.message}` }) };
      const i = resultat(await claudeJson(['plugin', 'install', a.plugin]), tr({ fr: 'Installé.', en: 'Installed.' }));
      if (!i.ok) return i;
      // Very expensive plugins (coupePartout) are switched off everywhere right after install: the user
      // then turns them on per project or in a profile.
      if (a.coupePartout) {
        const c = resultat(await claudeJson(['plugin', 'disable', a.plugin, '--scope', 'user']), '');
        return c.ok ? { ok: true, message: tr({ fr: `${f.nom} est installé et COUPÉ partout (trop gourmand) : allume-le par projet ou par profil dans « Gestion des skills ».`,
          en: `${f.nom} is installed and turned OFF everywhere (too expensive): turn it on per project or in a profile under "Manage skills".` }) }
          : { ok: false, message: tr({ fr: `${f.nom} est installé mais n'a pas pu être coupé partout : ${c.message}`, en: `${f.nom} is installed but could not be turned off everywhere: ${c.message}` }) };
      }
      return { ok: true, message: tr({ fr: `${f.nom} est installé. Redémarre Claude Code pour le charger.`, en: `${f.nom} is installed. Restart Claude Code to load it.` }) };
    }
    if (a.type === 'npm') {
      if (!/^[a-z0-9@/._-]+$/.test(a.paquet)) return invalide();
      const r = await executer('npm', ['install', '-g', a.paquet], { timeout: 300000 });
      const ensuite = a.ensuite ? tr(a.ensuite) : '';
      return r.ok ? { ok: true, message: tr({ fr: `${f.nom} est installé (npm).${ensuite ? ` Ensuite : ${ensuite}` : ''}`, en: `${f.nom} is installed (npm).${ensuite ? ` Next: ${ensuite}` : ''}` }) }
        : { ok: false, message: tr({ fr: `npm a échoué : ${r.erreur.slice(0, 400)}`, en: `npm failed: ${r.erreur.slice(0, 400)}` }) };
    }
    // Python command-line tools: `uv tool install` (pipx if uv is missing). Only the command is installed,
    // never the tool's own "install into Claude" step, which edits CLAUDE.md and adds hooks (see the card).
    if (a.type === 'uv') {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(a.paquet)) return invalide();
      const ensuite = a.ensuite ? tr(a.ensuite) : '';
      let outil = 'uv';
      let r = await executer('uv', ['tool', 'install', a.paquet], { timeout: 600000 });
      if (!r.ok && !r.sortie && /introuvable|not found/i.test(r.erreur)) { outil = 'pipx'; r = await executer('pipx', ['install', a.paquet], { timeout: 600000 }); }
      return r.ok ? { ok: true, message: tr({ fr: `${f.nom} est installé (${outil}).${ensuite ? ` Ensuite : ${ensuite}` : ''}`, en: `${f.nom} is installed (${outil}).${ensuite ? ` Next: ${ensuite}` : ''}` }) }
        : { ok: false, message: tr({ fr: `${outil} a échoué : ${r.erreur.slice(0, 400)}`, en: `${outil} failed: ${r.erreur.slice(0, 400)}` }) };
    }
    return { ok: false, message: tr({ fr: 'Type d\'installation inconnu.', en: 'Unknown install type.' }) };
  });
}

// Agent skills from a GitHub repo, COPIED into one project (<projet>/.claude/skills) by `npx skills add`:
// per project rather than everywhere, since a skill installed everywhere loads its description into
// every session. Repo and skill names come from the card only, never from the request.
export function ajouterSkills({ id, projet }) {
  const a = SKILLS_EXTERNES.find((s) => s.id === id)?.action;
  if (a?.type !== 'skills' || !DEPOT_GITHUB.test(a.depot) || !a.skills?.length || !a.skills.every((s) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s))) {
    return { ok: false, message: tr({ fr: 'Fiche invalide.', en: 'Invalid card.' }) };
  }
  const v = validerProjet(projet);
  if (!v.ok) return { ok: false, message: v.raison };
  return unParUn(async () => {
    const r = await executer('npx', ['-y', 'skills', 'add', a.depot, '-a', 'claude-code', '-s', ...a.skills, '--copy', '-y'],
      { cwd: v.dossier, timeout: 300000, env: { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' } });
    return r.ok ? { ok: true, message: tr({ fr: `${a.skills.length} skills copiés dans ${path.join(v.dossier, '.claude', 'skills')}. Ouvre Claude Code dans ce projet pour les utiliser.`,
      en: `${a.skills.length} skills copied to ${path.join(v.dossier, '.claude', 'skills')}. Open Claude Code in this project to use them.` }) }
      : { ok: false, message: tr({ fr: `npx skills a échoué : ${r.erreur.slice(0, 400)}`, en: `npx skills failed: ${r.erreur.slice(0, 400)}` }) };
  });
}

// Downloads one DESIGN.md (fixed URL, style from the known list) into a project folder.
export async function ajouterDesign({ style, projet, ecraser }) {
  if (!STYLES_DESIGN.includes(style)) return { ok: false, message: tr({ fr: 'Style inconnu.', en: 'Unknown style.' }) };
  const v = validerProjet(projet);
  if (!v.ok) return { ok: false, message: v.raison };
  const cible = path.join(v.dossier, 'DESIGN.md');
  if (fs.existsSync(cible) && ecraser !== true) return { ok: false, existe: true, message: tr({ fr: `Il y a déjà un DESIGN.md dans ${v.dossier}.`, en: `There is already a DESIGN.md in ${v.dossier}.` }) };
  let texte;
  try {
    const r = await fetch(`https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/${style}/DESIGN.md`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, message: tr({ fr: `Téléchargement refusé par GitHub (${r.status}).`, en: `Download refused by GitHub (${r.status}).` }) };
    texte = await r.text();
  } catch (e) { return { ok: false, message: tr({ fr: `Téléchargement impossible : ${e.message}`, en: `Download failed: ${e.message}` }) }; }
  if (texte.length > 500000 || !/^(---|#)/.test(texte.trimStart())) return { ok: false, message: tr({ fr: 'Le fichier reçu ne ressemble pas à un DESIGN.md.', en: 'The file received does not look like a DESIGN.md.' }) };
  fs.writeFileSync(cible, texte);
  return { ok: true, message: tr({ fr: `DESIGN.md « ${style} » ajouté dans ${v.dossier}. Dis à Claude : « construis la page en suivant DESIGN.md ».`,
    en: `DESIGN.md "${style}" added to ${v.dossier}. Tell Claude: "build the page following DESIGN.md".` }) };
}

// ------------------------------------------------------------------ session profiles
// A profile = plugins forced on/off for one Claude Code session, through `claude --settings <file>`
// (checked: it overrides what is switched on everywhere, and writes nothing). Stored in
// <config>/tableau-relais/: profils.json + one settings file per profile.
const dossierProfils = () => path.join(dossierClaude(), 'tableau-relais');
const fichierSettings = (id) => path.join(dossierProfils(), `profil-${id}.settings.json`);

export function profils() {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dossierProfils(), 'profils.json'), 'utf8'));
    return Array.isArray(l) ? l.filter((p) => /^[a-z0-9]{8}$/.test(p?.id || '')) : [];
  } catch { return []; }
}

function nettoyerProfil(p) {
  const nom = String(p?.nom || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  if (!nom) return null;
  const plugins = {};
  for (const [id, v] of Object.entries(p?.plugins || {})) if (ID_PLUGIN.test(id) && typeof v === 'boolean') plugins[id] = v;
  return { nom, plugins };
}

export function enregistrerProfil(p) {
  const propre = nettoyerProfil(p);
  if (!propre) return { ok: false, message: tr({ fr: 'Donne un nom au profil.', en: 'Give the profile a name.' }) };
  const liste = profils();
  const id = /^[a-z0-9]{8}$/.test(p?.id || '') && liste.some((x) => x.id === p.id) ? p.id : crypto.randomBytes(4).toString('hex');
  const profil = { id, ...propre };
  const nouvelle = [...liste.filter((x) => x.id !== id), profil];
  fs.mkdirSync(dossierProfils(), { recursive: true });
  fs.writeFileSync(path.join(dossierProfils(), 'profils.json'), JSON.stringify(nouvelle, null, 2));
  fs.writeFileSync(fichierSettings(id), JSON.stringify({ enabledPlugins: profil.plugins }, null, 2));
  return { ok: true, profil, message: tr({ fr: `Profil « ${profil.nom} » enregistré.`, en: `Profile "${profil.nom}" saved.` }) };
}

const profilInconnu = () => ({ ok: false, message: tr({ fr: 'Profil inconnu.', en: 'Unknown profile.' }) });
export function supprimerProfil(id) {
  const liste = profils();
  if (!liste.some((x) => x.id === id)) return profilInconnu();
  fs.writeFileSync(path.join(dossierProfils(), 'profils.json'), JSON.stringify(liste.filter((x) => x.id !== id), null, 2));
  fs.rmSync(fichierSettings(id), { force: true });
  return { ok: true, message: tr({ fr: 'Profil supprimé.', en: 'Profile deleted.' }) };
}

export const commandeProfil = (id) => `claude --settings "${fichierSettings(id)}"`;

// Opens Claude Code in its own console window, in `projet`, with the profile applied to that session only.
export function lancerProfil({ id, projet }) {
  const p = profils().find((x) => x.id === id);
  if (!p) return profilInconnu();
  const v = validerProjet(projet);
  if (!v.ok) return { ok: false, message: v.raison };
  fs.writeFileSync(fichierSettings(id), JSON.stringify({ enabledPlugins: p.plugins }, null, 2));
  const prog = programme('claude');
  if (!prog || prog.cmd) return { ok: false, message: tr({ fr: 'claude.exe introuvable : copie la commande et lance-la dans ton terminal.', en: 'claude.exe not found: copy the command and run it in your terminal.' }) };
  const enfant = spawn(prog.fichier, [...prog.prefixe, '--settings', fichierSettings(id)], { cwd: v.dossier, detached: true, stdio: 'ignore', windowsHide: !!process.env.TABLEAU_CLAUDE }); // tests: no window
  enfant.on('error', () => {});
  enfant.unref();
  return { ok: true, message: tr({ fr: `Claude Code s'ouvre dans ${v.dossier} avec le profil « ${p.nom} ».`, en: `Claude Code is opening in ${v.dossier} with the "${p.nom}" profile.` }) };
}
