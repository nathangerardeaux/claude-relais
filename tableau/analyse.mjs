// Reads Claude Code conversation logs (~/.claude/projects/**/*.jsonl) and computes, per conversation,
// the tokens used and what for. Read-only on the logs. Incremental: a log only grows, so only the new
// bytes are parsed again, and the result is cached next to this script (on the same drive, never ~/.claude).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from './langue.mjs';
import { Historique } from './historique.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const dossierClaude = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
// Logs folder: TABLEAU_PROJETS (tests), else the one reported by `claude auth status`, else ~/.claude/projects.
let dossierCompte = '';
export const definirDossierProjets = (p) => { dossierCompte = p || ''; };
export const dossierProjets = () => process.env.TABLEAU_PROJETS || dossierCompte || path.join(dossierClaude(), 'projects');
const FICHIER_CACHE = () => process.env.TABLEAU_CACHE || path.join(ici, '.cache', 'index.json');
// Next to the cache but a file of its own: the index can be rebuilt at any time, the history must not be lost.
const fichierHistorique = () => path.join(path.dirname(FICHIER_CACHE()), 'historique.json');
const VERSION_CACHE = 4; // bump when the parsed state changes shape: everything is re-read once

const MAX_POINTS = 1200;  // context curve kept per conversation (peaks preserved)
const MAX_TEXTE = 160;    // prompt excerpt kept per turn
const OUTILS_ACTION = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']);
const FENETRE_RECENT = 2 * 3600e3;  // model calls kept per log for the live view (older ones are dropped)
const MAX_RECENT = 2000;
const SEUIL_GROS = 8000;  // a tool result of at least this many characters (~2k tokens) is remembered
const MAX_GROS = 10;      // ... the biggest ones, per conversation
export const SEUIL_RELAIS = 150000;

// ---------------------------------------------------------------- parsing one log

export function nouvelEtat() {
  return {
    titreIA: '', titrePerso: '', premierPrompt: '', cwd: '', debut: '', fin: '',
    tot: { in: 0, out: 0, read: 0, create: 0, appels: 0 },
    modeles: {}, jours: {}, outils: {}, tours: [],
    courbe: [], pas: 1, seau: 0, nSeau: 0, ctxFin: 0, ctxMax: 0,
    vus: [], attente: {},
    // per local day: split, tokens per hour, per model and context peak (day detail, analysis)
    det: {},
    recent: [],   // [timestamp ms, tokens] of the latest model calls (live view)
    ctx0: 0,      // context of the first answer: what a fresh conversation already weighs
    socle: null,  // what the starting context is made of, in characters (instruction files, skills list, MCP...)
    gros: [],     // the biggest tool results: { nom, quoi, car, t }
    compactions: [], // { t, auto, avant }
  };
}

const nouveauJour = () => ({ in: 0, out: 0, read: 0, create: 0, appels: 0, h: {}, mod: {}, ctxMax: 0 });

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

// What a tool call was about, very short (file, command...): shown next to the biggest results.
function quoiCourt(b) {
  const i = b.input && typeof b.input === 'object' ? b.input : {};
  const v = i.file_path || i.notebook_path || i.command || i.pattern || i.url || i.query || i.skill || i.description || i.prompt || '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, 90);
}

// Keeps the biggest tool results of the conversation (a big result stays in the context, read again at every call).
function noterGros(e, g) {
  if (g.car < SEUIL_GROS) return;
  e.gros.push(g);
  if (e.gros.length > MAX_GROS * 2) { e.gros.sort((a, b) => b.car - a.car); e.gros.length = MAX_GROS; }
}

// Size (characters) of what the starting context is made of, read from the "attachment" lines written before
// the first answer: instruction files (CLAUDE.md, memory), skills list, agents list, MCP instructions...
const lg = (x) => (typeof x === 'string' ? x.length : x == null ? 0 : JSON.stringify(x).length);
function capterSocle(e, a) {
  if (!a || typeof a !== 'object') return;
  const cle = { skill_listing: 'skills', agent_listing_delta: 'agents', mcp_instructions_delta: 'mcp', deferred_tools_delta: 'outils',
    hook_additional_context: 'hooks', session_context: 'session' }[a.type];
  if (!cle && a.type !== 'instructions') return;
  const s = (e.socle ||= { instr: 0, skills: 0, agents: 0, mcp: 0, outils: 0, hooks: 0, session: 0, nSkills: 0, fichiers: [] });
  if (a.type === 'instructions') {
    for (const f of Array.isArray(a.files) ? a.files : []) {
      const car = lg(f?.content);
      s.instr += car;
      if (car && f?.path) s.fichiers.push({ p: String(f.path).slice(0, 260), type: String(f.type || '').slice(0, 20), car });
    }
    s.fichiers.sort((x, y) => y.car - x.car); s.fichiers.length = Math.min(s.fichiers.length, 8);
    return;
  }
  const brut = { skills: a.content, agents: a.addedLines, mcp: a.addedBlocks, outils: a.addedLines, hooks: a.content, session: a.context }[cle];
  s[cle] += lg(brut);
  if (cle === 'skills' && a.skillCount) s.nSkills = Number(a.skillCount) || 0;
}

// Model calls of the last hours, to measure the live rate. Old ones are dropped as new ones arrive.
function noterRecent(e, ms, tokens) {
  const r = e.recent;
  r.push([ms, tokens]);
  if (r.length > 256) {
    e.recent = r.filter((x) => x[0] >= ms - FENETRE_RECENT);
    if (e.recent.length > MAX_RECENT) e.recent = e.recent.slice(-MAX_RECENT);
  }
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
  if (o.type === 'attachment') { if (!e.ctx0) capterSocle(e, o.attachment); return; }
  if (o.type === 'system') {
    if (o.subtype === 'compact_boundary' && e.compactions.length < 50) {
      e.compactions.push({ t: ts, auto: o.compactMetadata?.trigger === 'auto', avant: Number(o.compactMetadata?.preTokens) || 0 });
    }
    return;
  }

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
        const w = e.attente[b.tool_use_id];
        if (!w) continue;
        delete e.attente[b.tool_use_id];
        const x = (e.outils[w.n] ||= { appels: 0, car: 0 });
        const car = tailleResultat(b);
        x.car += car;
        noterGros(e, { nom: w.n, quoi: w.q, car, t: ts });
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
    const ctx = v.in + v.read + v.create;
    const tokens = ctx + v.out;
    const j = jourLocal(ts);
    if (j) {
      e.jours[j] = (e.jours[j] || 0) + tokens;
      const dj = (e.det[j] ||= nouveauJour());
      dj.in += v.in; dj.out += v.out; dj.read += v.read; dj.create += v.create; dj.appels += 1;
      const hh = new Date(ts).getHours();
      dj.h[hh] = (dj.h[hh] || 0) + tokens;
      const nm = m.model || '?';
      dj.mod[nm] = (dj.mod[nm] || 0) + tokens;
      dj.ctxMax = Math.max(dj.ctxMax, ctx);
      noterRecent(e, Date.parse(ts), tokens);
    }
    if (!e.ctx0) e.ctx0 = ctx;
    tour.ctx = ctx; e.ctxFin = ctx; e.ctxMax = Math.max(e.ctxMax, ctx);
    pointCourbe(e, ctx);
  }
  for (const b of Array.isArray(m.content) ? m.content : []) {
    if (b?.type !== 'tool_use') continue;
    const nom = libelleOutil(b);
    (e.outils[nom] ||= { appels: 0, car: 0 }).appels += 1;
    tour.outils[nom] = (tour.outils[nom] || 0) + 1;
    if (OUTILS_ACTION.has(b.name)) tour.actions += 1;
    if (b.id) e.attente[b.id] = { n: nom, q: quoiCourt(b) };
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
    this.historique = new Historique(fichierHistorique()); // compact daily totals, kept after Claude Code deletes old logs
    this.enCours = false;
    this.rapide = false;         // a quick refresh of the live view is running
    this.dernierListage = 0;     // last time the folders were listed by the quick refresh
    this.sauveLe = Date.now();
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
      const limite = Date.now() - 3 * 3600e3; // the live window only needs the last hours
      for (const c of Object.values(this.fichiers)) if (c.etat?.recent?.length) c.etat.recent = c.etat.recent.filter((x) => x[0] >= limite);
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
    if (this.enCours || this.rapide) return;
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
      if (aLire.length) { this.sauverCache(); this.historiser(); }
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

  // Records the daily totals in the history file (see historique.mjs): they outlive the logs themselves.
  historiser() {
    try { this.historique.fusionner(this.agregats().vivant); } catch { /* the history is a bonus, never a reason to fail */ }
  }

  // ------------------------------------------------------------ live view

  // Quick refresh: looks at the size / date of the logs and parses ONLY the new bytes of those that changed
  // (the offset of each log is kept). Between two full listings (every 15 s, to find new logs) only the logs
  // touched in the last 6 hours are looked at. Skipped while the full pass runs. `complet`: list everything now.
  async actualiserRapide({ complet = false } = {}) {
    if (this.enCours || this.rapide) return { relus: [], saute: true };
    this.rapide = true;
    const relus = [];
    try {
      const maintenant = Date.now();
      let candidats;
      if (complet || maintenant - this.dernierListage > 15000) { candidats = this.lister(); this.dernierListage = maintenant; }
      else {
        const limite = maintenant - 6 * 3600e3;
        candidats = Object.entries(this.fichiers).filter(([, c]) => c.mtime > limite)
          .map(([p, c]) => ({ p, dossier: c.dossier, session: c.session, ...(c.agent ? { agent: c.agent } : {}) }));
      }
      for (const x of candidats) {
        let st; try { st = fs.statSync(x.p); } catch { continue; }
        const c = this.fichiers[x.p];
        if (c && c.taille === st.size && c.mtime === st.mtimeMs) continue;
        try { await this.lireUn({ ...x, taille: st.size, mtime: st.mtimeMs }); relus.push(x.p); } catch { /* unreadable log: skipped */ }
      }
      if (relus.length && Date.now() - this.sauveLe > 30000) { this.sauverCache(); this.historiser(); this.sauveLe = Date.now(); }
    } finally { this.rapide = false; }
    return { relus, saute: false };
  }

  // What is happening now: tokens of the last 5 / 60 minutes, rate, one bucket per minute, conversations
  // written to in the last 5 minutes (with their current context), today and the recent days.
  direct(maintenant = Date.now()) {
    const FEN5 = 5 * 60e3; const FEN60 = 60 * 60e3;
    let tokens5 = 0; let tokens60 = 0;
    const minutes = new Array(60).fill(0);
    const actives = [];
    for (const [id, { principal, agents }] of this.sessions()) {
      const fichiers = [principal, ...agents].filter(Boolean);
      let t5 = 0; let derniere = 0;
      for (const c of fichiers) {
        for (const [ms, tk] of c.etat.recent || []) {
          const age = maintenant - ms;
          if (age < -60e3 || age >= FEN60) continue; // a few seconds of clock drift are tolerated
          const a = Math.max(0, age);
          tokens60 += tk; minutes[59 - Math.floor(a / 60000)] += tk;
          if (a < FEN5) { tokens5 += tk; t5 += tk; }
        }
        if (maintenant - c.mtime < FEN5) derniere = Math.max(derniere, c.mtime);
      }
      if (!derniere || !principal) continue;
      const e = principal.etat;
      actives.push({ id, titre: titreDe(e), projet: nomProjet(e.cwd, principal.dossier), ctx: e.ctxFin, ctxMax: e.ctxMax,
        tokens5: t5, derniere: new Date(derniere).toISOString(), alerte: e.ctxFin > SEUIL_RELAIS });
    }
    actives.sort((a, b) => b.derniere.localeCompare(a.derniere));
    const aujourdhui = jourLocal(maintenant);
    const depuis = jourMoins(aujourdhui, 30);
    const jours = {};
    for (const [j, n] of Object.entries(this.vue().jours)) if (j >= depuis) jours[j] = n;
    return { maintenant: new Date(maintenant).toISOString(), tokens5, tokens60, debit: Math.round(tokens5 / 5), minutes, actives,
      aujourdhui: jours[aujourdhui] || 0, jours, indexation: this.enCours };
  }

  // ------------------------------------------------------------ a day, a week, a month

  // Per local day, from the logs on disk: split, subagent tokens, number of conversations, tokens per project and
  // per model. With a range (`de`, `a`) it also returns the conversations active in it, with their own figures.
  agregats(de = '', a = '') {
    const vivant = {}; const convs = [];
    const jourVide = () => ({ in: 0, out: 0, read: 0, create: 0, appels: 0, agents: 0, sess: new Set(), projets: {}, modeles: {}, h: {} });
    for (const [id, { principal, agents }] of this.sessions()) {
      const c0 = principal || agents[0];
      if (!c0) continue;
      const projet = nomProjet(c0.etat.cwd, c0.dossier);
      const tp = { in: 0, out: 0, read: 0, create: 0, appels: 0 }; const ta = { in: 0, out: 0, read: 0, create: 0, appels: 0 };
      const mod = {}; let ctxMax = 0; let actif = false;
      for (const c of [principal, ...agents]) {
        if (!c) continue;
        const estAgent = c !== principal;
        for (const [j, d] of Object.entries(c.etat.det)) {
          const v = (vivant[j] ||= jourVide());
          const tk = d.in + d.out + d.read + d.create;
          ajouter(v, d); v.sess.add(id);
          if (estAgent) v.agents += tk;
          v.projets[projet] = (v.projets[projet] || 0) + tk;
          for (const [m, n] of Object.entries(d.mod)) v.modeles[m] = (v.modeles[m] || 0) + n;
          for (const [hh, n] of Object.entries(d.h)) v.h[hh] = (v.h[hh] || 0) + n;
          if (!de || j < de || j > a) continue;
          actif = true;
          ajouter(estAgent ? ta : tp, d);
          if (!estAgent) ctxMax = Math.max(ctxMax, d.ctxMax);
          for (const [m, n] of Object.entries(d.mod)) mod[m] = (mod[m] || 0) + n;
        }
      }
      if (!actif) continue;
      const tout = somme([tp, ta]);
      convs.push({ id, titre: titreDe(c0.etat), projet, cwd: c0.etat.cwd || c0.dossier, tot: tout, total: total(tout), agents: total(ta),
        partAgents: total(tout) ? total(ta) / total(tout) : 0, appels: tout.appels, ctxMax, ouvrable: !!principal,
        modeles: Object.entries(mod).map(([nom, tokens]) => ({ nom, tokens })).sort((x, y) => y.tokens - x.tokens) });
    }
    for (const v of Object.values(vivant)) { v.total = v.in + v.out + v.read + v.create; v.conversations = v.sess.size; delete v.sess; }
    return { vivant, convs };
  }

  // Everything used between two local days (YYYY-MM-DD, both included): split, bars (per hour for one day,
  // per day otherwise), conversations (by tokens used in that period), projects, models. A day whose logs are
  // gone (or partly gone) is taken from the history file: totals only, flagged `detailPartiel`.
  periode(de, a) {
    const unJour = de === a;
    const { vivant, convs } = this.agregats(de, a);
    const tot = { in: 0, out: 0, read: 0, create: 0, appels: 0 };
    const parModele = {}; const parProjet = {}; const parBarre = {};
    let detailPartiel = false; let agentsTot = 0;
    const jours = new Set([...Object.keys(vivant), ...Object.keys(this.historique.jours)].filter((j) => j >= de && j <= a));
    for (const j of jours) {
      const v = vivant[j]; const hs = this.historique.jours[j];
      const d = hs && hs.total > (v?.total || 0) ? hs : v; // the history keeps the larger (more complete) record
      if (d === hs) detailPartiel = true;
      ajouter(tot, d); agentsTot += d.agents || 0;
      for (const [m, n] of Object.entries(d.modeles || {})) parModele[m] = (parModele[m] || 0) + n;
      for (const [nom, n] of Object.entries(d.projets || {})) {
        const p = (parProjet[nom] ||= { nom, conversations: 0, total: 0 });
        p.total += n;
      }
      if (unJour) { for (const [hh, n] of Object.entries(v?.h || {})) parBarre[hh] = (parBarre[hh] || 0) + n; }
      else parBarre[j] = d.total;
    }
    for (const c of convs) if (parProjet[c.projet]) parProjet[c.projet].conversations += 1;
    convs.sort((x, y) => y.total - x.total);
    let barres;
    if (unJour) barres = Array.from({ length: 24 }, (_, i) => ({ cle: String(i), tokens: parBarre[i] || 0 }));
    else {
      barres = [];
      for (let j = de; j <= a && barres.length < 400; j = jourMoins(j, -1)) barres.push({ cle: j, tokens: parBarre[j] || 0 });
    }
    return {
      de, a, granularite: unJour ? 'heure' : 'jour', barres, tot, total: total(tot), agents: agentsTot, detailPartiel,
      nConversations: convs.length, conversations: convs.slice(0, 200),
      projets: Object.values(parProjet).sort((x, y) => y.total - x.total),
      modeles: Object.entries(parModele).map(([nom, tokens]) => ({ nom, tokens })).sort((x, y) => y.tokens - x.tokens),
    };
  }

  // ------------------------------------------------------------ "why so many tokens?"

  // Ranked findings over the last `nbJours` days (ending at local day `fin`), computed from the parsed logs
  // only: nothing is sent anywhere, no model is called. Each finding carries its numbers; the page words them.
  analyser(nbJours = 30, fin = jourLocal(Date.now())) {
    const de = jourMoins(fin, nbJours - 1);
    const dansJour = (j) => j >= de && j <= fin;
    const dansTs = (ts) => { const j = jourLocal(ts); return !!j && dansJour(j); };
    const vide = () => ({ in: 0, out: 0, read: 0, create: 0, appels: 0 });
    const fichiersActifs = [];  // every log with activity in the period
    const convs = [];
    const tot = vide(); const parModele = {};
    for (const [id, { principal, agents }] of this.sessions()) {
      const rec = { id, principal, agents, tp: vide(), ta: vide(), ctxMax: 0, actif: false, types: {} };
      for (const c of [principal, ...agents]) {
        if (!c) continue;
        const estAgent = c !== principal;
        const mine = vide(); let ctxMax = 0;
        for (const [j, d] of Object.entries(c.etat.det)) {
          if (!dansJour(j)) continue;
          ajouter(mine, d); ctxMax = Math.max(ctxMax, d.ctxMax);
          for (const [m, n] of Object.entries(d.mod)) parModele[m] = (parModele[m] || 0) + n;
        }
        if (!mine.appels && !total(mine)) continue;
        rec.actif = true; ajouter(estAgent ? rec.ta : rec.tp, mine); ajouter(tot, mine);
        if (!estAgent) rec.ctxMax = ctxMax;
        else { const ty = c.meta?.agentType || 'agent'; rec.types[ty] = (rec.types[ty] || 0) + total(mine); }
        fichiersActifs.push({ c, appels: mine.appels, estAgent });
      }
      if (rec.actif) convs.push(rec);
    }
    const tokens = total(tot);
    const res = { jours: nbJours, de, a: fin, conversations: convs.length, tokens, tot, constats: [] };
    if (!tokens) return res;
    const part = (n) => Math.min(1, n / tokens);
    const ajoutC = (id, poids, donnees) => res.constats.push({ id, poids: Math.round(poids), part: part(poids), gravite: part(poids) >= 0.3 ? 'haute' : part(poids) >= 0.1 ? 'moyenne' : 'info', donnees });
    const principaux = convs.filter((r) => r.principal);
    const info = (r) => ({ id: r.id, titre: titreDe(r.principal.etat), projet: nomProjet(r.principal.etat.cwd, r.principal.dossier) });
    const mediane = (v) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

    // 1. history re-read from the cache at every call
    ajoutC('relus', tot.read, { read: tot.read, appels: tot.appels, parAppel: tot.appels ? Math.round(tot.read / tot.appels) : 0 });

    // 2. conversations that went past the relay threshold, and what the relay would have saved
    const ctx0s = principaux.map((r) => r.principal.etat.ctx0).filter((x) => x > 0);
    const socleMes = ctx0s.length ? mediane(ctx0s) : 40000;
    const lourdes = principaux.filter((r) => r.ctxMax > SEUIL_RELAIS);
    if (lourdes.length) {
      let reel = 0; let simule = 0; let relais = 0; let tk = 0;
      const liste = lourdes.map((r) => {
        const s = simulerRelais(r.principal.etat.tours, socleMes, SEUIL_RELAIS, (t) => dansTs(t.t));
        reel += s.reel; simule += s.simule; relais += s.relais; tk += total(r.tp);
        return { ...info(r), ctxMax: r.ctxMax, tokens: total(r.tp), reel: Math.round(s.reel), simule: Math.round(s.simule), relais: s.relais };
      }).sort((x, y) => (y.reel - y.simule) - (x.reel - x.simule));
      ajoutC('lourdes', tk, { n: lourdes.length, tokens: tk, reel: Math.round(reel), simule: Math.round(simule), economie: Math.round(reel - simule),
        pctEco: reel ? Math.round((1 - simule / reel) * 100) : 0, relais, seuil: SEUIL_RELAIS, socle: Math.round(socleMes), top: liste.slice(0, 5) });
    }

    // 3. the context every conversation starts with, re-read at every call
    if (ctx0s.length) {
      const parts = {};
      for (const cle of ['instr', 'skills', 'agents', 'mcp', 'outils', 'hooks', 'session']) {
        const v = principaux.map((r) => r.principal.etat.socle?.[cle]).filter((x) => x > 0);
        parts[cle] = v.length ? Math.round(mediane(v) / 4) : 0;
      }
      const med = Math.round(mediane(ctx0s));
      const connus = Object.values(parts).reduce((x, y) => x + y, 0);
      parts.systeme = Math.max(0, med - connus);
      const fich = new Map();
      for (const r of principaux) for (const f of r.principal.etat.socle?.fichiers || []) {
        const x = fich.get(f.p) || { p: f.p, type: f.type, tokens: 0, n: 0 };
        x.tokens = Math.max(x.tokens, Math.round(f.car / 4)); x.n += 1; fich.set(f.p, x);
      }
      let poids = 0;
      for (const f of fichiersActifs) if (f.c.etat.ctx0) poids += f.c.etat.ctx0 * f.appels;
      // what you can act on: the biggest detected part (the rest is Claude Code's own prompt and tool definitions)
      const reglables = Object.entries(parts).filter(([k, v]) => k !== 'systeme' && v > 0).sort((x, y) => y[1] - x[1]);
      ajoutC('socle', Math.min(poids, tokens), { n: ctx0s.length, mediane: med, p90: [...ctx0s].sort((x, y) => x - y)[Math.floor(ctx0s.length * 0.9)],
        parts, dominant: reglables.length ? reglables[0][0] : 'systeme', fichiers: [...fich.values()].sort((x, y) => y.tokens - x.tokens).slice(0, 5),
        nSkills: Math.max(0, ...principaux.map((r) => r.principal.etat.socle?.nSkills || 0)) });
    }

    // 4. tool calls: how many per conversation, and the heaviest results
    let appelsTot = 0; const frequentes = [];
    for (const r of principaux) {
      let n = 0;
      for (const t of r.principal.etat.tours) if (dansTs(t.t)) for (const v of Object.values(t.outils)) n += v;
      appelsTot += n;
      if (n >= 100) frequentes.push({ ...info(r), appels: n, tokens: total(r.tp) });
    }
    if (appelsTot) {
      frequentes.sort((x, y) => y.appels - x.appels);
      ajoutC('appels', frequentes.reduce((x, y) => x + y.tokens, 0), { appels: appelsTot, n: principaux.length, parConversation: Math.round(appelsTot / principaux.length),
        nFrequentes: frequentes.length, top: frequentes.slice(0, 5) });
    }
    const gros = [];
    for (const r of principaux) for (const g of r.principal.etat.gros) if (dansTs(g.t)) gros.push({ nom: g.nom, quoi: g.quoi, tokens: Math.round(g.car / 4), ...info(r) });
    if (gros.length) {
      gros.sort((x, y) => y.tokens - x.tokens);
      ajoutC('gros', gros.reduce((x, y) => x + y.tokens, 0), { n: gros.length, nTresGros: gros.filter((g) => g.tokens >= 10000).length, top: gros.slice(0, 6) });
    }

    // 5. subagents
    const totA = vide(); const types = {};
    for (const r of convs) { ajouter(totA, r.ta); for (const [k, v] of Object.entries(r.types)) types[k] = (types[k] || 0) + v; }
    if (total(totA)) {
      ajoutC('agents', total(totA), { tokens: total(totA), appels: totA.appels, n: fichiersActifs.filter((f) => f.estAgent).length,
        types: Object.entries(types).map(([type, tk]) => ({ type, tokens: tk })).sort((x, y) => y.tokens - x.tokens).slice(0, 4) });
    }

    // 6. model mix
    const familles = {};
    for (const [m, n] of Object.entries(parModele)) { const f = familleModele(m); familles[f] = (familles[f] || 0) + n; }
    const listeF = Object.entries(familles).map(([famille, tk]) => ({ famille, tokens: tk, part: tk / tokens })).sort((x, y) => y.tokens - x.tokens);
    ajoutC('modeles', familles.opus || 0, { familles: listeF, opus: familles.opus || 0 });

    // 7. compactions and very long sessions
    let auto = 0; let manuelles = 0;
    const longues = [];
    for (const r of principaux) {
      const e = r.principal.etat;
      for (const k of e.compactions) if (dansTs(k.t)) { if (k.auto) auto += 1; else manuelles += 1; }
      const messages = e.tours.filter((t) => t.texte !== DEBUT_TOUR).length;
      const heures = e.debut && e.fin ? (new Date(e.fin) - new Date(e.debut)) / 3600e3 : 0;
      if (messages >= 60 || heures >= 48) longues.push({ ...info(r), messages, heures: Math.round(heures), tokens: total(r.tp) });
    }
    if (auto || manuelles || longues.length) {
      longues.sort((x, y) => y.tokens - x.tokens);
      ajoutC('longues', longues.reduce((x, y) => x + y.tokens, 0), { auto, manuelles, n: longues.length, top: longues.slice(0, 5) });
    }

    res.constats.sort((x, y) => y.poids - x.poids);
    return res;
  }

  vue() {
    const jours = {}; const projets = {};
    for (const c of Object.values(this.fichiers)) {
      if (!c.etat) continue;
      for (const [j, n] of Object.entries(c.etat.jours)) jours[j] = (jours[j] || 0) + n;
    }
    // a day whose logs were (partly) deleted keeps the larger total recorded in the history
    for (const [j, d] of Object.entries(this.historique.jours)) if (d.total > (jours[j] || 0)) jours[j] = d.total;
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

const DEBUT_TOUR = '(début)';
export const titreDe = (e) => e.titrePerso || e.titreIA || e.premierPrompt || '(sans titre)';
// Local day key `n` days before `cle` (negative n = after), by calendar arithmetic (daylight saving safe).
export function jourMoins(cle, n) {
  const [y, m, j] = cle.split('-').map(Number);
  return jourLocal(new Date(y, m - 1, j - n, 12));
}
export function familleModele(nom) {
  const m = String(nom).toLowerCase();
  return m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'autre';
}

// What the relay would have saved on one conversation: same rule as plugins/relais/scripts/simuler-economie.mjs
// (once the context passes `seuil` and you send a message, the simulation restarts from a fresh session of
// `socle` tokens), but run on the turns already parsed (average context of the turn's calls) instead of re-reading
// the log. Counts tokens re-read per call, not dollars. `compter(tour)` selects the turns that are counted
// (the period), the simulation itself runs over the whole conversation.
export function simulerRelais(tours, socle, seuil = SEUIL_RELAIS, compter = () => true) {
  let reel = 0; let simule = 0; let relais = 0; let n = 0; let base = null; let dernier = 0; let demande = false;
  for (const t of tours) {
    const humain = t.texte !== DEBUT_TOUR && !t.texte.startsWith('/') && t.texte !== '[résumé /compact]' && t.texte !== "[notification d'une tâche de fond]";
    if (humain && dernier - (base ?? 0) + socle > seuil) demande = true;
    if (!t.appels) continue;
    const ctx = (t.in + t.read + t.create) / t.appels;
    if (base === null || ctx < base) base = Math.max(0, ctx - socle); // original compaction: re-anchor
    if (demande) { base = Math.max(0, ctx - socle); if (compter(t)) relais += 1; demande = false; }
    if (compter(t)) { n += t.appels; reel += ctx * t.appels; simule += Math.max(socle, ctx - base) * t.appels; }
    dernier = t.ctx || ctx;
  }
  return { n, reel, simule, relais };
}
