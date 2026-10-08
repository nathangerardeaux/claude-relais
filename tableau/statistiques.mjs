// Anonymous usage statistics of the desktop app, OPT-IN. Contract: docs/statistiques.md (v1).
// Nothing is counted nor sent until the user answered "yes" (reponse === true); "no" or no answer = nothing.
// Used by the Electron main process only (tableau/bureau/main.mjs): the command-line dashboard never
// asks and never sends. The plugins send nothing: this file reads their state on disk.
// Storage: one JSON file chosen by the caller (the app's own profile folder, which survives updates):
//   { v: 1, reponse: null | true | false, id: '<uuid v4>', jours: { 'YYYY-MM-DD': { ouvertures, sec, onglets, envoye } } }
// Days are local dates, kept 31 days at most.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dossierClaude } from './analyse.mjs';
import { catalogue } from './catalogue.mjs';
import { verifierNode, versionClaude } from './gestion.mjs';
import { langueSysteme } from './langue.mjs';

export const URL_STATS = 'https://api.nybo.fr/api/relais/stats';
export const ONGLETS = ['vue', 'conversations', 'skills', 'gestion', 'memoire', 'avocat', 'parametres'];
export const PLUGINS = ['relais', 'avocat', 'images'];
export const JOURS_GARDES = 31;
const DELAI_ENVOI = 60e3;            // first send, after launch
const PERIODE_ENVOI = 24 * 3600e3;   // then every 24 h while open
const PERIODE_COMPTAGE = 60e3;       // foreground time is added up every minute
const SEGMENT_MAX = 3 * 60e3;        // a longer gap (PC asleep, frozen timers) counts one minute only
const DELAI_RESEAU = 10e3;
const MAX_ONGLET = 10000;
const MAX_OUVERTURES = 1000;
const MAX_RELAIS = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^[0-9A-Za-z.+-]*$/;
const SYSTEME = /^[0-9A-Za-z. ()_+-]*$/;
// A relay written by the relais plugin: auto_<session>.md (v2) or YYYY-MM-DD_HHhMM_<topic>.md (v1),
// archived as .repris.md once reloaded. Not a-ranger*.md (proposals), not the .etat folder.
const FICHIER_RELAIS = /^(?:auto_[\w-]+|\d{4}-\d{2}-\d{2}_\d{2}h\d{2}_.+?)(?:\.repris)?\.md$/;

const entier = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
// Text field of the payload: forbidden characters dropped, 40 characters at most.
const nettoyer = (v, interdit) => String(v ?? '').replace(interdit, '').slice(0, 40);
const SANS_VERSION = /[^0-9A-Za-z.+-]/g;
const SANS_SYSTEME = /[^0-9A-Za-z. ()_+-]/g;

// Local date 'YYYY-MM-DD' of a timestamp (ms).
export function cleJour(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const debutJour = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const jourSuivant = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };

// [[date, seconds], ...] of the time between two timestamps, cut at local midnights.
export function repartirSecondes(debut, fin) {
  const res = [];
  for (let t = debut; t < fin;) {
    const bord = Math.min(fin, jourSuivant(t));
    res.push([cleJour(t), (bord - t) / 1000]);
    t = bord;
  }
  return res;
}

// Number of relays written in the last 7 days in `dossier` (the plugin's relais folder).
export function compterRelais(dossier, maintenant = Date.now()) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(dossier)) {
      if (!FICHIER_RELAIS.test(f)) continue;
      try { if (fs.statSync(path.join(dossier, f)).mtimeMs >= maintenant - 7 * 864e5) n += 1; } catch { /* gone */ }
    }
  } catch { /* no folder = no relay */ }
  return Math.min(n, MAX_RELAIS);
}
const dossierRelais = () => process.env.RELAIS_DOSSIER || path.join(dossierClaude(), 'relais'); // same rule as the plugin

// Same checks as the server (docs/statistiques.md). -> '' when valid, else the reason.
export function verifierCharge(c, maintenant = Date.now()) {
  const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const cles = (x, permises) => Object.keys(x).every((k) => permises.includes(k));
  if (!objet(c) || !cles(c, ['v', 'id', 'app', 'os', 'claude', 'node', 'langue', 'plugins', 'jours'])) return 'racine';
  if (c.v !== 1) return 'v';
  if (typeof c.id !== 'string' || !UUID.test(c.id)) return 'id';
  for (const k of ['app', 'claude', 'node']) if (typeof c[k] !== 'string' || c[k].length > 40 || !VERSION.test(c[k])) return k;
  if (typeof c.os !== 'string' || c.os.length > 40 || !SYSTEME.test(c.os)) return 'os';
  if (c.langue !== 'fr' && c.langue !== 'en') return 'langue';
  if (!objet(c.plugins) || !cles(c.plugins, PLUGINS)) return 'plugins';
  for (const [nom, p] of Object.entries(c.plugins)) {
    if (!objet(p) || !cles(p, ['installe', 'version', ...(nom === 'relais' ? ['relais7j'] : []), ...(nom === 'avocat' ? ['actif'] : [])])) return `plugins.${nom}`;
    if (typeof p.installe !== 'boolean' || typeof p.version !== 'string' || p.version.length > 40 || !VERSION.test(p.version)) return `plugins.${nom}`;
    if (nom === 'relais' && !(Number.isInteger(p.relais7j) && p.relais7j >= 0 && p.relais7j <= MAX_RELAIS)) return 'relais7j';
    if (nom === 'avocat' && typeof p.actif !== 'boolean') return 'actif';
  }
  if (!Array.isArray(c.jours) || c.jours.length > JOURS_GARDES) return 'jours';
  const vus = new Set();
  const n = new Date(maintenant);
  const aujUtc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); // not older than 40 days, not after tomorrow (UTC)
  for (const j of c.jours) {
    if (!objet(j) || !cles(j, ['date', 'ouvertures', 'minutes', 'onglets'])) return 'jour';
    if (typeof j.date !== 'string' || !DATE.test(j.date) || vus.has(j.date)) return 'date';
    vus.add(j.date);
    const ms = Date.parse(`${j.date}T00:00:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== j.date || ms < aujUtc - 40 * 864e5 || ms > aujUtc + 864e5) return 'date';
    if (!(Number.isInteger(j.ouvertures) && j.ouvertures >= 0 && j.ouvertures <= MAX_OUVERTURES)) return 'ouvertures';
    if (!(Number.isInteger(j.minutes) && j.minutes >= 0 && j.minutes <= 1440)) return 'minutes';
    if (!objet(j.onglets) || !cles(j.onglets, ONGLETS)) return 'onglets';
    if (!Object.values(j.onglets).every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_ONGLET)) return 'onglets';
  }
  return '';
}

/**
 * @param {object} o
 * @param {string} o.fichier JSON file holding the answer, the id and the counters
 * @param {string} [o.version] version of the app ('' = unknown)
 * @param {boolean} [o.desactive] true = never asks, counts nor sends (tests, smoke test)
 * @param {() => number} [o.maintenant] clock (ms), replaced in the tests
 * @param {(url: string, options: object) => Promise<{status: number}>} [o.requete] fetch, replaced in the tests
 * @param {() => string} [o.url] where to POST; default RELAIS_STATS_URL or the fixed URL
 * @param {object} [o.sondes] { claude(), node(), plugins(), relais7j(), avocat() }: what the app can read on this PC
 */
export function creerStatistiques({ fichier, version = '', desactive = false, maintenant = Date.now, requete = (u, o) => fetch(u, o),
  url = () => process.env.RELAIS_STATS_URL || URL_STATS, sondes = {} } = {}) {
  const sonde = {
    claude: versionClaude,
    node: async () => (await verifierNode()).version,
    plugins: () => catalogue(),
    relais7j: () => compterRelais(dossierRelais(), maintenant()),
    avocat: () => false,
    ...sondes,
  };

  // ---------------------------------------------------------------- stored state
  const vide = () => ({ v: 1, reponse: null, id: '', jours: {} });
  const nettoyerJour = (j) => {
    const onglets = {};
    for (const k of ONGLETS) if (j?.onglets?.[k] > 0) onglets[k] = entier(j.onglets[k], MAX_ONGLET);
    return { ouvertures: entier(j?.ouvertures, MAX_OUVERTURES), sec: entier(j?.sec, 86400), onglets, envoye: j?.envoye === true };
  };
  function lire() {
    try {
      const f = JSON.parse(fs.readFileSync(fichier, 'utf8'));
      const e = vide();
      e.reponse = typeof f.reponse === 'boolean' ? f.reponse : null;
      e.id = typeof f.id === 'string' && UUID.test(f.id) ? f.id : '';
      if (e.reponse === true) for (const [d, j] of Object.entries(f.jours || {})) if (DATE.test(d)) e.jours[d] = nettoyerJour(j);
      return e;
    } catch { return vide(); }
  }
  const e = lire();
  function ecrire() {
    try {
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      const tmp = `${fichier}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(e, null, 2));
      fs.renameSync(tmp, fichier);
    } catch { /* read-only profile: counters stay in memory */ }
  }
  const actif = () => !desactive && e.reponse === true; // the only gate for counting and sending
  const etatPublic = () => ({ disponible: !desactive, reponse: desactive ? null : e.reponse });

  // At most 31 days: today and the 30 before.
  function purger() {
    const limite = cleJour(debutJour(maintenant()) - 30 * 864e5 + 3600e3 * 12); // noon, safe across DST
    for (const d of Object.keys(e.jours)) if (d < limite) delete e.jours[d];
  }
  function jour(d) {
    const j = (e.jours[d] ||= { ouvertures: 0, sec: 0, onglets: {}, envoye: false });
    j.envoye = false; // changed: has to be sent again
    return j;
  }

  // ---------------------------------------------------------------- counting
  let fenetreActive = false;  // window in the foreground now (tracked even before the answer)
  let debutFocus = null;      // start of the foreground segment being counted
  let sessionCompteee = false;

  function ajouterTemps(debut, fin) {
    for (const [d, sec] of repartirSecondes(debut, fin)) { const j = jour(d); j.sec = Math.min(86400, j.sec + sec); }
  }
  // Adds the foreground time up to now and starts a new segment.
  function cumuler() {
    purger();
    if (debutFocus === null) return;
    const fin = maintenant();
    if (fin > debutFocus) ajouterTemps(debutFocus, fin - debutFocus > SEGMENT_MAX ? debutFocus + PERIODE_COMPTAGE : fin);
    debutFocus = actif() && fenetreActive ? fin : null;
  }
  function compterOuverture() {
    if (!actif() || sessionCompteee) return;
    sessionCompteee = true;
    const j = jour(cleJour(maintenant()));
    j.ouvertures = Math.min(MAX_OUVERTURES, j.ouvertures + 1);
  }

  // ---------------------------------------------------------------- payload
  let cacheClaude = null; // { quand, valeur }: `claude --version` is not run at every preview
  async function versionDeClaude() {
    if (cacheClaude && maintenant() - cacheClaude.quand < 10 * 60e3) return cacheClaude.valeur;
    let v = '';
    try { v = String(await sonde.claude() || ''); } catch { /* unknown */ }
    cacheClaude = { quand: maintenant(), valeur: v };
    return v;
  }
  async function lirePlugins() {
    let liste = [];
    try { liste = (await sonde.plugins()) || []; } catch { /* none */ }
    const res = {};
    for (const nom of PLUGINS) {
      const p = liste.find((x) => x.nom === nom);
      res[nom] = { installe: !!p && p.etat !== 'absent', version: nettoyer(p && p.etat !== 'absent' ? p.versionInstallee : '', SANS_VERSION) };
    }
    try { res.relais.relais7j = entier(await sonde.relais7j(), MAX_RELAIS); } catch { res.relais.relais7j = 0; }
    let actif = false;
    try { actif = !!(await sonde.avocat()); } catch { /* off */ }
    res.avocat.actif = res.avocat.installe && actif;
    if (!('relais7j' in res.relais)) res.relais.relais7j = 0;
    return res;
  }
  const minutesDe = (j) => Math.min(1440, Math.round(j.sec / 60));
  const signature = (j) => JSON.stringify([j.ouvertures, minutesDe(j), j.onglets]);

  // Days to send: every day not sent yet, plus today (the server replaces a day, so resending is safe).
  function joursAEnvoyer() {
    purger();
    const auj = cleJour(maintenant());
    return Object.keys(e.jours).sort().filter((d) => d === auj || !e.jours[d].envoye)
      .filter((d) => { const j = e.jours[d]; return j.ouvertures > 0 || j.sec > 0 || Object.keys(j.onglets).length > 0; })
      .slice(-JOURS_GARDES)
      .map((d) => ({ date: d, ouvertures: Math.min(MAX_OUVERTURES, e.jours[d].ouvertures), minutes: minutesDe(e.jours[d]), onglets: { ...e.jours[d].onglets } }));
  }

  // The exact body of the next POST (also what the Settings page shows).
  async function construire() {
    cumuler();
    const [claude, node, plugins] = await Promise.all([
      versionDeClaude(),
      (async () => { try { return String(await sonde.node() || ''); } catch { return ''; } })(),
      lirePlugins(),
    ]);
    return {
      v: 1,
      id: e.id || '00000000-0000-4000-8000-000000000000',
      app: nettoyer(version, SANS_VERSION),
      os: nettoyer(os.release(), SANS_SYSTEME),
      claude: nettoyer(claude, SANS_VERSION),
      node: nettoyer(node, SANS_VERSION),
      langue: langueSysteme(),
      plugins,
      jours: actif() ? joursAEnvoyer() : [],
    };
  }

  // ---------------------------------------------------------------- network
  async function appeler(methode, adresse, corps) {
    try {
      const r = await requete(adresse, {
        method: methode, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(DELAI_RESEAU),
        ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      try { await r.arrayBuffer?.(); } catch { /* body not needed */ }
      return r.status;
    } catch { return 0; } // offline, timeout, refused: silent
  }

  let enCours = null;
  // Sends the unsent days + today. -> { envoye: boolean, jours: number } (never throws, never blocks the UI).
  function envoyer() {
    if (!actif() || !e.id) return Promise.resolve({ envoye: false, jours: 0 });
    enCours ||= (async () => {
      try {
        const charge = await construire();
        if (!charge.jours.length || verifierCharge(charge, maintenant())) return { envoye: false, jours: 0 };
        const instantanes = new Map(charge.jours.map((j) => [j.date, JSON.stringify([j.ouvertures, j.minutes, j.onglets])]));
        const statut = await appeler('POST', url(), charge);
        if (statut < 200 || statut >= 300 || !actif()) return { envoye: false, jours: 0 };
        // Past days are done unless they changed while the request was running; today stays resendable.
        const auj = cleJour(maintenant());
        for (const [d, sig] of instantanes) if (d !== auj && e.jours[d] && signature(e.jours[d]) === sig) e.jours[d].envoye = true;
        ecrire();
        return { envoye: true, jours: instantanes.size };
      } catch { return { envoye: false, jours: 0 }; }
      finally { enCours = null; }
    })();
    return enCours;
  }

  // ---------------------------------------------------------------- timers (never keep the app alive)
  let minuteurs = [];
  function arreterMinuteurs() { for (const m of minuteurs) { clearTimeout(m); clearInterval(m); } minuteurs = []; }
  function lancerMinuteurs() {
    arreterMinuteurs();
    if (!actif()) return;
    const premier = setTimeout(() => {
      envoyer();
      const rond = setInterval(() => { envoyer(); }, PERIODE_ENVOI);
      rond.unref?.();
      minuteurs.push(rond);
    }, DELAI_ENVOI);
    const battement = setInterval(() => { cumuler(); ecrire(); }, PERIODE_COMPTAGE);
    premier.unref?.(); battement.unref?.();
    minuteurs.push(premier, battement);
  }

  // ---------------------------------------------------------------- public API
  return {
    // What the page needs: is the feature available, has the user answered.
    etat: etatPublic,

    // Start of the app: counts this launch and starts the timers (only after a "yes").
    demarrer() {
      purger();
      compterOuverture();
      if (actif()) { if (fenetreActive && debutFocus === null) debutFocus = maintenant(); ecrire(); }
      lancerMinuteurs();
    },

    // The user's answer (card at first launch, or the switch in Settings). "No" erases the counters.
    repondre(accepte) {
      if (desactive || typeof accepte !== 'boolean') return etatPublic();
      cumuler();
      const dejaOui = e.reponse === true;
      e.reponse = accepte;
      if (!e.id) e.id = crypto.randomUUID();
      if (accepte && !dejaOui) {
        sessionCompteee = false; // this launch counts from now on
        compterOuverture();
        if (fenetreActive) debutFocus = maintenant();
      } else if (!accepte) {
        e.jours = {};
        debutFocus = null;
      }
      ecrire();
      lancerMinuteurs();
      return etatPublic();
    },

    // Window in the foreground (true) or not (false).
    focus(premierPlan) {
      cumuler();
      fenetreActive = !!premierPlan;
      debutFocus = actif() && fenetreActive ? maintenant() : null;
      if (actif()) ecrire();
    },

    // A tab was opened. Only the 7 keys of the contract. -> true when counted.
    onglet(cle) {
      if (!actif() || !ONGLETS.includes(cle)) return false;
      purger();
      const j = jour(cleJour(maintenant()));
      j.onglets[cle] = Math.min(MAX_ONGLET, (j.onglets[cle] || 0) + 1);
      ecrire();
      return true;
    },

    apercu: construire,
    envoyer,

    // "Delete my data from the server": DELETE /stats/:id, then a new random id and empty counters.
    // -> { ok, raison: 'ok' | 'hors-ligne' | 'refuse' }. Offline: nothing changes, the id is kept to retry.
    async supprimer() {
      if (desactive) return { ok: false, raison: 'refuse' };
      if (!e.id) return { ok: true, raison: 'ok' };
      const statut = await appeler('DELETE', `${url().replace(/\/+$/, '')}/${e.id}`);
      if (statut === 0) return { ok: false, raison: 'hors-ligne' };
      if (statut < 200 || statut >= 300) return { ok: false, raison: 'refuse' };
      e.id = crypto.randomUUID();
      e.jours = {};
      if (actif() && fenetreActive) debutFocus = maintenant();
      ecrire();
      return { ok: true, raison: 'ok' };
    },

    // Before quitting: adds the last seconds and stops the timers.
    fermer() {
      cumuler();
      if (actif()) ecrire();
      arreterMinuteurs();
    },
  };
}
