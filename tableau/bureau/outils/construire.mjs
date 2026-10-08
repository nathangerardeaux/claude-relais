// Builds the Windows app (electron-builder), every download / temporary file in <repo>/.caches (D:).
//   npm run construire          -> dist/Relais-Setup-<version>.exe (assisted NSIS installer) + latest.yml
//                                  + .blockmap, and dist/win-unpacked/Relais.exe
//   npm run construire:dossier  -> dist/win-unpacked/Relais.exe only (fast; this copy does not self-update)
// Never publishes anything (--publish never): publishing is `npm run publier`.
// The repo path is recorded in depot.json (embedded in the app): on this PC the Skills tab then reads
// the live repo; elsewhere the catalogue embedded in the app is used.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bureau, depot, envCaches } from './caches.mjs';

export function construire(argsCible, env = envCaches()) {
  fs.writeFileSync(path.join(bureau, 'depot.json'), JSON.stringify({ depot }, null, 2) + '\n');
  console.log(`depot.json : ${depot}`);
  // A *.nsis.7z left by an interrupted build is reused as "up to date" by electron-builder: the
  // installer would then ship an old app. Removed before every build.
  const dist = path.join(bureau, 'dist');
  for (const f of fs.existsSync(dist) ? fs.readdirSync(dist) : []) if (f.endsWith('.nsis.7z')) fs.rmSync(path.join(dist, f), { force: true });
  const cli = path.join(bureau, 'node_modules', 'electron-builder', 'cli.js');
  if (!fs.existsSync(cli)) { console.error("electron-builder absent : lance d'abord npm install (avec les caches sur D:, commande en tête de outils/caches.mjs)."); process.exit(1); }
  return new Promise((resoudre) => {
    const enfant = spawn(process.execPath, [cli, ...argsCible], { cwd: bureau, stdio: 'inherit', env });
    enfant.on('exit', (code) => resoudre(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dossier = process.argv.includes('--dossier');
  const code = await construire(['--win', dossier ? 'dir' : 'nsis', '--x64', '--publish', 'never']);
  if (code === 0) {
    const version = JSON.parse(fs.readFileSync(path.join(bureau, 'package.json'), 'utf8')).version;
    console.log(`\nConstruit : ${path.join(bureau, 'dist', 'win-unpacked', 'Relais.exe')}`);
    if (!dossier) console.log(`Installateur : ${path.join(bureau, 'dist', `Relais-Setup-${version}.exe`)}`);
  }
  process.exit(code);
}
