// Daily totals kept by the dashboard itself, so the year view keeps growing after Claude Code deletes old logs
// (30 days by default). Only statistics are stored: per local day the split (cache read / cache creation / input /
// output), the tokens of subagents, the number of conversations, and the tokens per project folder name and per
// model. NO title, prompt, conversation id or any content. One small JSON file next to the index cache.
// A recorded day is never lowered: a new figure replaces it only when it is at least as large (more complete).
import fs from 'node:fs';
import path from 'node:path';

const VERSION = 1;
const MAX_PROJETS = 15; // per day; the smaller ones are summed under "…"

export const AUTRES_PROJETS = '…';

// Keeps the biggest projects of a day and sums the others, so the file stays small.
function resumerProjets(projets) {
  const l = Object.entries(projets).sort((a, b) => b[1] - a[1]);
  const res = Object.fromEntries(l.slice(0, MAX_PROJETS));
  const reste = l.slice(MAX_PROJETS).reduce((n, x) => n + x[1], 0);
  if (reste) res[AUTRES_PROJETS] = reste;
  return res;
}

export class Historique {
  constructor(fichier) {
    this.fichier = fichier;
    this.jours = {}; // 'YYYY-MM-DD' -> { in, out, read, create, appels, total, agents, conversations, projets, modeles }
    this.charger();
  }

  charger() {
    let brut;
    try { brut = fs.readFileSync(this.fichier, 'utf8'); } catch { return; } // first run
    try {
      const c = JSON.parse(brut);
      if (c && c.version === VERSION && c.jours && typeof c.jours === 'object') this.jours = c.jours;
    } catch {
      // unreadable: keep it aside rather than overwrite it, start again
      try { fs.renameSync(this.fichier, `${this.fichier}.illisible`); } catch { /* nothing more to do */ }
    }
  }

  // `vivant`: per-day figures computed from the logs on disk (Index.agregats). Returns true when the file changed.
  fusionner(vivant) {
    let change = false;
    for (const [j, v] of Object.entries(vivant)) {
      if (!v.total) continue;
      const ancien = this.jours[j];
      if (ancien && v.total < ancien.total) continue; // never downwards
      const nouveau = { in: v.in, out: v.out, read: v.read, create: v.create, appels: v.appels, total: v.total,
        agents: v.agents, conversations: v.conversations, projets: resumerProjets(v.projets), modeles: { ...v.modeles } };
      if (ancien && JSON.stringify(ancien) === JSON.stringify(nouveau)) continue;
      this.jours[j] = nouveau; change = true;
    }
    if (change) this.sauver();
    return change;
  }

  sauver() {
    try {
      fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
      const tmp = `${this.fichier}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, jours: this.jours }));
      fs.renameSync(tmp, this.fichier);
    } catch { /* the history is a bonus: the next pass tries again */ }
  }
}
