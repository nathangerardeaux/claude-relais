// Claude account gate: the dashboard only opens when Claude Code is signed in on this machine, and it
// shows the account (email, plan, organisation). Everything comes from the official command
// `claude auth status`: this code never reads, stores or sends any login token.
// Note: it is a convenience gate, not a protection: the logs stay readable by anyone with access to
// this Windows session.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tr } from './langue.mjs';
import { programme } from './gestion.mjs';

const DUREE_CACHE = 60e3;
let cache = null; // { quand, compte }

function lancer(fichier, args, options) {
  return new Promise((resoudre) => {
    execFile(fichier, args, { timeout: 20000, windowsHide: true, maxBuffer: 1 << 20, ...options }, (err, stdout) => {
      resoudre({ err, stdout: String(stdout || '') });
    });
  });
}

async function authStatus() {
  // TABLEAU_CLAUDE: for tests (a fake `claude` written in Node).
  const faux = process.env.TABLEAU_CLAUDE;
  if (faux) return lancer(process.execPath, [faux, 'auth', 'status']);
  let r = await lancer('claude', ['auth', 'status']);
  // Installed through npm on Windows, `claude` is a .cmd that only a shell can start. Fixed command,
  // no user input in it.
  if (r.err?.code === 'ENOENT' && process.platform === 'win32') r = await lancer('claude auth status', [], { shell: true });
  return r;
}

// Display name only, from Claude Code's local profile (no token in that part of the file).
function nomAffiche() {
  try {
    const f = process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');
    const o = JSON.parse(fs.readFileSync(f, 'utf8')).oauthAccount || {};
    return String(o.displayName || o.fullName || '').slice(0, 80);
  } catch { return ''; }
}

const PLANS = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise', free: { fr: 'Gratuit', en: 'Free' } };

export async function compte(forcer = false) {
  if (!forcer && cache && Date.now() - cache.quand < DUREE_CACHE) return cache.compte;
  const r = await authStatus();
  let c = { connecte: false, raison: '' };
  if (r.err && !r.stdout) {
    // Not installed: no such program (ENOENT), or, on Windows where the fallback goes through cmd.exe, an exit code
    // with nothing on PATH. The page then shows how to install Claude Code instead of the sign-in steps only.
    c.introuvable = r.err.code === 'ENOENT' || !programme('claude');
    c.raison = tr(c.introuvable ? { fr: 'Claude Code est introuvable sur ce PC (commande « claude »).', en: 'Claude Code was not found on this PC ("claude" command).' }
      : { fr: 'La commande « claude auth status » a échoué.', en: 'The "claude auth status" command failed.' });
  } else {
    let s = null;
    try { s = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { /* not JSON */ }
    if (!s) c.raison = tr({ fr: 'Réponse de « claude auth status » illisible.', en: 'Unreadable answer from "claude auth status".' });
    else if (s.loggedIn !== true) c.raison = tr({ fr: 'Claude Code n\'est connecté à aucun compte.', en: 'Claude Code is not signed in to any account.' });
    else {
      c = {
        connecte: true,
        email: String(s.email || ''), nom: nomAffiche(),
        organisation: String(s.orgName || ''),
        abonnement: tr(PLANS[String(s.subscriptionType || '').toLowerCase()]) || String(s.subscriptionType || s.authMethod || ''),
        methode: String(s.authMethod || ''),
        dossierProjets: typeof s.projectsDirectory === 'string' ? s.projectsDirectory : '',
      };
    }
  }
  cache = { quand: Date.now(), compte: c };
  return c;
}
