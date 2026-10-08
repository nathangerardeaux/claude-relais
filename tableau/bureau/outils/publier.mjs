// `npm run publier`: builds the NSIS installer + latest.yml + .blockmap and uploads them to a DRAFT
// GitHub release of the repo set in package.json > build.publish (nothing is visible to users until
// you publish the draft on GitHub). The token comes from the GitHub CLI at run time (`gh auth token`),
// is passed to electron-builder in GH_TOKEN only, and is never written to disk.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bureau, envCaches } from './caches.mjs';
import { construire } from './construire.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(bureau, 'package.json'), 'utf8'));
const cible = pkg.build.publish?.[0] || {};
let jeton = '';
try { jeton = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* handled below */ }
if (!jeton) { console.error('Jeton GitHub introuvable : installe GitHub CLI puis « gh auth login ».'); process.exit(1); }

console.log(`Publication de la version ${pkg.version} en BROUILLON sur github.com/${cible.owner}/${cible.repo} (releases)…`);
// The draft is created here first: when it does not exist yet, electron-builder uploads the files in
// parallel and each upload creates its own draft (two drafts for one version, seen on 1.0.0).
const tag = `v${pkg.version}`;
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const existantes = JSON.parse(gh(['api', `repos/${cible.owner}/${cible.repo}/releases`])).filter((r) => r.tag_name === tag);
if (existantes.some((r) => !r.draft)) { console.error(`La release ${tag} est déjà publiée : monte la version dans package.json.`); process.exit(1); }
if (!existantes.length) gh(['api', '-X', 'POST', `repos/${cible.owner}/${cible.repo}/releases`, '-f', `tag_name=${tag}`, '-f', `name=${pkg.version}`, '-F', 'draft=true']);
const code = await construire(['--win', 'nsis', '--x64', '--publish', 'always'], { ...envCaches(), GH_TOKEN: jeton });
jeton = '';
if (code === 0) console.log(`\nBrouillon prêt : https://github.com/${cible.owner}/${cible.repo}/releases\nRelis-le (notes de version), puis clique « Publish release » : les applis installées le proposeront.`);
process.exit(code);
