// Updates of the desktop app (electron-updater, GitHub Releases of the repo set in package.json >
// build.publish). Never silent: a check only shows "Version X disponible"; downloading and installing
// each need a click in the Paramètres page. No downgrade, no pre-release. Offline / no release / 404:
// a calm message, never a blocking error. Security: HTTPS from the configured repo only, and the
// downloaded installer is checked against the sha512 of latest.yml before running (electron-updater).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import updater from 'electron-updater';
import { tr } from '../langue.mjs';

const { autoUpdater } = updater;
const SIX_HEURES = 6 * 3600e3;

// Messages shown in the Paramètres page, translated when read (the system language is only known once
// Electron is ready, after this module has set the first state).
const MESSAGES = {
  dev: { fr: 'Mises à jour désactivées en mode développement (application non installée).', en: 'Updates are turned off in development mode (app not installed).' },
  sansInstallateur: { fr: "Cette copie n'a pas été installée avec l'installateur de Relais : elle ne peut pas se mettre à jour toute seule.", en: 'This copy was not installed with the Relais installer: it cannot update itself.' },
  aucunePubliee: { fr: 'Aucune mise à jour publiée pour le moment.', en: 'No update has been published yet.' },
  impossible: { fr: 'Impossible de vérifier les mises à jour (hors ligne ou GitHub injoignable). Nouvel essai plus tard.', en: 'Could not check for updates (offline or GitHub unreachable). Will try again later.' },
  aJour: { fr: 'Aucune mise à jour : tu as la dernière version.', en: 'No update: you have the latest version.' },
  interrompu: { fr: 'Téléchargement interrompu : réessaie.', en: 'Download interrupted: try again.' },
  rienATelecharger: { fr: 'Aucune mise à jour téléchargée.', en: 'No update downloaded.' },
  installation: { fr: 'Installation de la mise à jour…', en: 'Installing the update…' },
};

// Text of the release notes (GitHub sends HTML): tags removed, shown as plain text by the page.
function texteNotes(notes) {
  const brut = Array.isArray(notes) ? notes.map((n) => `${n.version ? n.version + ' : ' : ''}${n.note || ''}`).join('\n\n') : String(notes || '');
  return brut.replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

// owner/repo from resources/app-update.yml (written by electron-builder from build.publish).
function lireSource() {
  try {
    const t = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const owner = t.match(/^owner:\s*(.+)$/m)?.[1].trim();
    const repo = t.match(/^repo:\s*(.+)$/m)?.[1].trim();
    return owner && repo ? `github.com/${owner}/${repo}` : null;
  } catch { return null; }
}

/**
 * @param {object} o
 * @param {string} [o.cache] folder for the downloaded installer (default: electron-updater's, in %LOCALAPPDATA%)
 * @param {() => Promise<void>} o.avantInstallation called before quitting to install (stops the server)
 * @param {boolean} [o.automatique=true] check 10 s after launch, then every 6 h
 */
export function creerMisesAJour({ cache, avantInstallation, automatique = true }) {
  const source = app.isPackaged ? lireSource() : null;
  const maj = { statut: 'inactif', cle: '', version: '', notes: '', pourcentage: 0, recu: 0, total: 0, derniere: '', source: source || '' };
  if (!app.isPackaged) Object.assign(maj, { statut: 'desactive', cle: 'dev' });
  else if (!source) Object.assign(maj, { statut: 'desactive', cle: 'sansInstallateur' });
  const actif = maj.statut !== 'desactive';

  const classer = (err) => {
    const m = String(err?.message || err || '');
    if (err?.code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' || /\b404\b|No published versions|Cannot find .*latest|latest\.yml/i.test(m)) {
      Object.assign(maj, { statut: 'aucune', cle: 'aucunePubliee' });
    } else {
      Object.assign(maj, { statut: 'impossible', cle: 'impossible' });
    }
  };

  if (actif) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.logger = null;
    if (cache) Object.defineProperty(autoUpdater.app, 'baseCachePath', { get: () => cache, configurable: true });
    autoUpdater.on('update-available', (i) => Object.assign(maj, { statut: 'disponible', version: i.version, notes: texteNotes(i.releaseNotes), cle: '' }));
    autoUpdater.on('update-not-available', () => Object.assign(maj, { statut: 'aucune', cle: 'aJour' }));
    autoUpdater.on('download-progress', (p) => Object.assign(maj, { statut: 'telechargement', pourcentage: p.percent, recu: p.transferred, total: p.total }));
    autoUpdater.on('update-downloaded', (i) => Object.assign(maj, { statut: 'pret', version: i.version, pourcentage: 100 }));
    autoUpdater.on('error', (err) => {
      if (maj.statut === 'telechargement') Object.assign(maj, { statut: 'disponible', cle: 'interrompu' });
      else if (maj.statut === 'verification') classer(err);
    });
  }

  async function verifier() {
    if (!actif || ['verification', 'telechargement', 'pret'].includes(maj.statut)) return maj;
    Object.assign(maj, { statut: 'verification', cle: '' });
    try {
      await autoUpdater.checkForUpdates();
      if (maj.statut === 'verification') Object.assign(maj, { statut: 'aucune', cle: 'aJour' });
    } catch (err) { classer(err); }
    maj.derniere = new Date().toISOString();
    return maj;
  }
  function telecharger() {
    if (!actif || maj.statut !== 'disponible') return maj;
    Object.assign(maj, { statut: 'telechargement', pourcentage: 0, recu: 0, total: 0, cle: '' });
    autoUpdater.downloadUpdate().catch(() => {
      if (maj.statut === 'telechargement') Object.assign(maj, { statut: 'disponible', cle: 'interrompu' });
    });
    return maj;
  }
  function installer() {
    if (!actif || maj.statut !== 'pret') return { ok: false, message: tr(MESSAGES.rienATelecharger) };
    // Answer the click first, then quit: installer run silently (the user has just asked for it), app reopened after.
    setTimeout(async () => { try { await avantInstallation?.(); } finally { autoUpdater.quitAndInstall(true, true); } }, 300);
    return { ok: true, message: tr(MESSAGES.installation) };
  }

  if (actif && automatique) {
    setTimeout(() => { verifier().catch(() => {}); }, 10e3).unref?.();
    setInterval(() => { verifier().catch(() => {}); }, SIX_HEURES).unref?.();
  }
  // maj.cle = a key of MESSAGES (or ''): the page gets the text, in the system language.
  const etat = () => { const { cle, ...reste } = maj; return { ...reste, message: cle ? tr(MESSAGES[cle]) : '' }; };
  return { etat, verifier: () => verifier().then(etat), telecharger: () => { telecharger(); return etat(); }, installer };
}
