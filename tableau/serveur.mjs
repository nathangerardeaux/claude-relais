// Relais dashboard: token usage per conversation, skills catalogue, devil's advocate switch.
// Usage: node tableau/serveur.mjs [--port 4747] [--sans-navigateur]   (or double-click lancer-tableau.cmd)
// Also a module: `demarrerServeur({ port, ouvrirNavigateur })` (used by the desktop app, tableau/bureau/).
// Listens on 127.0.0.1 ONLY: nothing leaves the machine, nothing is reachable from the network.
// Opens only when Claude Code is signed in on this PC (`claude auth status`), like Claude Terminal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Index, detailTour, dossierClaude, dossierProjets, definirDossierProjets, jourMoins } from './analyse.mjs';
import { compte } from './compte.mjs';
import { catalogue, installer, definirDepot } from './catalogue.mjs';
import { skillsExternes } from './skills-externes.mjs';
import * as gestion from './gestion.mjs';
import * as memoire from './memoire.mjs';
import * as chat from './chat-regles.mjs';
import { langueSysteme, tr } from './langue.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));

// Same file as plugins/avocat/scripts/commun.mjs (the Stop hook reads it).
const fichierAvocat = () => process.env.AVOCAT_ETAT || path.join(dossierClaude(), 'avocat', 'etat.json');
export function lireAvocat() {
  try { const e = JSON.parse(fs.readFileSync(fichierAvocat(), 'utf8')); return { actif: e?.actif === true, depuis: e?.depuis || '' }; }
  catch { return { actif: false, depuis: '' }; }
}
function ecrireAvocat(actif) {
  fs.mkdirSync(path.dirname(fichierAvocat()), { recursive: true });
  const e = { actif: !!actif, depuis: new Date().toISOString() };
  fs.writeFileSync(fichierAvocat(), JSON.stringify(e, null, 2));
  return e;
}

// Error messages sent to the page, in the system language.
const ERREURS = {
  refusee: { fr: 'Requête refusée.', en: 'Request refused.' },
  actif: { fr: 'Paramètre "actif" attendu.', en: 'Parameter "actif" expected.' },
  accepte: { fr: 'Paramètre "accepte" attendu.', en: 'Parameter "accepte" expected.' },
  nom: { fr: 'Paramètre "nom" attendu.', en: 'Parameter "nom" expected.' },
  json: { fr: 'Corps JSON attendu.', en: 'JSON body expected.' },
  occupe: { fr: 'Claude répond déjà à un message : attends la fin ou arrête-le.', en: 'Claude is already answering a message: wait for the end or stop it.' },
  introuvable: { fr: 'Introuvable.', en: 'Not found.' },
  connexion: { fr: "Connecte-toi à Claude Code d'abord.", en: 'Sign in to Claude Code first.' },
  conversation: { fr: 'Conversation introuvable.', en: 'Conversation not found.' },
  message: { fr: 'Message introuvable.', en: 'Message not found.' },
  date: { fr: 'Dates attendues au format AAAA-MM-JJ (au plus 400 jours).', en: 'Dates expected as YYYY-MM-DD (400 days at most).' },
  interne: { fr: 'Erreur interne.', en: 'Internal error.' },
};
const erreur = (cle, plus = {}) => ({ erreur: tr(ERREURS[cle]), ...plus });

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// Static files: a fixed list, never a path taken from the URL.
const STATIQUES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'],
  '/periodes.js': ['periodes.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
// Media files (demo videos): same rule, a fixed list. Served with Range support so the player can seek.
const MEDIAS = {
  '/demo/remotion.mp4': ['demo-remotion.mp4', 'video/mp4'],
};
const ENTETES = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function envoyer(res, code, corps, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { ...ENTETES, 'Content-Type': type });
  res.end(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps));
}

// "bytes=a-b" | "bytes=a-" | "bytes=-n" on a file of `taille` bytes -> { debut, fin } (inclusive),
// null when absent (send everything) or 'invalide' (416). Several ranges: ignored, whole file sent.
function lirePlage(entete, taille) {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(entete).trim());
  if (!m) return /^bytes=/.test(entete) && !entete.includes(',') ? 'invalide' : null;
  if (m[1] === '' && m[2] === '') return 'invalide';
  let debut, fin;
  if (m[1] === '') { const n = Number(m[2]); if (n === 0) return 'invalide'; debut = Math.max(0, taille - n); fin = taille - 1; }
  else { debut = Number(m[1]); fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1); }
  return debut >= taille || debut > fin ? 'invalide' : { debut, fin };
}
function envoyerMedia(req, res, fichier, type) {
  let taille;
  try { taille = fs.statSync(fichier).size; } catch { return envoyer(res, 404, erreur('introuvable')); }
  const base = { ...ENTETES, 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  const plage = lirePlage(req.headers.range, taille);
  if (plage === 'invalide') { res.writeHead(416, { ...base, 'Content-Range': `bytes */${taille}`, 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify(erreur('introuvable'))); }
  const [code, debut, fin] = plage ? [206, plage.debut, plage.fin] : [200, 0, taille - 1];
  res.writeHead(code, { ...base, 'Content-Length': taille ? fin - debut + 1 : 0, ...(plage ? { 'Content-Range': `bytes ${debut}-${fin}/${taille}` } : {}) });
  if (!taille) return res.end();
  const flux = fs.createReadStream(fichier, { start: debut, end: fin });
  flux.on('error', () => res.destroy());
  res.on('close', () => flux.destroy());
  flux.pipe(res);
}

function lireCorps(req) {
  return new Promise((resoudre) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 10000) { req.destroy(); resoudre(null); } });
    req.on('end', () => { try { resoudre(JSON.parse(s || '{}')); } catch { resoudre(null); } });
  });
}

function ouvrirDansNavigateur(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* open it by hand */ }
}

/**
 * Starts the dashboard server on 127.0.0.1.
 * @param {object} [o]
 * @param {number} [o.port=4747] port wanted; if taken, tries the next ones (10 max). 0 = a free port chosen by the OS.
 * @param {boolean} [o.ouvrirNavigateur=false] opens the default browser once the account has been checked.
 * @param {(texte: string) => void} [o.journal=console.log] where the startup messages go.
 * @param {string|string[]} [o.depot] repo to READ the Skills data from (.claude-plugin/marketplace.json,
 *   plugins/), or candidates in order (first valid wins). Omitted = the repo this script sits in. None
 *   valid (local absolute path holding marketplace.json) = empty Skills tab. Only data is read there:
 *   no code is ever loaded from it.
 * @param {object} [o.bureau] desktop app only: functions of the Electron main process, exposed as
 *   /api/bureau/* (same Host / Origin / X-Relais checks as every POST). Absent (command line) = no such
 *   routes (404), and the page hides its "Paramètres" tab.
 *   { etat(), demarrage(actif: boolean), verifierMaj(), telechargerMaj(), installerMaj() } -> JSON-able (or Promise).
 *   Optional, anonymous statistics: { statsApercu(), statsReponse(accepte: boolean), statsOnglet(cle) -> boolean,
 *   statsSupprimer() } (the routes /api/bureau/stats/* exist only when statsReponse is given).
 * @returns {Promise<{ url: string, port: number, fermer: () => Promise<void>, depot: { ok: boolean, depot?: string, raison?: string } | null }>}
 */
export function demarrerServeur({ port: portDemande = 4747, ouvrirNavigateur = false, journal = console.log, depot, bureau } = {}) {
  const choixDepot = depot === undefined ? null : definirDepot(depot);
  const index = new Index();
  let port = Number(portDemande) || 0;
  let minuterie = null;

  // Blocks DNS rebinding (Host) and other websites posting to this local server (Origin + custom header,
  // which a cross-site form or a simple fetch cannot send without a CORS preflight we never answer).
  // `port` is the port actually listened on (updated once listening).
  const hotesOK = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  function requeteSure(req) {
    if (!hotesOK().has(String(req.headers.host || '').toLowerCase())) return false;
    // A browser says where a request comes from: another site (even a GET by <img> or a link) is refused,
    // so it cannot start `claude plugin list` and co. Absent outside browsers (CLI, tests).
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    if (req.method === 'GET') return true;
    const origine = req.headers.origin;
    if (origine && !hotesOK().has(String(origine).toLowerCase().replace(/^https?:\/\//, ''))) return false;
    return req.headers['x-relais'] === '1' && /^application\/json/.test(String(req.headers['content-type'] || ''));
  }

  // Checks the account, and starts reading the logs as soon as it is signed in.
  let indexLance = false;
  async function surCompte(forcer) {
    const c = await compte(forcer);
    if (c.connecte && !indexLance) {
      indexLance = true;
      if (c.dossierProjets) definirDossierProjets(c.dossierProjets);
      index.mettreAJour().catch(() => {});
    }
    return c;
  }

  const serveur = http.createServer(async (req, res) => {
    try {
      if (!requeteSure(req)) return envoyer(res, 403, erreur('refusee'));
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const p = url.pathname;

      if (req.method === 'GET' && STATIQUES[p]) {
        const [f, type] = STATIQUES[p];
        return envoyer(res, 200, fs.readFileSync(path.join(ici, 'public', f)), type);
      }
      if (req.method === 'GET' && MEDIAS[p]) {
        const [f, type] = MEDIAS[p];
        return envoyerMedia(req, res, path.join(ici, 'public', f), type);
      }
      // Language and account: always reachable (the sign-in screen needs both).
      if (req.method === 'GET' && p === '/api/langue') return envoyer(res, 200, { langue: langueSysteme() });
      if (req.method === 'GET' && p === '/api/compte') return envoyer(res, 200, await surCompte(false));
      if (req.method === 'POST' && p === '/api/compte/verifier') return envoyer(res, 200, await surCompte(true));
      // Desktop app settings (start with Windows, updates): no Claude data in there, so reachable before
      // sign-in too (an update must stay possible). Only when the Electron app provided the functions.
      if (bureau && p.startsWith('/api/bureau/')) {
        if (req.method === 'GET' && p === '/api/bureau/etat') return envoyer(res, 200, await bureau.etat());
        if (req.method === 'POST' && p === '/api/bureau/demarrage') {
          const b = await lireCorps(req);
          if (!b || typeof b.actif !== 'boolean') return envoyer(res, 400, erreur('actif'));
          return envoyer(res, 200, await bureau.demarrage(b.actif));
        }
        // Anonymous statistics (opt-in, see statistiques.mjs): the app decides what is counted and sent.
        if (p.startsWith('/api/bureau/stats/') && bureau.statsReponse) {
          if (req.method === 'GET' && p === '/api/bureau/stats/apercu') return envoyer(res, 200, await bureau.statsApercu());
          if (req.method === 'POST' && ['/api/bureau/stats/reponse', '/api/bureau/stats/onglet', '/api/bureau/stats/supprimer'].includes(p)) {
            const b = await lireCorps(req);
            if (!b || typeof b !== 'object') return envoyer(res, 400, erreur('json'));
            if (p.endsWith('/reponse')) {
              if (typeof b.accepte !== 'boolean') return envoyer(res, 400, erreur('accepte'));
              return envoyer(res, 200, await bureau.statsReponse(b.accepte));
            }
            if (p.endsWith('/onglet')) {
              const compte = typeof b.cle === 'string' && await bureau.statsOnglet(b.cle);
              return envoyer(res, compte ? 200 : 400, { ok: !!compte });
            }
            return envoyer(res, 200, await bureau.statsSupprimer());
          }
          return envoyer(res, 404, erreur('introuvable'));
        }
        const actions = { '/api/bureau/maj/verifier': 'verifierMaj', '/api/bureau/maj/telecharger': 'telechargerMaj', '/api/bureau/maj/installer': 'installerMaj' };
        if (req.method === 'POST' && actions[p]) {
          if (!(await lireCorps(req))) return envoyer(res, 400, erreur('json'));
          return envoyer(res, 200, await bureau[actions[p]]());
        }
        return envoyer(res, 404, erreur('introuvable'));
      }
      // Everything else needs a signed-in Claude Code.
      if (p.startsWith('/api/') && !(await surCompte(false)).connecte) return envoyer(res, 401, erreur('connexion', { connexion: false }));

      if (req.method === 'GET' && p === '/api/etat') {
        const cat = catalogue();
        return envoyer(res, 200, {
          indexation: { ...index.progres, enCours: index.enCours }, dossier: dossierProjets(),
          avocat: { ...lireAvocat(), installe: cat.some((x) => x.nom === 'avocat' && x.etat !== 'absent') },
          relais: { installe: cat.some((x) => x.nom === 'relais' && x.etat !== 'absent') },
        });
      }
      if (req.method === 'GET' && p === '/api/conversations') return envoyer(res, 200, index.liste());
      if (req.method === 'GET' && p === '/api/conversation') {
        const d = index.detail(String(url.searchParams.get('id') || ''));
        return d ? envoyer(res, 200, d) : envoyer(res, 404, erreur('conversation'));
      }
      if (req.method === 'GET' && p === '/api/conversation/tour') {
        const f = index.cheminPrincipal(String(url.searchParams.get('id') || ''));
        const n = Number(url.searchParams.get('n'));
        if (!f || !Number.isInteger(n) || n < 0) return envoyer(res, 404, erreur('message'));
        return envoyer(res, 200, await detailTour(f, n));
      }
      if (req.method === 'GET' && p === '/api/vue') return envoyer(res, 200, index.vue());
      // One day (?date=YYYY-MM-DD) or a period (?date=...&fin=...): what was used, by hour / day, conversation, project, model.
      if (req.method === 'GET' && p === '/api/jour') {
        const de = String(url.searchParams.get('date') || '');
        const a = String(url.searchParams.get('fin') || de);
        if (!JOUR.test(de) || !JOUR.test(a) || a < de || jourMoins(de, -400) < a) return envoyer(res, 400, erreur('date'));
        return envoyer(res, 200, index.periode(de, a));
      }
      // Live usage: refreshes only the logs that changed since the last call, then answers from memory.
      if (req.method === 'GET' && p === '/api/direct') {
        await index.actualiserRapide();
        return envoyer(res, 200, index.direct());
      }
      // "Why so many tokens?": ranked findings over the last 7 or 30 days (any 1..365), local and deterministic.
      if (req.method === 'GET' && p === '/api/analyse') {
        const n = Math.round(Number(url.searchParams.get('jours') || 30));
        return envoyer(res, 200, index.analyser(Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 30));
      }
      if (req.method === 'GET' && p === '/api/skills') return envoyer(res, 200, catalogue());
      // Node.js of the user's PATH (the plugins' hooks need it); ?forcer=1 skips the few-minutes cache.
      if (req.method === 'GET' && p === '/api/node') return envoyer(res, 200, await gestion.verifierNode({ forcer: url.searchParams.get('forcer') === '1' }));
      if (req.method === 'GET' && p === '/api/skills/externes') return envoyer(res, 200, skillsExternes(langueSysteme()));

      // Memory tab (memoire.mjs): what Claude recorded and which instruction files it loaded.
      if (req.method === 'GET' && p === '/api/memoire') return envoyer(res, 200, memoire.lire(index.vue().projets.map((x) => x.cwd)));

      // Rules chat (chat-regles.mjs): Claude's answer comes back as JSON lines, piece by piece. Leaving
      // the page (or Stop) closes the request, which stops claude.
      if (req.method === 'POST' && p === '/api/memoire/chat') {
        const v = chat.valider(await lireCorps(req));
        if (!v.ok) return envoyer(res, 400, v);
        if (chat.occupe()) return envoyer(res, 409, { ok: false, message: tr(ERREURS.occupe) });
        res.writeHead(200, { ...ENTETES, 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        res.flushHeaders();
        const conv = chat.discuter(v, (ev) => {
          if (res.writableEnded) return;
          res.write(`${JSON.stringify(ev)}
`);
          if (ev.type === 'fin' || ev.type === 'erreur') res.end();
        });
        res.on('close', () => conv.annuler());
        return;
      }

      // Skill management (gestion.mjs): every change goes through Claude Code's own `claude plugin` commands.
      if (req.method === 'GET' && p === '/api/gestion/plugins') {
        const r = await gestion.plugins(url.searchParams.get('projet') || '');
        return envoyer(res, r.ok ? 200 : 400, r);
      }
      // Skills installed by hand (plain folders), read-only.
      if (req.method === 'GET' && p === '/api/gestion/skills-manuels') {
        const r = gestion.skillsManuels(url.searchParams.get('projet') || '');
        return envoyer(res, r.ok ? 200 : 400, r);
      }
      // How long Claude Code keeps conversation logs (cleanupPeriodDays) and what they weigh on disk.
      if (req.method === 'GET' && p === '/api/historique') return envoyer(res, 200, gestion.historiqueConversations());
      if (req.method === 'GET' && p === '/api/gestion/projets') {
        const vus = new Set();
        const liste = index.vue().projets.map((x) => ({ nom: x.nom, dossier: x.cwd, conversations: x.conversations }))
          .filter((x) => x.dossier && gestion.validerProjet(x.dossier).ok && !vus.has(x.dossier.toLowerCase()) && vus.add(x.dossier.toLowerCase()));
        return envoyer(res, 200, liste);
      }
      if (req.method === 'GET' && p === '/api/gestion/profils') {
        return envoyer(res, 200, gestion.profils().map((x) => ({ ...x, commande: gestion.commandeProfil(x.id) })));
      }
      const ROUTES = {
        '/api/gestion/activer': gestion.activer,
        '/api/gestion/profil': gestion.enregistrerProfil,
        '/api/gestion/profil/supprimer': (b) => gestion.supprimerProfil(b.id),
        '/api/gestion/lancer': gestion.lancerProfil,
        '/api/historique': gestion.definirHistorique,
        '/api/externes/installer': (b) => gestion.installerExterne(b.id),
        '/api/externes/design': gestion.ajouterDesign,
        '/api/externes/skills': gestion.ajouterSkills,
        '/api/memoire/ajouter': memoire.ajouterEntree,
        '/api/memoire/modifier': memoire.modifierEntree,
        '/api/memoire/supprimer': memoire.supprimerEntree,
      };
      if (req.method === 'POST' && ROUTES[p]) {
        const b = await lireCorps(req);
        if (!b || typeof b !== 'object') return envoyer(res, 400, erreur('json'));
        const r = await ROUTES[p](b);
        return envoyer(res, r.ok ? 200 : 400, r);
      }

      if (req.method === 'POST' && p === '/api/avocat') {
        const b = await lireCorps(req);
        if (!b || typeof b.actif !== 'boolean') return envoyer(res, 400, erreur('actif'));
        return envoyer(res, 200, ecrireAvocat(b.actif));
      }
      if (req.method === 'POST' && p === '/api/skills/installer') {
        const b = await lireCorps(req);
        if (!b || typeof b.nom !== 'string') return envoyer(res, 400, erreur('nom'));
        const r = installer(b.nom);
        return envoyer(res, r.ok ? 200 : 400, r);
      }
      if (req.method === 'POST' && p === '/api/actualiser') {
        index.mettreAJour().catch(() => {});
        return envoyer(res, 202, { ok: true });
      }
      return envoyer(res, 404, erreur('introuvable'));
    } catch {
      return envoyer(res, 500, erreur('interne'));
    }
  });

  return new Promise((resoudre, rejeter) => {
    let essai = 0;
    const surErreur = (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0 && essai < 10) { essai += 1; port += 1; serveur.listen(port, '127.0.0.1'); return; }
      serveur.off('listening', surEcoute);
      rejeter(err);
    };
    const surEcoute = () => {
      serveur.off('error', surErreur);
      port = serveur.address().port; // the real one (matters for port 0)
      const url = `http://127.0.0.1:${port}/`;
      journal(tr({ fr: `Tableau relais : ${url}\n(Ctrl+C pour arrêter. Le tableau n'écoute que sur cette machine.)`,
        en: `Relais dashboard: ${url}\n(Ctrl+C to stop. The dashboard only listens on this machine.)` }));
      surCompte(true).then((c) => {
        const plan = c.abonnement ? ` (${c.abonnement})` : '';
        journal(c.connecte ? tr({ fr: `Compte Claude : ${c.email}${plan}`, en: `Claude account: ${c.email}${plan}` })
          : tr({ fr: `Pas connecté : ${c.raison}\nDans un terminal : claude auth login`, en: `Not signed in: ${c.raison}\nIn a terminal: claude auth login` }));
        if (ouvrirNavigateur) ouvrirDansNavigateur(url);
      });
      minuterie = setInterval(async () => { if ((await surCompte(false)).connecte) index.mettreAJour().catch(() => {}); }, 20000);
      minuterie.unref();
      const fermer = () => new Promise((fini) => {
        clearInterval(minuterie);
        serveur.close(() => fini());
        serveur.closeAllConnections?.();
      });
      resoudre({ url, port, fermer, depot: choixDepot });
    };
    serveur.on('error', surErreur);
    serveur.once('listening', surEcoute);
    serveur.listen(port, '127.0.0.1');
  });
}

// Started directly (`node tableau/serveur.mjs`), not imported. Falls back to comparing real paths,
// case-insensitive on Windows (D:\ vs d:\, symlinks, junctions).
function lanceDirectement() {
  const script = process.argv[1];
  if (!script || process.versions.electron) return false;
  if (import.meta.url === pathToFileURL(script).href) return true;
  try {
    const a = fs.realpathSync(fileURLToPath(import.meta.url));
    const b = fs.realpathSync(path.resolve(script));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
}

if (lanceDirectement()) {
  const arg = (nom) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : undefined; };
  const port = Number(arg('--port') || process.env.TABLEAU_PORT || 4747);
  demarrerServeur({ port, ouvrirNavigateur: !process.argv.includes('--sans-navigateur') })
    .catch((err) => { console.error(tr({ fr: `Impossible de démarrer : ${err.message}`, en: `Could not start: ${err.message}` })); process.exit(1); });
}
