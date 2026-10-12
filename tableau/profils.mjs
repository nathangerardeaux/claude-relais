// "Model per task" (opt-in): what kind of work each project does, from the tool calls of its conversations.
// Pure functions, no file access: analyse.mjs counts the categories per day, serveur.mjs writes the result
// into <Claude config>/relais/routage.json, read by the SessionStart hook (plugins/relais/scripts/deleguer.mjs).
// Measured choices behind the hints: docs/routage.md.

export const CATEGORIES = ['lecture', 'code', 'redaction', 'recherche'];
export const MIN_APPELS = 30;    // below this, a project has no profile
export const SEUIL_DOMINANTE = 0.45; // share of the calls a category needs, otherwise "mixte"

// Writing for humans: everything else edited counts as code (configs included).
const REDACTION = /\.(md|mdx|markdown|txt|rst|adoc|org|tex|docx?|odt|rtf)$/i;
const LECTURE = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const ECRITURE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const RECHERCHE = new Set(['WebSearch', 'WebFetch']);
// Browser MCP servers (Playwright, Chrome DevTools, Claude in Chrome, the built-in browser).
const NAVIGATEUR = /^mcp__.*(playwright|chrome|browser)/i;

// Category of one tool call, or '' (commands, agents, skills... are never a profile).
export function categorie(nom, entree) {
  const n = String(nom || '');
  if (LECTURE.has(n)) return 'lecture';
  if (ECRITURE.has(n)) {
    const f = String(entree?.file_path || entree?.notebook_path || '');
    return f ? (REDACTION.test(f) ? 'redaction' : 'code') : '';
  }
  if (RECHERCHE.has(n) || NAVIGATEUR.test(n)) return 'recherche';
  return '';
}

// { lecture: n, code: n, ... } -> { profil: '' | 'mixte' | <category>, parts: { <category>: % }, appels }
export function profil(comptes) {
  const appels = CATEGORIES.reduce((s, k) => s + (Number(comptes?.[k]) || 0), 0);
  const parts = {};
  for (const k of CATEGORIES) if (comptes?.[k]) parts[k] = appels ? Math.round((100 * comptes[k]) / appels) : 0;
  if (appels < MIN_APPELS) return { profil: '', parts, appels };
  const [haut] = CATEGORIES.map((k) => [k, Number(comptes[k]) || 0]).sort((a, b) => b[1] - a[1]);
  return { profil: haut[1] / appels >= SEUIL_DOMINANTE ? haut[0] : 'mixte', parts, appels };
}

// Same key as normCwd() in plugins/relais/scripts/commun.mjs: C:\x, c:/x and /c/x are the same folder.
export function cleProjet(cwd, plateforme = process.platform) {
  let s = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (plateforme === 'win32') s = s.replace(/^\/([a-z])\//i, '$1:/');
  return plateforme === 'win32' || plateforme === 'darwin' ? s.toLowerCase() : s;
}
