// Reads Claude Code conversation logs (~/.claude/projects/**/*.jsonl) and computes, per conversation,
// the tokens used and what for. Read-only on the logs. Incremental: a log only grows, so only the new
// bytes are parsed again, and the result is cached next to this script (on the same drive, never ~/.claude).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from './langue.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const dossierClaude = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
// Logs folder: TABLEAU_PROJETS (tests), else the one reported by `claude auth status`, else ~/.claude/projects.
let dossierCompte = '';
export const definirDossierProjets = (p) => { dossierCompte = p || ''; };
export const dossierProjets = () => process.env.TABLEAU_PROJETS || dossierCompte || path.join(dossierClaude(), 'projects');
const FICHIER_CACHE = () => process.env.TABLEAU_CACHE || path.join(ici, '.cache', 'index.json');
const VERSION_CACHE = 3; // bump when the parsed state changes shape: everything is re-read once

const MAX_POINTS = 1200;  // context curve kept per conversation (peaks preserved)
const MAX_TEXTE = 160;    // prompt excerpt kept per turn
const OUTILS_ACTION = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']);

// ---------------------------------------------------------------- parsing one log

export function nouvelEtat() {
  return {
    titreIA: '', titrePerso: '', premierPrompt: '', cwd: '', debut: '', fin: '',
    tot: { in: 0, out: 0, read: 0, create: 0, appels: 0 },
    modeles: {}, jours: {}, outils: {}, tours: [],
    courbe: [], pas: 1, seau: 0, nSeau: 0, ctxFin: 0, ctxMax: 0,
    vus: [], attente: {},
  };
}

const jourLocal = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A real message typed by the user (not a tool result, not text injected by Claude Code).
export function textePrompt(o) {
  if (o.type !== 'user' || o.isMeta) return null;
  const c = o.message?.content;
  let t = null;
  if (typeof c === 'string') t = c;
  else if (Array.isArray(c) && !c.some((b) => b?.type === 'tool_result')) {
    t = c.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n');
    if (!t && c.some((b) => b?.type === 'image')) t = '[image]';
  }
  if (!t || !t.trim()) return null;
  if (o.isCompactSummary) return '[résumé /compact]';
  const cmd = t.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd) return cmd[1].trim() || null;
  if (/^\s*<(local-command-stdout|local-command-caveat|local-command-stderr|bash-stdout|bash-stderr)/.test(t)) return null;
  if (/^\s*<task-notification>/.test(t)) return '[notification d\'une tâche de fond]';
  return t.replace(/\s+/g, ' ').trim();
}

function libelleOutil(b) {
  const n = String(b.name || '?');
  if ((n === 'Agent' || n === 'Task') && b.input?.subagent_type) return `${n} · ${b.input.subagent_type}`;
  if (n === 'Skill' && b.input?.skill) return `Skill · ${b.input.skill}`;
  return n;
}

function tailleResultat(b) {
  const c = b.content;
  if (typeof c === 'string') return c.length;
  if (!Array.isArray(c)) return 0;
  let n = 0;
  for (const x of c) {
    if (x?.type === 'text') n += (x.text || '').length;
    else if (x?.type === 'image') n += 6000; // an image weighs roughly 1.5k tokens once encoded
  }
  return n;
}

function pointCourbe(e, ctx) {
  // Keeps at most MAX_POINTS points: when full, merge pairs keeping the peak and double the step.
  e.seau = Math.max(e.seau, ctx);
  if (++e.nSeau < e.pas) return;
  e.courbe.push(e.seau);
  e.seau = 0; e.nSeau = 0;
  if (e.courbe.length >= MAX_POINTS * 2) {
    const c = [];
    for (let i = 0; i < e.courbe.length; i += 2) c.push(Math.max(e.courbe[i], e.courbe[i + 1] ?? 0));
    e.courbe = c; e.pas *= 2;
  }
}

function tourCourant(e, ts) {
  if (!e.tours.length) e.tours.push({ t: ts || '', texte: '(début)', appels: 0, in: 0, out: 0, read: 0, create: 0, outils: {}, ctx: 0, actions: 0 });
  return e.tours[e.tours.length - 1];
}

export function lireLigne(e, l) {
  // Cheap skip of the bulky bookkeeping lines.
  if (l.startsWith('{"type":"file-history') || l.startsWith('{"type":"queue-operation"')) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  if (!o || typeof o !== 'object') return;
  const ts = o.timestamp || '';
  if (ts) { if (!e.debut) e.debut = ts; e.fin = ts; }
  if (o.cwd && !e.cwd) e.cwd = String(o.cwd);
  if (o.type === 'ai-title' && o.aiTitle) { e.titreIA = String(o.aiTitle).slice(0, 200); return; }
  if (o.type === 'custom-title' && o.customTitle) { e.titrePerso = String(o.customTitle).slice(0, 200); return; }

  if (o.type === 'user') {
    const p = textePrompt(o);
    if (p) {
      if (!e.premierPrompt && !p.startsWith('/') && !p.startsWith('[')) e.premierPrompt = p.slice(0, 200);
      e.tours.push({ t: ts, texte: p.slice(0, MAX_TEXTE), appels: 0, in: 0, out: 0, read: 0, create: 0, outils: {}, ctx: 0, actions: 0 });
      return;
    }
    const c = o.message?.content;
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b?.type !== 'tool_result') continue;
        const nom = e.attente[b.tool_use_id];
        if (!nom) continue;
        delete e.attente[b.tool_use_id];
        const x = (e.outils[nom] ||= { appels: 0, car: 0 });
        x.car += tailleResultat(b);
      }
    }
    return;
  }

  if (o.type !== 'assistant' || !o.message) return;
  const m = o.message;
  const tour = tourCourant(e, ts);
  // The same answer is logged once per content block, each line repeating the same usage: count it once.
  const id = m.id || o.requestId || '';
  const u = m.usage;
  if (u && m.model !== '<synthetic>' && !(id && e.vus.includes(id))) {
    if (id) { e.vus.push(id); if (e.vus.length > 64) e.vus.shift(); }
    const v = { in: u.input_tokens || 0, out: u.output_tokens || 0, read: u.cache_read_input_tokens || 0, create: u.cache_creation_input_tokens || 0 };
    const mod = (e.modeles[m.model || '?'] ||= { in: 0, out: 0, read: 0, create: 0, appels: 0 });
    for (const cible of [e.tot, mod, tour]) {
      cible.in += v.in; cible.out += v.out; cible.read += v.read; cible.create += v.create; cible.appels += 1;
    }
    const j = jourLocal(ts);
    if (j) e.jours[j] = (e.jours[j] || 0) + v.in + v.out + v.read + v.create;
    const ctx = v.in + v.read + v.create;
    tour.ctx = ctx; e.ctxFin = ctx; e.ctxMax = Math.max(e.ctxMax, ctx);
    pointCourbe(e, ctx);
  }
  for (const b of Array.isArray(m.content) ? m.content : []) {
    if (b?.type !== 'tool_use') continue;
    const nom = libelleOutil(b);
    (e.outils[nom] ||= { appels: 0, car: 0 }).appels += 1;
    tour.outils[nom] = (tour.outils[nom] || 0) + 1;
    if (OUTILS_ACTION.has(b.name)) tour.actions += 1;
    if (b.id) e.attente[b.id] = nom;
  }
  // Tool calls left without a result (interrupted session) must not pile up forever.
  const cles = Object.keys(e.attente);
  if (cles.length > 200) for (const k of cles.slice(0, cles.length - 200)) delete e.attente[k];
}

// Reads `fichier` from byte `depart`, feeding every COMPLETE line to the state. Returns the new offset
// (just after the last newline), so a line still being written is read again next time.
export function lireFichier(fichier, depart, e) {
  return new Promise((resoudre, rejeter) => {
    let pos = depart;
    let reste = Buffer.alloc(0);
    const flux = fs.createReadStream(fichier, { start: depart, highWaterMark: 1 << 20 });
    flux.on('data', (morceau) => {
      const buf = reste.length ? Buffer.concat([reste, morceau]) : morceau;
      let debut = 0;
      for (let i = buf.indexOf(10); i !== -1; i = buf.indexOf(10, debut)) {
        if (i > debut) lireLigne(e, buf.toString('utf8', debut, i));
        pos += i - debut + 1;
        debut = i + 1;
      }
      reste = buf.subarray(debut);
    });
    flux.on('end', () => resoudre(pos));
    flux.on('error', rejeter);
  });
}

// ---------------------------------------------------------------- one message in detail (on click)

// What a tool call asked for, in one line: file, command, pattern, address...
function resumeEntree(b) {
  const i = b.input && typeof b.input === 'object' ? b.input : {};
  const court = (s, n = 180) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  if (i.command && i.description) return court(tr({ fr: `${i.description} : ${i.command}`, en: `${i.description}: ${i.command}` }));
  if (i.pattern && i.path) return court(tr({ fr: `${i.pattern}  (dans ${i.path})`, en: `${i.pattern}  (in ${i.path})` }));
  const v = i.file_path || i.notebook_path || i.command || i.pattern || i.url || i.query || i.skill || i.description || i.prompt;
  return v ? court(v) : court(JSON.stringify(i), 120);
}

// Re-reads ONE turn of a log (number `numero`, same numbering as etat.tours): every model call with its
// tokens, and the tools each one ran with the size of their result. Read on demand, so the cached index
// stays small. Stops reading as soon as the next turn starts.
export function detailTour(fichier, numero) {
  return new Promise((resoudre, rejeter) => {
    let n = -1; let fini = false;
    const appels = []; const parId = new Map(); const outils = new Map();
    const ligne = (l) => {
      if (l.startsWith('{"type":"file-history') || l.startsWith('{"type":"queue-operation"')) return;
      let o; try { o = JSON.parse(l); } catch { return; }
      if (!o || typeof o !== 'object') return;
      if (o.type === 'user') {
        if (textePrompt(o)) { n += 1; if (n > numero) fini = true; return; }
        if (n !== numero) return;
        for (const b of Array.isArray(o.message?.content) ? o.message.content : []) {
          const x = b?.type === 'tool_result' ? outils.get(b.tool_use_id) : null;
          if (x) { x.car += tailleResultat(b); if (b.is_error === true) x.erreur = true; }
        }
        return;
      }
      if (o.type !== 'assistant' || !o.message) return;
      if (n === -1) n = 0; // answer before any prompt: the "(début)" turn
      if (n !== numero) return;
      const m = o.message;
      const id = m.id || o.requestId || `sans-id-${appels.length}`;
      let a = parId.get(id);
      if (!a) { a = { t: o.timestamp || '', modele: '', in: 0, out: 0, read: 0, create: 0, compte: false, outils: [] }; parId.set(id, a); appels.push(a); }
      const u = m.usage;
      if (u && m.model !== '<synthetic>' && !a.compte) {
        a.compte = true; a.modele = String(m.model || '');
        a.in = u.input_tokens || 0; a.out = u.output_tokens || 0; a.read = u.cache_read_input_tokens || 0; a.create = u.cache_creation_input_tokens || 0;
      }
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b?.type !== 'tool_use') continue;
        const x = { nom: libelleOutil(b), quoi: resumeEntree(b), car: 0, erreur: false };
        a.outils.push(x);
        if (b.id) outils.set(b.id, x);
      }
    };
    let reste = Buffer.alloc(0);
    const flux = fs.createReadStream(fichier, { highWaterMark: 1 << 20 });
    const finir = () => resoudre({
      appels: appels.filter((a) => a.compte || a.outils.length).map(({ compte, outils: o, ...a }) => ({
        ...a, outils: o.map(({ car, ...x }) => ({ ...x, tokens: Math.round(car / 4) })),
      })),
    });
    flux.on('data', (morceau) => {
      const buf = reste.length ? Buffer.concat([reste, morceau]) : morceau;
      let debut = 0;
      for (let i = buf.indexOf(10); i !== -1 && !fini; i = buf.indexOf(10, debut)) {
        if (i > debut) ligne(buf.toString('utf8', debut, i));
        debut = i + 1;
      }
      reste = buf.subarray(debut);
      if (fini) { flux.destroy(); finir(); }
    });
    flux.on('end', () => { if (!fini) { if (reste.length) ligne(reste.toString('utf8')); finir(); } });
    flux.on('error', rejeter);
  });
}

// ---------------------------------------------------------------- the index of all conversations

export class Index {
  constructor() {
    this.fichiers = {};      // path -> { taille, mtime, offset, etat, meta? }
    this.enCours = false;
    this.progres = { fait: 0, total: 0, depuis: 0 };
    this.chargerCache();
  }

  chargerCache() {
    try {
      const c = JSON.parse(fs.readFileSync(FICHIER_CACHE(), 'utf8'));
      if (c.version === VERSION_CACHE && c.fichiers) this.fichiers = c.fichiers;
    } catch { /* first run */ }
  }

  sauverCache() {
    try {
      fs.mkdirSync(path.dirname(FICHIER_CACHE()), { recursive: true });
      const tmp = `${FICHIER_CACHE()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: VERSION_CACHE, fichiers: this.fichiers }));
      fs.renameSync(tmp, FICHIER_CACHE());
    } catch { /* the cache is only a speed-up */ }
  }

  // Every log: <projects>/<folder>/<session>.jsonl and <projects>/<folder>/<session>/subagents/agent-*.jsonl
  lister() {
    const racine = dossierProjets();
    const liste = [];
    let dossiers = [];
    try { dossiers = fs.readdirSync(racine, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return liste; }
    for (const d of dossiers) {
      const dp = path.join(racine, d.name);
      let entrees = [];
      try { entrees = fs.readdirSync(dp, { withFileTypes: true }); } catch { continue; }
      for (const f of entrees) {
        if (f.isFile() && f.name.endsWith('.jsonl')) liste.push({ p: path.join(dp, f.name), dossier: d.name, session: f.name.slice(0, -6) });
        else if (f.isDirectory()) {
          const sa = path.join(dp, f.name, 'subagents');
          let agents = [];
          try { agents = fs.readdirSync(sa).filter((x) => /^agent-[\w-]+\.jsonl$/.test(x)); } catch { continue; }
          for (const a of agents) liste.push({ p: path.join(sa, a), dossier: d.name, session: f.name, agent: a.slice(6, -6) });
        }
      }
    }
    return liste;
  }

  async mettreAJour() {
    if (this.enCours) return;
    this.enCours = true;
    try {
      const liste = this.lister();
      const presents = new Set(liste.map((x) => x.p));
      for (const p of Object.keys(this.fichiers)) if (!presents.has(p)) delete this.fichiers[p];
      const aLire = [];
      for (const x of liste) {
        let st; try { st = fs.statSync(x.p); } catch { continue; }
        const c = this.fichiers[x.p];
        if (c && c.taille === st.size && c.mtime === st.mtimeMs) continue;
        aLire.push({ ...x, taille: st.size, mtime: st.mtimeMs });
      }
      aLire.sort((a, b) => b.mtime - a.mtime); // the most recent conversations show up first
      this.progres = { fait: 0, total: aLire.length, depuis: Date.now() };
      let dernierSave = Date.now();
      for (const x of aLire) {
        try { await this.lireUn(x); } catch { /* unreadable log: skipped */ }
        this.progres.fait += 1;
        if (Date.now() - dernierSave > 5000) { this.sauverCache(); dernierSave = Date.now(); }
      }
      if (aLire.length) this.sauverCache();
    } finally { this.enCours = false; }
  }

  async lireUn(x) {
    let c = this.fichiers[x.p];
    if (!c || x.taille < c.offset) c = { offset: 0, etat: nouvelEtat() }; // rewritten log: start over
    c.offset = await lireFichier(x.p, c.offset, c.etat);
    c.taille = x.taille; c.mtime = x.mtime;
    c.dossier = x.dossier; c.session = x.session; c.agent = x.agent || null;
    if (x.agent && !c.meta) {
      try { c.meta = JSON.parse(fs.readFileSync(x.p.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch { c.meta = {}; }
    }
    this.fichiers[x.p] = c;
  }

  // ------------------------------------------------------------ views for the interface

  // Log file of a conversation's main thread (not its agents), or null.
  cheminPrincipal(id) {
    for (const [p, c] of Object.entries(this.fichiers)) if (c.etat && c.session === id && !c.agent) return p;
    return null;
  }

  sessions() {
    const s = new Map();
    for (const c of Object.values(this.fichiers)) {
      if (!c.etat) continue;
      if (!s.has(c.session)) s.set(c.session, { principal: null, agents: [] });
      if (c.agent) s.get(c.session).agents.push(c); else s.get(c.session).principal = c;
    }
    return s;
  }

  liste() {
    const res = [];
    for (const [id, { principal: c, agents }] of this.sessions()) {
      if (!c) continue;
      const e = c.etat;
      if (!e.tot.appels && !e.tours.length) continue;
      const totA = somme(agents.map((a) => a.etat.tot));
      res.push({
        id, projet: nomProjet(e.cwd, c.dossier), cwd: e.cwd || c.dossier,
        titre: e.titrePerso || e.titreIA || e.premierPrompt || '(sans titre)',
        debut: e.debut, fin: e.fin, tot: e.tot, ctxMax: e.ctxMax, ctxFin: e.ctxFin,
        tours: e.tours.filter((t) => t.texte !== '(début)').length,
        agents: { n: agents.length, tot: totA },
      });
    }
    return res.sort((a, b) => (b.fin || '').localeCompare(a.fin || ''));
  }

  detail(id) {
    const s = this.sessions().get(id);
    if (!s || !s.principal) return null;
    const c = s.principal; const e = c.etat;
    const outils = Object.entries(e.outils)
      .map(([nom, v]) => ({ nom, appels: v.appels, tokens: Math.round(v.car / 4) }))
      .sort((a, b) => b.tokens - a.tokens || b.appels - a.appels);
    const agents = s.agents.map((a) => ({
      type: a.meta?.agentType || 'agent', description: a.meta?.description || '', tot: a.etat.tot,
      ctxMax: a.etat.ctxMax, debut: a.etat.debut,
      outils: Object.entries(a.etat.outils).map(([nom, v]) => ({ nom, appels: v.appels })).sort((x, y) => y.appels - x.appels).slice(0, 6),
    })).sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
    return {
      id, projet: nomProjet(e.cwd, c.dossier), cwd: e.cwd || c.dossier,
      titre: e.titrePerso || e.titreIA || e.premierPrompt || '(sans titre)',
      debut: e.debut, fin: e.fin, tot: e.tot, ctxMax: e.ctxMax, ctxFin: e.ctxFin,
      modeles: e.modeles, jours: e.jours, outils, agents, totAgents: somme(s.agents.map((a) => a.etat.tot)),
      courbe: e.courbe, pasCourbe: e.pas,
      tours: e.tours.slice(-3000).map((t, i) => ({ ...t, n: Math.max(0, e.tours.length - 3000) + i })),
      toursCaches: Math.max(0, e.tours.length - 3000),
    };
  }

  vue() {
    const jours = {}; const projets = {};
    for (const c of Object.values(this.fichiers)) {
      if (!c.etat) continue;
      for (const [j, n] of Object.entries(c.etat.jours)) jours[j] = (jours[j] || 0) + n;
    }
    for (const [, { principal: c, agents }] of this.sessions()) {
      if (!c) continue;
      const nom = nomProjet(c.etat.cwd, c.dossier);
      const p = (projets[nom] ||= { nom, cwd: c.etat.cwd || c.dossier, conversations: 0, tot: { in: 0, out: 0, read: 0, create: 0, appels: 0 } });
      p.conversations += 1;
      ajouter(p.tot, c.etat.tot);
      for (const a of agents) ajouter(p.tot, a.etat.tot);
    }
    return { jours, projets: Object.values(projets).sort((a, b) => total(b.tot) - total(a.tot)) };
  }
}

export const total = (t) => (t.in || 0) + (t.out || 0) + (t.read || 0) + (t.create || 0);
function ajouter(a, b) { for (const k of ['in', 'out', 'read', 'create', 'appels']) a[k] += b[k] || 0; }
function somme(liste) { const t = { in: 0, out: 0, read: 0, create: 0, appels: 0 }; for (const x of liste) ajouter(t, x); return t; }
function nomProjet(cwd, dossier) {
  const s = String(cwd || '').replace(/[\\/]+$/, '');
  return s ? s.split(/[\\/]/).pop() || s : dossier;
}
