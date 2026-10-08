// Every download / temporary file of the dev tools (Electron binary, electron-builder tools, npm,
// %TEMP%) goes to <repo>/.caches, never to C:. A variable already set by the caller is
// kept, except TEMP/TMP when they point to C:. Used by npm start / test:fumee / test:exe / construire.
// `npm install` itself runs before this file exists in node_modules: give it the caches by hand (PowerShell):
//   $c='D:\claude-relais\.caches'; $env:npm_config_cache="$c\npm"; $env:electron_config_cache="$c\electron";
//   $env:TEMP="$c\tmp"; $env:TMP="$c\tmp"; npm install
// (Electron 44 downloads its binary on first use, into electron_config_cache, not during npm install.)
import fs from 'node:fs';
import path from 'node:path';

export const bureau = path.resolve(import.meta.dirname, '..');
export const depot = path.resolve(bureau, '..', '..');

export function envCaches(base = process.env) {
  const caches = path.join(depot, '.caches');
  const env = { ...base };
  const parDefaut = {
    ELECTRON_CACHE: path.join(caches, 'electron'),
    electron_config_cache: path.join(caches, 'electron'),
    ELECTRON_BUILDER_CACHE: path.join(caches, 'electron-builder'),
    npm_config_cache: path.join(caches, 'npm'),
    TEMP: path.join(caches, 'tmp'),
    TMP: path.join(caches, 'tmp'),
  };
  for (const [k, v] of Object.entries(parDefaut)) {
    if (!env[k] || (['TEMP', 'TMP'].includes(k) && /^c:/i.test(env[k]))) env[k] = v;
  }
  for (const k of ['ELECTRON_CACHE', 'ELECTRON_BUILDER_CACHE', 'TEMP']) fs.mkdirSync(env[k], { recursive: true });
  return env;
}

// Path of the Electron binary (downloaded into .caches/electron on first use if missing).
export async function cheminElectron() {
  Object.assign(process.env, envCaches());
  return (await import('electron')).default;
}
