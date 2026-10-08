// Security test of the BUILT app (dist/win-unpacked): code planted on disk is never executed, and the
// repo is only read as data. Everything happens in <repo>/.caches/piege-<time> (on D:), deleted after.
//   1. a fake repo "piege" holds tableau/serveur.mjs, tableau/catalogue.mjs and a plugin hook that would
//      each create a witness file if they ran, plus a valid .claude-plugin/marketplace.json;
//   2. the built app is copied INTO it (piege/tableau/bureau/dist/win-unpacked), so the trap sits in
//      parent folders of the exe;
//   3. the copy runs in test mode (RELAIS_BUREAU_TEST=1) with several RELAIS_DEPOT values, and writes a
//      JSON report (served file, data repo, Skills list).
// Usage: npm run test:piege   (after npm run construire)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bureau, depot as vraiDepot, envCaches } from './caches.mjs';

const source = path.join(bureau, 'dist', 'win-unpacked');
if (!fs.existsSync(path.join(source, 'Relais.exe'))) { console.error(`Introuvable : ${source}\\Relais.exe (npm run construire d'abord)`); process.exit(1); }

const piege = path.join(vraiDepot, '.caches', `piege-${Date.now()}`);
const temoin = path.join(piege, 'TEMOIN-code-execute.txt');
const ecrire = (rel, contenu) => { const f = path.join(piege, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, contenu); };
const codePiege = (nom) => `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(temoin)}, ${JSON.stringify(nom)} + ' exécuté\\n');
export function demarrerServeur() { fs.appendFileSync(${JSON.stringify(temoin)}, 'demarrerServeur piégé\\n'); return new Promise(() => {}); }
export function catalogue() { return []; }
export function validerDepot() { return { ok: false }; }
`;
ecrire('tableau/serveur.mjs', codePiege('tableau/serveur.mjs'));
ecrire('tableau/catalogue.mjs', codePiege('tableau/catalogue.mjs'));
ecrire('tableau/analyse.mjs', codePiege('tableau/analyse.mjs'));
ecrire('.claude-plugin/marketplace.json', JSON.stringify({ name: 'piege', owner: { name: 'x' }, plugins: [{ name: 'piege-demo', source: './plugins/piege-demo' }] }));
ecrire('plugins/piege-demo/.claude-plugin/plugin.json', JSON.stringify({ name: 'piege-demo', version: '0.0.1' }));
ecrire('plugins/piege-demo/scripts/hook.mjs', codePiege('plugins/piege-demo/scripts/hook.mjs'));
ecrire('plugins/piege-demo/hooks/hooks.json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node hook.mjs' }] }] } }));

const copie = path.join(piege, 'tableau', 'bureau', 'dist', 'win-unpacked');
console.log(`Copie de l'appli construite dans ${copie}…`);
fs.cpSync(source, copie, { recursive: true, filter: (s) => !/[\\/]donnees(-test)?$/.test(s) });
const exe = path.join(copie, 'Relais.exe');

let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${detail ? ' — ' + detail : ''}`); };

function lancer(nom, depot, autres = {}) {
  const rapport = path.join(piege, `rapport-${nom}.json`);
  const env = { ...envCaches(), RELAIS_BUREAU_TEST: '1', RELAIS_BUREAU_TEST_RAPPORT: rapport };
  delete env.RELAIS_DEPOT;
  if (depot !== undefined) env.RELAIS_DEPOT = depot;
  Object.assign(env, autres);
  return new Promise((resoudre) => {
    const enfant = spawn(exe, [], { cwd: copie, env, stdio: 'ignore' });
    const garde = setTimeout(() => enfant.kill(), 40000);
    enfant.on('exit', (code) => {
      clearTimeout(garde);
      let r = null;
      try { r = JSON.parse(fs.readFileSync(rapport, 'utf8')); } catch { /* no report */ }
      resoudre({ code, r });
    });
  });
}
const sansTemoin = () => !fs.existsSync(temoin);
const contenuTemoin = () => (fs.existsSync(temoin) ? fs.readFileSync(temoin, 'utf8').trim().replace(/\n/g, ' | ') : '');
const dansAsar = (r) => /[\\/]resources[\\/]app\.asar[\\/]serveur\.mjs$/.test(r?.serveur || '') && r.serveur.startsWith(copie);

try {
  // A. no RELAIS_DEPOT: trap in the exe's parent folders; data repo = depot.json embedded at build time.
  const a = await lancer('a');
  verif('A. piège dans les dossiers parents : code piégé jamais exécuté', sansTemoin(), contenuTemoin());
  verif('A. code 0 et serveur = copie intégrée (app.asar)', a.code === 0 && dansAsar(a.r), `code ${a.code}, serveur ${a.r?.serveur}`);
  verif('A. Skills lus dans le dépôt noté à la construction', a.r?.depot?.toLowerCase() === vraiDepot.toLowerCase() && ['relais', 'avocat'].every((n) => a.r.skills.includes(n)), JSON.stringify(a.r?.skills));

  // B. RELAIS_DEPOT = the trap folder: its data is read (plugin listed), its code is not run.
  const b = await lancer('b', piege);
  verif('B. RELAIS_DEPOT = dossier piégé : code jamais exécuté', sansTemoin(), contenuTemoin());
  verif('B. ses données seulement sont lues (plugin piege-demo listé)', b.code === 0 && dansAsar(b.r) && JSON.stringify(b.r?.skills) === '["piege-demo"]', JSON.stringify(b.r?.skills));

  // C. RELAIS_DEPOT = the real repo: Skills tab works.
  const c = await lancer('c', vraiDepot);
  verif('C. RELAIS_DEPOT = vrai dépôt : onglet Skills rempli', c.code === 0 && ['relais', 'avocat'].every((n) => c.r?.skills.includes(n)), JSON.stringify(c.r?.skills));

  // D / E. network path / relative path in RELAIS_DEPOT: refused (reason reported), next candidate used.
  const reseau = `\\\\localhost\\${vraiDepot[0]}$\\${vraiDepot.slice(3)}`;
  const d = await lancer('d', reseau);
  verif('D. chemin réseau refusé, candidat suivant utilisé', d.code === 0 && /réseau|network/i.test(d.r?.raison) && d.r.depot?.toLowerCase() === vraiDepot.toLowerCase(), `${d.r?.raison} -> ${d.r?.depot}`);
  const e = await lancer('e', 'claude-relais');
  verif('E. chemin relatif refusé, candidat suivant utilisé', e.code === 0 && /absolu|absolute/i.test(e.r?.raison) && e.r.depot?.toLowerCase() === vraiDepot.toLowerCase(), `${e.r?.raison} -> ${e.r?.depot}`);

  // F. PC without the repo (test switch) and a refused RELAIS_DEPOT: the catalogue embedded in the app
  //    (resources/skills, data only, no tests copied) fills the Skills tab.
  const f = await lancer('f', reseau, { RELAIS_BUREAU_TEST_SANS_DEPOT: '1' });
  const integre = path.join(copie, 'resources', 'skills');
  verif('F. sans dépôt : catalogue embarqué utilisé', f.code === 0 && f.r?.depot === integre && ['relais', 'avocat'].every((n) => f.r.skills.includes(n)), `${f.r?.depot} ${JSON.stringify(f.r?.skills)}`);
  const testsCopies = fs.readdirSync(integre, { recursive: true }).filter((x) => /tester\.mjs$/.test(x));
  verif('F. catalogue embarqué sans les tester.mjs, profil hors C:', testsCopies.length === 0 && f.r.userData.startsWith(copie), `${testsCopies.join(',')} ${f.r?.userData}`);
  verif('Aucun code piégé exécuté sur l\'ensemble des lancements', sansTemoin(), contenuTemoin());
} finally {
  fs.rmSync(piege, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
}
console.log(`\n${ok} réussis, ${ko} échoués (dossier piège supprimé)`);
process.exit(ko ? 1 : 0);
