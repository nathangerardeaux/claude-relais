// Test of the real installer, end to end, without leaving anything behind:
//   1. silent install (/S /currentuser /D=<repo>\.caches\test-install): no shortcut, no start with Windows;
//   2. the installed Relais.exe in test mode (RELAIS_BUREAU_TEST=1): page loads, update route answers
//      calmly with no published release, start with Windows reported off;
//   3. silent uninstall: no folder, no Run value, no Uninstall entry in HKCU, no shortcut left; the
//      Relais.lnk shortcuts that already existed (made by hand) untouched.
// TEMP/TMP point to <repo>\.caches\tmp (NSIS unpacks its plug-ins there). Usage: npm run test:installation
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bureau, depot, envCaches } from './caches.mjs';

const version = JSON.parse(fs.readFileSync(path.join(bureau, 'package.json'), 'utf8')).version;
const installateur = path.join(bureau, 'dist', `Relais-Setup-${version}.exe`);
if (!fs.existsSync(installateur)) { console.error(`Introuvable : ${installateur} (npm run construire)`); process.exit(1); }
const dossier = path.join(depot, '.caches', 'test-install');
const env = envCaches();
const ID = 'fr.nybo.relais';
const CLE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const CLE_DESINST = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${detail ? ' — ' + detail : ''}`); };
const reg = (args) => { try { return execFileSync('reg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); } catch { return ''; } };
const valeurRun = () => (reg(['query', CLE_RUN, '/v', ID]).match(/REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
// Uninstall entries of THIS install (InstallLocation = the test folder).
const entreesDesinst = () => reg(['query', CLE_DESINST, '/s', '/f', dossier, '/d']).split(/\r?\n/).filter((l) => /^HKEY_/.test(l));
const raccourcis = () => {
  const ps = "[Environment]::GetFolderPath('Desktop'); [Environment]::GetFolderPath('Programs')";
  const [bur, prog] = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
  return [path.join(bur, 'Relais.lnk'), path.join(prog, 'Relais.lnk')].map((f) => ({ f, etat: fs.existsSync(f) ? `${fs.statSync(f).size}:${fs.statSync(f).mtimeMs}` : 'absent' }));
};
const lancer = (exe, args, envX = env) => new Promise((ok2) => {
  const p = spawn(exe, args, { env: envX, stdio: 'ignore', windowsHide: true });
  const garde = setTimeout(() => p.kill(), 120000);
  p.on('exit', (code) => { clearTimeout(garde); ok2(code); });
});
const attendre = async (cond, ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (cond()) return true; await new Promise((r) => setTimeout(r, 500)); } return cond(); };
const tailleC = () => {
  const dirs = [path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Relais'), path.join(os.homedir(), 'AppData', 'Roaming', 'Relais'),
    path.join(os.homedir(), 'AppData', 'Local', 'relais-bureau-updater'), path.join(os.homedir(), 'AppData', 'Local', 'electron-builder')];
  return dirs.filter((d) => fs.existsSync(d));
};

const avant = { run: valeurRun(), raccourcis: raccourcis(), c: tailleC() };
if (fs.existsSync(dossier)) fs.rmSync(dossier, { recursive: true, force: true });
let cleAppli = '';
if (entreesDesinst().length) { console.error('Une installation de test existe déjà dans le registre : désinstalle-la d\'abord.'); process.exit(1); }

try {
  // 1. silent install
  const codeInst = await lancer(installateur, ['/S', '/currentuser', `/D=${dossier}`]);
  const exe = path.join(dossier, 'Relais.exe');
  verif('installation silencieuse : code 0 et Relais.exe présent', codeInst === 0 && fs.existsSync(exe), `code ${codeInst}`);
  verif('installation : entrée « Applications » créée (HKCU)', entreesDesinst().length === 1, entreesDesinst().join(' '));
  cleAppli = `HKCU\\Software\\${(entreesDesinst()[0] || '').split('\\').pop()}`;
  verif(`installation : clé de l'installation créée (${cleAppli})`, reg(['query', cleAppli]).includes('InstallLocation'));
  verif('installation silencieuse : pas de démarrage auto', valeurRun() === avant.run, valeurRun() || '(aucune valeur)');
  verif('installation silencieuse : aucun raccourci créé ou modifié', JSON.stringify(raccourcis()) === JSON.stringify(avant.raccourcis), JSON.stringify(raccourcis().map((r) => r.etat)));

  // 2. installed app in test mode, update route included
  const rapport = path.join(env.TEMP, `rapport-installe-${Date.now()}.json`);
  const codeApp = await lancer(exe, [], { ...env, RELAIS_BUREAU_TEST: '1', RELAIS_BUREAU_TEST_MAJ: '1', RELAIS_BUREAU_TEST_RAPPORT: rapport });
  let r = null;
  try { r = JSON.parse(fs.readFileSync(rapport, 'utf8')); fs.rmSync(rapport); } catch { /* no report */ }
  verif('appli installée, mode test : code 0, titre OK', codeApp === 0 && ['Tableau relais', 'Relais dashboard'].includes(r?.titre), `code ${codeApp}`);
  verif('appli installée : code servi depuis son app.asar', r?.serveur?.startsWith(dossier) && /app\.asar/.test(r.serveur), r?.serveur);
  verif('route de mise à jour : réponse calme sans release publiée', r?.majTest?.code === 200 && ['aucune', 'impossible'].includes(r.majTest.statut), JSON.stringify(r?.majTest));
  verif('route de mise à jour : POST sans X-Relais refusé', r?.majTest?.sansEntete === 403);
  verif('démarrage avec Windows : proposé et désactivé', r?.bureau?.demarrage?.disponible === true && r.bureau.demarrage.actif === false, JSON.stringify(r?.bureau?.demarrage));
  verif('profil de l\'appli sur D: (pas C:)', /^d:/i.test(r?.userData || ''), r?.userData);
} finally {
  // 3. silent uninstall (the uninstaller copies itself to TEMP and returns at once: wait for the result)
  const desinst = path.join(dossier, 'Uninstall Relais.exe');
  if (fs.existsSync(desinst)) await lancer(desinst, ['/S']);
  await attendre(() => !fs.existsSync(path.join(dossier, 'Relais.exe')) && entreesDesinst().length === 0, 60000);
  await attendre(() => !fs.existsSync(dossier), 10000);
}
verif('désinstallation : dossier supprimé', !fs.existsSync(dossier));
verif('désinstallation : plus d\'entrée « Applications » (HKCU)', entreesDesinst().length === 0);
verif("désinstallation : clé de l'installation supprimée",!cleAppli || reg(['query', cleAppli]) === '', cleAppli);
verif('désinstallation : valeur Run inchangée / absente', valeurRun() === avant.run, valeurRun() || '(aucune valeur)');
verif('désinstallation : raccourcis existants intacts, aucun ajouté', JSON.stringify(raccourcis()) === JSON.stringify(avant.raccourcis), JSON.stringify(raccourcis().map((x) => `${path.basename(path.dirname(x.f))}:${x.etat}`)));
const nouveauxC = tailleC().filter((d) => !avant.c.includes(d));
verif('rien de nouveau dans %LOCALAPPDATA%\\Programs\\Relais, %APPDATA%\\Relais, relais-bureau-updater, electron-builder', nouveauxC.length === 0, nouveauxC.join(', '));
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
