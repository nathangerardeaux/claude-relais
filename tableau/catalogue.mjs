// "Skills" catalogue: every plugin listed in this repo's .claude-plugin/marketplace.json, with what it
// contains and whether it is installed. A new utility plugin added to marketplace.json shows up here
// by itself. Install = copy into ~/.claude/skills/<name>/ (Claude Code loads it as <name>@skills-dir),
// the same method as plugins/relais/scripts/installer.mjs, which works even from an external drive.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierClaude } from './analyse.mjs';
import { tr } from './langue.mjs';

// Data root (marketplace.json + plugins/). Default: the repo this script sits in (command line,
// `node tableau/serveur.mjs`). The desktop app runs an embedded copy of this file, so it passes the repo
// path through definirDepot(): data is only READ from there (never code imported from it).
const racineScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let racineConfiguree; // undefined = not configured (default root); null = configured but refused
const racine = () => (racineConfiguree === undefined ? racineScript : racineConfiguree);

// A repo path given from outside: local absolute path (drive letter on Windows; no \\server\share,
// //server/share or \\?\ forms), holding .claude-plugin/marketplace.json.
const RESEAU = /^[\\/]{2}/;
export function validerDepot(chemin) {
  if (typeof chemin !== 'string' || !chemin.trim()) return { ok: false, raison: tr({ fr: 'Chemin du dépôt vide.', en: 'Empty repo path.' }) };
  const brut = chemin.trim();
  if (RESEAU.test(brut)) return { ok: false, raison: tr({ fr: `Chemin réseau refusé : ${brut}`, en: `Network path refused: ${brut}` }) };
  const absolu = process.platform === 'win32' ? /^[A-Za-z]:[\\/]/.test(brut) : brut.startsWith('/');
  if (!absolu) return { ok: false, raison: tr({ fr: `Chemin absolu local attendu (ex. D:\\claude-relais) : ${brut}`, en: `Local absolute path expected (e.g. D:\\claude-relais): ${brut}` }) };
  let reel;
  try { reel = fs.realpathSync.native(path.resolve(brut)); } catch { return { ok: false, raison: tr({ fr: `Dossier introuvable : ${brut}`, en: `Folder not found: ${brut}` }) }; }
  if (RESEAU.test(reel)) return { ok: false, raison: tr({ fr: `Chemin réseau refusé : ${brut} (mène à ${reel})`, en: `Network path refused: ${brut} (leads to ${reel})` }) };
  if (!fs.existsSync(path.join(reel, '.claude-plugin', 'marketplace.json'))) return { ok: false, raison: tr({ fr: `Pas de .claude-plugin\\marketplace.json dans ${reel}`, en: `No .claude-plugin\\marketplace.json in ${reel}` }) };
  return { ok: true, depot: reel };
}

// Sets the data root. `chemins`: one path or candidates in order (desktop app: RELAIS_DEPOT, the repo
// recorded at build time, then the copy of the catalogue embedded in the app); the first valid one wins,
// each is validated the same way. None valid = empty Skills tab. Returns { ok, depot?, raison, refus }.
export function definirDepot(chemins) {
  const liste = (Array.isArray(chemins) ? chemins : [chemins]).filter((c) => c !== undefined && c !== null);
  const refus = [];
  for (const c of liste.length ? liste : ['']) {
    const v = validerDepot(c);
    if (v.ok) { racineConfiguree = v.depot; return { ok: true, depot: v.depot, raison: refus.join(' / '), refus }; }
    refus.push(v.raison);
  }
  racineConfiguree = null;
  return { ok: false, raison: refus.join(' / '), refus };
}
const ELEMENTS = ['.claude-plugin', 'hooks', 'scripts', 'skills', 'agents', 'commands', 'README.md', 'README.fr.md', 'LICENSE'];
const NOM_VALIDE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const lireJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const sousDossiers = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };

function frontmatter(p) {
  try {
    const t = fs.readFileSync(p, 'utf8');
    const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const o = {};
    for (const l of m[1].split(/\r?\n/)) { const x = l.match(/^(\w[\w-]*):\s*(.*)$/); if (x) o[x[1]] = x[2].trim(); }
    return o;
  } catch { return {}; }
}

// Plugin folder inside this repo, or null (a source must never point outside the repo).
function dossierSource(source) {
  if (typeof source !== 'string' || !racine()) return null;
  const p = path.resolve(racine(), source);
  const rel = path.relative(racine(), p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return fs.existsSync(path.join(p, '.claude-plugin', 'plugin.json')) ? p : null;
}

// A plugin copied by the app (<config>/skills/<name>, loaded as <name>@skills-dir) that is ALSO installed
// from a marketplace (<name>@<marketplace>) runs its hooks twice. `ids`: plugin ids as listed by Claude Code
// (installed_plugins.json keys, or `claude plugin list --json`); `copieLocale`: the copy exists.
// -> the marketplace ids to uninstall (`claude plugin uninstall <id>`), [] when there is no double.
const ID_MARKET = /^[a-z0-9][a-z0-9._-]{0,63}@[a-z0-9][a-z0-9._-]{0,63}$/i;
export function doublonsMarketplace(nom, ids, copieLocale) {
  const liste = (Array.isArray(ids) ? ids : []).map(String);
  if (!copieLocale && !liste.includes(`${nom}@skills-dir`)) return [];
  return [...new Set(liste.filter((id) => id.startsWith(`${nom}@`) && id !== `${nom}@skills-dir` && ID_MARKET.test(id)))];
}

export function catalogue() {
  if (!racine()) return [];
  const place = lireJSON(path.join(racine(), '.claude-plugin', 'marketplace.json')) || { plugins: [] };
  const installes = lireJSON(path.join(dossierClaude(), 'plugins', 'installed_plugins.json'))?.plugins || {};
  const res = [];
  for (const p of place.plugins || []) {
    if (!NOM_VALIDE.test(String(p.name || ''))) continue;
    const dir = dossierSource(p.source);
    if (!dir) continue;
    const manifeste = lireJSON(path.join(dir, '.claude-plugin', 'plugin.json')) || {};
    const skills = sousDossiers(path.join(dir, 'skills')).map((s) => {
      const f = frontmatter(path.join(dir, 'skills', s, 'SKILL.md'));
      return { nom: f.name || s, description: f.description || '' };
    });
    let agents = [];
    try {
      agents = fs.readdirSync(path.join(dir, 'agents')).filter((f) => f.endsWith('.md'))
        .map((f) => { const x = frontmatter(path.join(dir, 'agents', f)); return { nom: x.name || f.slice(0, -3), description: x.description || '' }; });
    } catch { /* no agents */ }
    const hooks = Object.keys(lireJSON(path.join(dir, 'hooks', 'hooks.json'))?.hooks || {});
    const versionDispo = manifeste.version || p.version || '';
    const local = lireJSON(path.join(dossierClaude(), 'skills', p.name, '.claude-plugin', 'plugin.json'));
    const viaMarket = installes[`${p.name}@${place.name}`]?.[0] || null;
    let etat = 'absent';
    let versionInstallee = '';
    if (viaMarket) { etat = 'marketplace'; versionInstallee = viaMarket.version || ''; }
    else if (local) { versionInstallee = local.version || ''; etat = versionInstallee === versionDispo ? 'a-jour' : 'ancienne'; }
    const doublons = doublonsMarketplace(p.name, Object.keys(installes), !!local);
    res.push({
      nom: p.name, description: p.description || manifeste.description || '', versionDispo, versionInstallee, etat,
      skills, agents, hooks,
      doublons: doublons.map((id) => ({ id, commande: `claude plugin uninstall ${id}` })),
      dossierLocal: path.join(dossierClaude(), 'skills', p.name),
      commandes: [`/plugin marketplace add ${place.owner?.name || 'nathangerardeaux'}/claude-relais`, `/plugin install ${p.name}@${place.name}`],
    });
  }
  return res;
}

// Copies plugin `nom` into ~/.claude/skills/<nom>/. Only a name from the catalogue is accepted.
export function installer(nom) {
  const p = catalogue().find((x) => x.nom === nom);
  if (!p) return { ok: false, message: tr({ fr: 'Plugin inconnu.', en: 'Unknown plugin.' }) };
  if (p.etat === 'marketplace') return { ok: false, message: tr({ fr: 'Déjà installé par la marketplace : une 2e copie ferait tourner ses hooks deux fois.', en: 'Already installed through the marketplace: a second copy would run its hooks twice.' }) };
  const place = lireJSON(path.join(racine(), '.claude-plugin', 'marketplace.json'));
  const dir = dossierSource(place.plugins.find((x) => x.name === nom)?.source);
  if (!dir) return { ok: false, message: tr({ fr: 'Source du plugin introuvable.', en: 'Plugin source not found.' }) };
  const cible = path.join(dossierClaude(), 'skills', nom);
  for (const el of ELEMENTS) {
    const src = path.join(dir, el);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(cible, el), {
      recursive: true, force: true,
      filter: (s) => !/[\\/](tester\.mjs|\.cache)$/.test(s), // tests stay in the repo
    });
  }
  return { ok: true, message: p.etat === 'absent'
    ? tr({ fr: `Installé dans ${cible}. Redémarre Claude Code pour le charger.`, en: `Installed in ${cible}. Restart Claude Code to load it.` })
    : tr({ fr: `Mis à jour dans ${cible}. Redémarre Claude Code pour le charger.`, en: `Updated in ${cible}. Restart Claude Code to load it.` }) };
}
