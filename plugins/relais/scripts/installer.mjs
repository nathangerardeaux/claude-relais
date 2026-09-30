// Fallback installer: copies the plugin into ~/.claude/skills/relais/, where Claude Code loads it by
// itself (relais@skills-dir). Only needed when the normal marketplace install is refused, e.g. when the
// plugin sits on an external or network drive (Claude Code rejects "network-shaped" locations).
// Do NOT combine with a marketplace install of the same plugin: the hooks would run twice.
// Usage: node installer.mjs [--update]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { langue } from './commun.mjs';

const FR = langue() === 'fr';
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cible = path.join(os.homedir(), '.claude', 'skills', 'relais');
const maj = process.argv.includes('--update') || process.argv.includes('--maj');

if (fs.existsSync(cible) && !maj) {
  console.log(FR ? `Déjà installé : ${cible}\nPour mettre à jour : node installer.mjs --update`
    : `Already installed: ${cible}\nTo update: node installer.mjs --update`);
  process.exit(0);
}
for (const element of ['.claude-plugin', 'hooks', 'scripts', 'skills', 'README.md', 'README.fr.md', 'LICENSE']) {
  const src = path.join(source, element);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(cible, element), { recursive: true, force: true });
}
console.log(FR
  ? `${maj ? 'Mis à jour' : 'Installé'} : ${cible}\nRedémarre Claude Code, puis vérifie : claude plugin list  →  relais@skills-dir chargé.`
  : `${maj ? 'Updated' : 'Installed'}: ${cible}\nRestart Claude Code, then check: claude plugin list  →  relais@skills-dir loaded.`);
