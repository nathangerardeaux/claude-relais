// Relais desktop app: its own window (no browser UI) around the local dashboard server.
// The server runs INSIDE this process on 127.0.0.1, on a free port chosen by the OS.
// Dev: `npm start` in tableau/bureau. Smoke test: `npm run test:fumee` (RELAIS_BUREAU_TEST=1).
//
// Code: ONLY the app's own files. The server is imported statically from '../serveur.mjs', i.e.
// tableau/serveur.mjs in dev, and the copy embedded in app.asar once built (same layout: asar root =
// tableau/, this file = bureau/main.mjs). No file found on disk (parent folders, RELAIS_DEPOT...) is
// ever imported: a planted serveur.mjs next to a copied exe cannot run.
// Data: the Skills tab READS .claude-plugin/marketplace.json and plugins/ from the first valid of:
// RELAIS_DEPOT, the repo recorded at build time (depot.json embedded in the app), (dev) the repo this
// file sits in, then the copy of the catalogue embedded in the app (resources/skills: users without the
// repo; an app update brings the new skills). Each path is validated by catalogue.mjs.
import { app, BrowserWindow, Menu, dialog, nativeTheme, screen, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { demarrerServeur } from '../serveur.mjs';
import { catalogue, validerDepot } from '../catalogue.mjs';
import { creerMisesAJour } from './mises-a-jour.mjs';
import { tr } from '../langue.mjs';

const ici = import.meta.dirname;
const TEST = process.env.RELAIS_BUREAU_TEST === '1';
const TITRES_ATTENDUS = ['Tableau relais', 'Relais dashboard']; // <title> of public/index.html, then app.titre (fr / en)
const ID_APPLI = 'fr.nybo.relais';
const fichierServeur = path.resolve(ici, '..', 'serveur.mjs'); // shown in reports only, never imported by path

// ---------------------------------------------------------------- data (read only)
function depotEnregistre() {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ici, 'depot.json'), 'utf8')).depot; // inside the app (asar)
    return typeof d === 'string' && d ? d : null;
  } catch { return null; }
}
// Test only: behave as on a PC without the repo (outils/tester-piege.mjs checks the embedded catalogue).
const SANS_DEPOT = TEST && process.env.RELAIS_BUREAU_TEST_SANS_DEPOT === '1';
const depots = [
  process.env.RELAIS_DEPOT || null,
  SANS_DEPOT ? null : depotEnregistre(),
  SANS_DEPOT || app.isPackaged ? null : path.resolve(ici, '..', '..'),
].filter(Boolean);
const catalogueIntegre = app.isPackaged ? path.join(process.resourcesPath, 'skills') : null;
const candidats = [...depots, catalogueIntegre].filter(Boolean);
const depot = depots.map(validerDepot).find((v) => v.ok)?.depot || null; // a real repo (the developer's PC)

// Chromium profile (cache, local storage, crash dumps), index cache and downloaded updates: on the
// repo's drive when there is a repo (nothing heavy on the system drive), else the standard place
// (%APPDATA%\Relais). Must be set before `ready` and before the single-instance lock (which lives there).
const donnees = depot ? path.join(depot, 'tableau', '.cache', TEST ? 'bureau-test' : 'bureau')
  : TEST ? path.join(path.dirname(process.execPath), 'donnees-test') : null;
if (donnees) {
  app.setPath('userData', donnees);
  app.setPath('sessionData', donnees);
  app.setPath('crashDumps', path.join(donnees, 'Crashpad'));
  app.setPath('logs', path.join(donnees, 'logs'));
}
// The embedded server sits in a read-only app.asar: its index cache goes with the profile.
process.env.TABLEAU_CACHE ||= path.join(app.getPath('userData'), 'index.json');

app.setAppUserModelId(ID_APPLI); // taskbar grouping; shortcuts made by the installer carry the same id
Menu.setApplicationMenu(null);

let fenetre = null;
let serveur = null;   // { url, port, fermer, depot }
let origine = '';     // http://127.0.0.1:<port>

const memeOrigine = (u) => { try { return !!origine && new URL(u).origin === origine; } catch { return false; } };

let arret = null;
function arreterServeur() {
  arret ||= Promise.race([serveur ? serveur.fermer() : Promise.resolve(), new Promise((r) => setTimeout(r, 2000))]);
  return arret;
}

function echec(message) {
  console.error(`Relais : ${message}`);
  if (!TEST) dialog.showErrorBox('Relais', message);
  app.exit(1);
}

// ---------------------------------------------------------------- Paramètres page (/api/bureau/*)
// Start with Windows: the same HKCU\...\Run value (ID_APPLI = "<exe>") as the installer's
// checkbox, so both talk about one setting. Only for the installed app (not dev, not the bare folder).
const demarrageDisponible = app.isPackaged && process.platform === 'win32';
function etatDemarrage() {
  if (!demarrageDisponible) return { actif: false, disponible: false };
  return { actif: !!app.getLoginItemSettings().openAtLogin, disponible: true };
}
const majs = creerMisesAJour({
  cache: donnees && depot ? path.join(donnees, 'mises-a-jour') : undefined,
  avantInstallation: () => arreterServeur(),
  automatique: !TEST,
});
const etatBureau = () => ({ version: app.getVersion(), empaquete: app.isPackaged, demarrage: etatDemarrage(), maj: majs.etat() });
const bureau = {
  etat: etatBureau,
  demarrage: (actif) => {
    if (demarrageDisponible) app.setLoginItemSettings({ openAtLogin: actif, name: ID_APPLI });
    return etatBureau();
  },
  verifierMaj: async () => { await majs.verifier(); return etatBureau(); },
  telechargerMaj: () => { majs.telecharger(); return etatBureau(); },
  installerMaj: () => majs.installer(),
};

// Test mode: optional JSON report (used by outils/tester-piege.mjs and the install test).
function ecrireRapport(extra) {
  const f = process.env.RELAIS_BUREAU_TEST_RAPPORT;
  if (!f) return;
  let skills = [];
  try { skills = catalogue().map((s) => s.nom); } catch { /* stays empty */ }
  try {
    fs.writeFileSync(f, JSON.stringify({ ...extra, serveur: fichierServeur, execPath: process.execPath, depot: serveur?.depot?.depot || null,
      raison: serveur?.depot?.raison || '', skills, userData: app.getPath('userData'), bureau: etatBureau() }, null, 2));
  } catch { /* the exit code still tells */ }
}

// ---------------------------------------------------------------- security, for every web page of the app
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));                     // no pop-up, no new window
  wc.on('will-navigate', (e, url) => { if (!memeOrigine(url)) e.preventDefault(); });
  wc.on('will-redirect', (e, url) => { if (!memeOrigine(url)) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
});

function verrouillerSession() {
  const ses = session.defaultSession;
  // Only permission granted: writing to the clipboard (the "Copier" buttons), and only for the dashboard.
  ses.setPermissionRequestHandler((wc, permission, rappel, details) => {
    rappel(permission === 'clipboard-sanitized-write' && memeOrigine(details?.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, origineDemande) => permission === 'clipboard-sanitized-write' && memeOrigine(origineDemande));
  ses.on('will-download', (e) => e.preventDefault());
  // Defence in depth on top of the server's CSP: the page reaches nothing but the local server
  // (updates are fetched by the main process, not by the page).
  ses.webRequest.onBeforeRequest((details, rappel) => {
    const ok = memeOrigine(details.url) || /^(data|devtools):/.test(details.url);
    rappel({ cancel: !ok });
  });
}

// Test of the update route from the page itself (same fetch, headers and checks as a click).
const TEST_MAJ = `(async () => {
  const r = await fetch('/api/bureau/maj/verifier', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relais': '1' }, body: '{}' });
  let e = await r.json().catch(() => ({}));
  for (let i = 0; i < 40 && e.maj && e.maj.statut === 'verification'; i++) { await new Promise((ok) => setTimeout(ok, 500)); e = await (await fetch('/api/bureau/etat')).json(); }
  const sansEntete = (await fetch('/api/bureau/maj/verifier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status;
  return { code: r.status, statut: e.maj && e.maj.statut, message: e.maj && e.maj.message, sansEntete };
})()`;

// ---------------------------------------------------------------- window
function creerFenetre() {
  const zone = screen.getPrimaryDisplay().workAreaSize;
  fenetre = new BrowserWindow({
    width: Math.min(1400, Math.round(zone.width * 0.92)),
    height: Math.min(900, Math.round(zone.height * 0.92)),
    minWidth: 960,
    minHeight: 600,
    title: 'Relais',
    icon: path.join(ici, 'icone', 'relais.ico'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121211' : '#f3f2ef', // --fond in style.css (dark / light)
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,          // the spellchecker would download dictionaries
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });
  fenetre.on('page-title-updated', (e) => e.preventDefault()); // keep « Relais »
  fenetre.once('ready-to-show', () => { if (!TEST) fenetre.show(); });
  fenetre.on('closed', () => { fenetre = null; });

  if (TEST) {
    const delai = setTimeout(() => echec('test fumée : délai de 30 s dépassé.'), 30000);
    fenetre.webContents.once('did-fail-load', (_e, code, desc) => { clearTimeout(delai); echec(`test fumée : chargement impossible (${code} ${desc}).`); });
    fenetre.webContents.once('did-finish-load', async () => {
      let titre = '';
      let majTest = null;
      try { titre = await fenetre.webContents.executeJavaScript('document.title'); } catch { /* stays empty */ }
      if (process.env.RELAIS_BUREAU_TEST_MAJ === '1') {
        try { majTest = await fenetre.webContents.executeJavaScript(TEST_MAJ); } catch (err) { majTest = { erreur: String(err?.message || err) }; }
      }
      if (process.env.RELAIS_BUREAU_TEST_CAPTURE) { // test only: picture of the Paramètres page
        try {
          await fenetre.webContents.executeJavaScript(`new Promise((ok) => { const t = setInterval(() => { const b = document.querySelector('#nav-parametres'); if (b && !b.hidden && document.querySelector('#connexion').hidden) { clearInterval(t); b.click(); setTimeout(ok, 800); } }, 200); setTimeout(ok, 8000); })`);
          fs.writeFileSync(process.env.RELAIS_BUREAU_TEST_CAPTURE, (await fenetre.webContents.capturePage()).toPNG());
        } catch { /* no picture */ }
      }
      clearTimeout(delai);
      const ok = TITRES_ATTENDUS.includes(titre);
      ecrireRapport({ titre, majTest });
      console.log(`test fumée : titre « ${titre} » : ${ok ? 'OK' : 'ÉCHEC'} (serveur : ${fichierServeur}, données Skills : ${serveur?.depot?.depot || 'aucune'})${majTest ? ` maj : ${JSON.stringify(majTest)}` : ''}`);
      await arreterServeur();
      app.exit(ok ? 0 : 1);
    });
  }
  fenetre.loadURL(serveur.url);
}

async function lancer() {
  // System language for the embedded server (langue.mjs): French or English, read once Electron is ready.
  try { process.env.RELAIS_LANGUE ||= app.getPreferredSystemLanguages()[0] || app.getLocale(); } catch { /* langue.mjs falls back */ }
  try {
    serveur = await demarrerServeur({ port: 0, ouvrirNavigateur: false, journal: (t) => console.log(t), depot: candidats, bureau });
  } catch (err) {
    return echec(tr({ fr: `Impossible de démarrer le serveur du tableau : ${err?.message || err}`, en: `Could not start the dashboard server: ${err?.message || err}` }));
  }
  origine = new URL(serveur.url).origin;
  verrouillerSession();
  creerFenetre();
  const d = serveur.depot;
  if (!d?.ok) {
    const message = tr({
      fr: `${d?.raison || 'Aucun catalogue de skills trouvé.'}\n\nLe tableau fonctionne (statistiques OK) mais l'onglet Skills reste vide.\nPour le remplir : définis RELAIS_DEPOT avec le chemin local du dépôt (ex. D:\\claude-relais), ou réinstalle Relais.`,
      en: `${d?.raison || 'No skills catalogue found.'}\n\nThe dashboard works (statistics OK) but the Skills tab stays empty.\nTo fill it: set RELAIS_DEPOT to the local path of the repo (e.g. D:\\claude-relais), or reinstall Relais.`,
    });
    console.error(`Relais : ${message}`);
    if (!TEST) fenetre.once('show', () => dialog.showMessageBox(fenetre, { type: 'warning', title: 'Relais', message: tr({ fr: 'Catalogue des skills introuvable', en: 'Skills catalogue not found' }), detail: message }));
  } else {
    console.log(`Relais : données Skills lues dans ${d.depot}${d.raison ? ` (refusés avant : ${d.raison})` : ''}, profil ${app.getPath('userData')}`);
  }
}

// ---------------------------------------------------------------- life cycle
// Single instance: launching Relais again brings the existing window to the front. (Not in test mode:
// a test must not be swallowed by a Relais already open; it uses its own profile anyway.)
if (!TEST && !app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.show();
    fenetre.focus();
  });
  app.on('window-all-closed', async () => { await arreterServeur(); app.quit(); }); // closing the window = quit
  app.on('before-quit', () => { arreterServeur(); });
  app.whenReady().then(lancer);
}
