// Smoke test: starts the app with RELAIS_BUREAU_TEST=1 (it loads the dashboard, checks the page title,
// quits with 0 if OK) and returns its exit code.
//   node outils/fumee.mjs           -> dev version (electron .)
//   node outils/fumee.mjs --exe     -> built version (dist/win-unpacked/Relais.exe)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bureau, cheminElectron, envCaches } from './caches.mjs';

const exe = path.join(bureau, 'dist', 'win-unpacked', 'Relais.exe');
const versionConstruite = process.argv.includes('--exe');
if (versionConstruite && !fs.existsSync(exe)) { console.error(`Introuvable : ${exe} (lance d'abord npm run construire)`); process.exit(1); }

const [cmd, args] = versionConstruite ? [exe, []] : [await cheminElectron(), ['.']];
const debut = Date.now();
const enfant = spawn(cmd, args, { cwd: bureau, stdio: 'inherit', env: { ...envCaches(), RELAIS_BUREAU_TEST: '1' } });
const garde = setTimeout(() => { console.error('Test fumée : pas de réponse en 40 s.'); enfant.kill(); process.exit(1); }, 40000);
enfant.on('exit', (code) => {
  clearTimeout(garde);
  console.log(`Test fumée (${versionConstruite ? 'Relais.exe' : 'electron .'}) : code ${code} en ${((Date.now() - debut) / 1000).toFixed(1)} s -> ${code === 0 ? 'OK' : 'ÉCHEC'}`);
  process.exit(code === 0 ? 0 : 1);
});
