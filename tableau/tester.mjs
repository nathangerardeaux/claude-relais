// Tests for the relais dashboard. Everything happens in a TEMPORARY folder (fake logs, fake ~/.claude,
// fake `claude` command): the real ~/.claude is never read nor written. Usage: node tableau/tester.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-test-'));
const CLAUDE = path.join(TMP, 'claude-config');
const PROJETS = path.join(CLAUDE, 'projects');
process.env.TABLEAU_PROJETS = PROJETS;
process.env.TABLEAU_CACHE = path.join(TMP, 'cache', 'index.json');
process.env.CLAUDE_CONFIG_DIR = CLAUDE;
process.env.AVOCAT_ETAT = path.join(CLAUDE, 'avocat', 'etat.json');
process.env.TABLEAU_LANGUE = 'fr'; // the French assertions below do not depend on this PC's language
delete process.env.RELAIS_LANGUE;
const { Index, total, detailTour } = await import('./analyse.mjs');

let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${detail ? ' — ' + detail : ''}`); };
const L = (o) => JSON.stringify(o) + '\n';
const usage = (i, r, c, o) => ({ input_tokens: i, cache_read_input_tokens: r, cache_creation_input_tokens: c, output_tokens: o });
const ts = (min) => new Date(Date.UTC(2026, 9, 4, 10, min)).toISOString();

// ---- a synthetic conversation
const dossier = path.join(PROJETS, 'D--mon-projet');
fs.mkdirSync(dossier, { recursive: true });
const SID = '11111111-2222-3333-4444-555555555555';
const journal = path.join(dossier, `${SID}.jsonl`);
fs.writeFileSync(journal, [
  L({ type: 'queue-operation', operation: 'enqueue', content: 'ignored' }),
  L({ type: 'user', isMeta: true, message: { role: 'user', content: 'Caveat: injected by Claude Code' }, timestamp: ts(0), cwd: 'D:\\mon-projet' }),
  L({ type: 'user', message: { role: 'user', content: 'Corrige le bug du menu' }, timestamp: ts(1), cwd: 'D:\\mon-projet' }),
  // one answer logged as 2 lines (2 content blocks) with the SAME id and usage: must count once
  L({ type: 'assistant', message: { id: 'msg_A', model: 'claude-opus-5-5', usage: usage(10, 1000, 500, 50), content: [{ type: 'text', text: 'Je regarde' }] }, timestamp: ts(2) }),
  L({ type: 'assistant', message: { id: 'msg_A', model: 'claude-opus-5-5', usage: usage(10, 1000, 500, 50), content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: {} }] }, timestamp: ts(2) }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'x'.repeat(4000) }] }, timestamp: ts(3) }),
  L({ type: 'assistant', message: { id: 'msg_B', model: 'claude-opus-5-5', usage: usage(5, 1500, 1000, 200), content: [{ type: 'tool_use', id: 'tu2', name: 'Agent', input: { subagent_type: 'Explore' } }] }, timestamp: ts(4) }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: 'y'.repeat(800) }] }] }, timestamp: ts(5) }),
  L({ type: 'assistant', message: { id: 'msg_X', model: '<synthetic>', usage: usage(0, 0, 0, 0), content: [{ type: 'text', text: 'API error' }] }, timestamp: ts(5) }),
  L({ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>' }, timestamp: ts(6) }),
  L({ type: 'user', message: { role: 'user', content: '<local-command-stdout></local-command-stdout>' }, timestamp: ts(6) }),
  L({ type: 'ai-title', aiTitle: 'Bug du menu mobile' }),
].join(''));
// its subagent
const dossierAgents = path.join(dossier, SID, 'subagents');
fs.mkdirSync(dossierAgents, { recursive: true });
fs.writeFileSync(path.join(dossierAgents, 'agent-abc123.jsonl'), [
  L({ type: 'user', isSidechain: true, message: { role: 'user', content: 'Cherche le menu' }, timestamp: ts(4) }),
  L({ type: 'assistant', isSidechain: true, message: { id: 'msg_S', model: 'claude-haiku', usage: usage(3, 200, 100, 30), content: [{ type: 'tool_use', id: 's1', name: 'Grep', input: {} }] }, timestamp: ts(4) }),
].join(''));
fs.writeFileSync(path.join(dossierAgents, 'agent-abc123.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Trouver le menu' }));

// ---- parsing
const ix = new Index();
await ix.mettreAJour();
const liste = ix.liste();
verif('analyse: one conversation listed (subagent attached, not separate)', liste.length === 1, JSON.stringify(liste.map((c) => c.id)));
const d = ix.detail(SID);
verif('analyse: title from ai-title', d?.titre === 'Bug du menu mobile', d?.titre);
verif('analyse: duplicated lines counted once', d.tot.appels === 2 && d.tot.read === 2500 && d.tot.out === 250, JSON.stringify(d.tot));
verif('analyse: <synthetic> error answers ignored', !d.modeles['<synthetic>']);
verif('analyse: context = input + cache read + cache creation', d.ctxMax === 2505 && d.ctxFin === 2505, `${d.ctxMax}`);
const read = d.outils.find((o) => o.nom === 'Read');
verif('analyse: tool result size attributed to the tool (≈ chars/4)', read?.appels === 1 && read?.tokens === 1000, JSON.stringify(read));
verif('analyse: Agent labelled with its type', d.outils.some((o) => o.nom === 'Agent · Explore' && o.tokens === 200));
const tours = d.tours.map((t) => t.texte);
verif('analyse: turns = real prompts + commands, not meta/tool results', JSON.stringify(tours) === JSON.stringify(['Corrige le bug du menu', '/clear']), JSON.stringify(tours));
verif('analyse: tokens attributed to the right turn', d.tours[0].appels === 2 && d.tours[1].appels === 0);
verif('analyse: subagent tokens and meta', d.agents.length === 1 && d.agents[0].type === 'Explore' && d.agents[0].description === 'Trouver le menu' && total(d.totAgents) === 333);
verif('analyse: project = last folder of cwd', d.projet === 'mon-projet', d.projet);
verif('analyse: per-day totals', Object.values(d.jours).reduce((a, b) => a + b, 0) === total(d.tot));

// ---- incremental: only the new bytes, and a half-written line waits
const avant = ix.fichiers[journal].offset;
fs.appendFileSync(journal, L({ type: 'user', message: { role: 'user', content: 'Et maintenant ?' }, timestamp: ts(7) })
  + L({ type: 'assistant', message: { id: 'msg_C', model: 'claude-opus-5-5', usage: usage(1, 100, 10, 5), content: [] }, timestamp: ts(8) })
  + '{"type":"assistant","message":{"id":"msg_D"');
await ix.mettreAJour();
const d2 = ix.detail(SID);
verif('incremental: new answer added', d2.tot.appels === 3 && d2.tours.at(-1).texte === 'Et maintenant ?');
verif('incremental: half-written line not consumed', fs.statSync(journal).size - ix.fichiers[journal].offset === '{"type":"assistant","message":{"id":"msg_D"'.length && ix.fichiers[journal].offset > avant);
const n0 = d2.tours.find((t) => t.texte === 'Corrige le bug du menu')?.n;
const dt = await detailTour(journal, n0);
verif('detail of a message: turns numbered from 0 like the index', n0 === 0 && d2.tours.map((t) => t.n).join() === d2.tours.map((_, i) => i).join());
verif('detail of a message: one entry per model call (same id counted once, synthetic left out)', dt.appels.length === 2
  && dt.appels[0].read === 1000 && dt.appels[0].create === 500 && dt.appels[0].in === 10 && dt.appels[0].out === 50 && dt.appels[1].out === 200, JSON.stringify(dt));
verif('detail of a message: each tool with its result size (chars / 4)', dt.appels[0].outils[0]?.nom === 'Read' && dt.appels[0].outils[0].tokens === 1000
  && dt.appels[1].outils[0]?.nom === 'Agent · Explore' && dt.appels[1].outils[0].tokens === 200);
const dDernier = await detailTour(journal, d2.tours.at(-1).n);
verif('detail of a message: the right turn only, half-written line ignored', dDernier.appels.length === 1 && dDernier.appels[0].read === 100 && dDernier.appels[0].outils.length === 0, JSON.stringify(dDernier));
verif('detail of a message: turn past the end = nothing', (await detailTour(journal, 99)).appels.length === 0);
const ix2 = new Index();
verif('cache: reloaded from disk', ix2.detail(SID)?.tot.appels === 3);
fs.writeFileSync(journal, L({ type: 'user', message: { role: 'user', content: 'Réécrit' }, timestamp: ts(9) }));
await ix2.mettreAJour();
verif('cache: rewritten (shorter) log is read again from scratch', ix2.detail(SID)?.tot.appels === 0 && ix2.detail(SID).tours.length === 1);

// ---- calendar helpers of the year view (public/periodes.js): weeks start on Monday, local days, month buckets
{
  const P = await import('./public/periodes.js');
  verif('periodes: week starts on Monday (Thursday, Sunday and Monday itself)', P.debutSemaine('2026-10-08') === '2026-10-05' && P.debutSemaine('2026-10-11') === '2026-10-05' && P.debutSemaine('2026-10-05') === '2026-10-05');
  verif('periodes: a week can start in the previous year (Friday 2027-01-01 -> Monday 2026-12-28)', P.debutSemaine('2027-01-01') === '2026-12-28' && P.debutSemaine('2026-12-28') === '2026-12-28');
  verif('periodes: day arithmetic is calendar based (daylight saving change, month and year ends)', P.plusJours('2026-03-28', 2) === '2026-03-30' && P.plusJours('2026-10-24', 2) === '2026-10-26'
    && P.plusJours('2026-12-31', 1) === '2027-01-01' && P.plusJours('2027-03-01', -1) === '2027-02-28' && P.finMois('2028-02-10') === '2028-02-29');
  const sem = P.seaux({ '2026-12-31': 5, '2027-01-01': 7, '2027-01-03': 1, '2027-01-04': 9, '2025-12-28': 4, '2025-12-29': 2 }, '12m', '2027-01-03');
  verif('periodes 12m: 53 weekly bars, the last one is the current week (Monday 2026-12-28 to Sunday 2027-01-03)', sem.length === 53 && sem.at(-1).x === '2026-12-28' && sem.at(-1).fin === '2027-01-03' && sem.at(0).x === '2025-12-29', `${sem.length} ${sem.at(-1).x} ${sem.at(0).x}`);
  verif('periodes 12m: a week across the year boundary sums both years; later days and the day before the first week are left out', sem.at(-1).y === 13 && sem.at(0).y === 2 && sem.reduce((a, s) => a + s.y, 0) === 15, JSON.stringify(sem.at(-1)));
  verif('periodes 12m: bars are consecutive Mondays', sem.every((s, i) => i === 0 || s.x === P.plusJours(sem[i - 1].x, 7)) && sem.every((s) => P.debutSemaine(s.x) === s.x));
  const mois = P.seaux({ '2026-08-15': 3, '2026-09-30': 4, '2026-10-01': 5 }, 'tout', '2026-10-08');
  verif('periodes tout: at least the last 12 months, one bar per month, current month last', mois.length === 12 && mois[0].x === '2025-11' && mois.at(-1).x === '2026-10' && mois[0].debut === '2025-11-01' && mois[0].fin === '2025-11-30');
  verif('periodes tout: a day goes to its own month (September 30th and October 1st)', mois.find((m) => m.x === '2026-09').y === 4 && mois.find((m) => m.x === '2026-10').y === 5 && mois.find((m) => m.x === '2026-08').y === 3);
  const vieux = P.seaux({ '2024-02-29': 8, '2026-01-02': 1 }, 'tout', '2026-10-08');
  verif('periodes tout: starts at the first month with data when older than 12 months (leap day included)', vieux.length === 33 && vieux[0].x === '2024-02' && vieux[0].fin === '2024-02-29' && vieux[0].y === 8 && vieux.find((m) => m.x === '2026-01').y === 1);
  const j30 = P.seaux({ '2026-10-08': 5, '2026-09-09': 2, '2026-09-08': 99 }, '30j', '2026-10-08');
  verif('periodes 30j: 30 daily bars ending today', j30.length === 30 && j30.at(-1).x === '2026-10-08' && j30[0].x === '2026-09-09' && j30.reduce((a, s) => a + s.y, 0) === 7);
}

// ---- helper for the next blocks: a fresh logs folder + cache folder, restored afterwards
const AVANT_ENV = { projets: process.env.TABLEAU_PROJETS, cache: process.env.TABLEAU_CACHE };
const nouveauDossierLogs = (nom) => {
  const racine = path.join(TMP, nom, 'projects'); fs.mkdirSync(racine, { recursive: true });
  process.env.TABLEAU_PROJETS = racine; process.env.TABLEAU_CACHE = path.join(TMP, nom, 'cache', 'index.json');
  return racine;
};
const restaurerEnv = () => { process.env.TABLEAU_PROJETS = AVANT_ENV.projets; process.env.TABLEAU_CACHE = AVANT_ENV.cache; };
const ecrireLog = (fichier, lignes) => { fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, lignes.map(L).join('')); };
const loc = (j, h = 10, m = 0) => new Date(2026, 2, j, h, m).toISOString(); // local time, March 2026

// ---- day detail: one conversation spanning midnight, a subagent, two projects, history file
{
  const racine = nouveauDossierLogs('jour');
  const S1 = 'aaaaaaaa-0000-0000-0000-000000000001'; const S2 = 'bbbbbbbb-0000-0000-0000-000000000002';
  const d1 = path.join(racine, 'D--projet-jour'); const d2 = path.join(racine, 'D--autre');
  const f1 = path.join(d1, `${S1}.jsonl`); const f2 = path.join(d2, `${S2}.jsonl`); const fa = path.join(d1, S1, 'subagents', 'agent-x1.jsonl');
  ecrireLog(f1, [
    { type: 'user', message: { role: 'user', content: 'Premier message secret' }, timestamp: loc(10, 23, 50), cwd: 'D:\\projet-jour' },
    { type: 'assistant', message: { id: 'a1', model: 'claude-opus-5-5', usage: usage(10, 1000, 500, 50), content: [] }, timestamp: loc(10, 23, 55) },
    { type: 'user', message: { role: 'user', content: 'Deuxième message' }, timestamp: loc(11, 0, 10) },
    { type: 'assistant', message: { id: 'a2', model: 'claude-opus-5-5', usage: usage(5, 2000, 100, 20), content: [] }, timestamp: loc(11, 0, 15) },
    { type: 'ai-title', aiTitle: 'Titre secret S1' },
  ]);
  ecrireLog(fa, [{ type: 'assistant', isSidechain: true, message: { id: 'ag1', model: 'claude-haiku-4-8', usage: usage(1, 100, 50, 9), content: [] }, timestamp: loc(11, 1, 0) }]);
  fs.writeFileSync(path.join(d1, S1, 'subagents', 'agent-x1.meta.json'), JSON.stringify({ agentType: 'Explore' }));
  ecrireLog(f2, [
    { type: 'user', message: { role: 'user', content: 'Question de la seconde' }, timestamp: loc(11, 14, 0), cwd: 'D:\\autre' },
    { type: 'assistant', message: { id: 'b1', model: 'claude-sonnet-5-5', usage: usage(0, 5000, 0, 100), content: [] }, timestamp: loc(11, 14, 1) },
    { type: 'ai-title', aiTitle: 'Titre S2' },
  ]);
  const ixj = new Index();
  await ixj.mettreAJour();
  const j10 = ixj.periode('2026-03-10', '2026-03-10'); const j11 = ixj.periode('2026-03-11', '2026-03-11');
  verif('day detail: a conversation spanning midnight counts each call on its own local day', j10.total === 1560 && j10.nConversations === 1 && j10.conversations[0].total === 1560 && j10.conversations[0].ctxMax === 1510, JSON.stringify(j10.conversations.map((c) => [c.total, c.ctxMax])));
  verif('day detail: day 2 holds the other half, the subagent and the other conversation (total = split sum)', j11.total === 7385 && j11.tot.read === 7100 && j11.tot.create === 150 && j11.tot.in === 6 && j11.tot.out === 129 && j11.nConversations === 2, JSON.stringify(j11.tot));
  verif('day detail: conversations sorted by tokens used THAT day, with title, project, models, subagent share and peak context', j11.conversations[0].id === S2 && j11.conversations[0].titre === 'Titre S2' && j11.conversations[0].projet === 'autre'
    && j11.conversations[1].id === S1 && j11.conversations[1].total === 2285 && j11.conversations[1].agents === 160 && Math.abs(j11.conversations[1].partAgents - 160 / 2285) < 1e-9
    && j11.conversations[1].ctxMax === 2105 && j11.conversations[1].projet === 'projet-jour' && j11.conversations[1].titre === 'Titre secret S1'
    && j11.conversations[1].modeles.map((m) => `${m.nom}:${m.tokens}`).join() === 'claude-opus-5-5:2125,claude-haiku-4-8:160', JSON.stringify(j11.conversations[1]));
  verif('day detail: tokens per hour of the local day (23 h, then 0 h / 1 h / 14 h)', j10.barres.length === 24 && j10.barres[23].tokens === 1560 && j11.barres[0].tokens === 2125 && j11.barres[1].tokens === 160 && j11.barres[14].tokens === 5100
    && j11.barres.reduce((a, b) => a + b.tokens, 0) === 7385 && j11.granularite === 'heure');
  verif('day detail: per-project and per-model totals', JSON.stringify(j11.projets.map((p) => [p.nom, p.total, p.conversations])) === '[["autre",5100,1],["projet-jour",2285,1]]'
    && JSON.stringify(j11.modeles) === '[{"nom":"claude-sonnet-5-5","tokens":5100},{"nom":"claude-opus-5-5","tokens":2125},{"nom":"claude-haiku-4-8","tokens":160}]', JSON.stringify(j11.modeles));
  verif('day detail: same total as the day bar of the chart (vue)', ixj.vue().jours['2026-03-10'] === 1560 && ixj.vue().jours['2026-03-11'] === 7385);
  const sem = ixj.periode('2026-03-09', '2026-03-15');
  verif('week detail: daily bars over the 7 days, aggregated split and conversations (the spanning one counted once)', sem.granularite === 'jour' && sem.barres.length === 7 && sem.barres[1].cle === '2026-03-10' && sem.barres[1].tokens === 1560 && sem.barres[2].tokens === 7385
    && sem.total === 8945 && sem.nConversations === 2 && sem.conversations.find((c) => c.id === S1).total === 3845 && sem.detailPartiel === false);

  // history file: daily aggregates, no conversation content
  const fh = path.join(path.dirname(process.env.TABLEAU_CACHE), 'historique.json');
  const brut = fs.readFileSync(fh, 'utf8'); const h = JSON.parse(brut);
  verif('history: written next to the cache, one record per local day with split, subagents, conversations, projects, models', h.version === 1 && h.jours['2026-03-11'].total === 7385 && h.jours['2026-03-11'].read === 7100
    && h.jours['2026-03-11'].agents === 160 && h.jours['2026-03-11'].conversations === 2 && h.jours['2026-03-11'].projets.autre === 5100 && h.jours['2026-03-11'].modeles['claude-opus-5-5'] === 2125 && h.jours['2026-03-10'].conversations === 1, brut.slice(0, 300));
  verif('history: no title, prompt, session id nor path stored', !/secret|Titre|seconde|Deuxi|Premier|aaaaaaaa|bbbbbbbb|D:/.test(brut) && brut.includes('projet-jour'), brut);
  // the source logs disappear (Claude Code purge): the totals stay
  for (const f of [f1, f2, fa]) fs.rmSync(f);
  const ixg = new Index();
  await ixg.mettreAJour();
  const g11 = ixg.periode('2026-03-11', '2026-03-11');
  verif('history: the day survives the deletion of its logs (chart, split, projects, models, subagents)', ixg.vue().jours['2026-03-11'] === 7385 && ixg.vue().jours['2026-03-10'] === 1560 && g11.total === 7385 && g11.tot.read === 7100 && g11.agents === 160
    && g11.projets[0].nom === 'autre' && g11.modeles.length === 3, JSON.stringify(g11.tot));
  verif('history: without logs the detail is aggregate only (no conversation) and flagged as such', g11.nConversations === 0 && g11.conversations.length === 0 && g11.detailPartiel === true);
  const gs = ixg.periode('2026-03-09', '2026-03-15');
  verif('history: a week made of recorded days sums them', gs.total === 8945 && gs.barres[2].tokens === 7385 && gs.detailPartiel === true);
  // never downwards
  ecrireLog(f2, [{ type: 'user', message: { role: 'user', content: 'Reste peu' }, timestamp: loc(11, 14, 0), cwd: 'D:\\autre' },
    { type: 'assistant', message: { id: 'c1', model: 'claude-sonnet-5-5', usage: usage(0, 90, 0, 10), content: [] }, timestamp: loc(11, 14, 1) }]);
  const ixd = new Index();
  await ixd.mettreAJour();
  verif('history: a smaller figure for a recorded day never overwrites it (partly deleted logs)', JSON.parse(fs.readFileSync(fh, 'utf8')).jours['2026-03-11'].total === 7385 && ixd.vue().jours['2026-03-11'] === 7385
    && ixd.periode('2026-03-11', '2026-03-11').total === 7385 && ixd.periode('2026-03-11', '2026-03-11').nConversations === 1);
  ecrireLog(path.join(d2, 'bbbbbbbb-0000-0000-0000-000000000003.jsonl'), [{ type: 'user', message: { role: 'user', content: 'Beaucoup' }, timestamp: loc(11, 14, 0), cwd: 'D:\\autre' },
    { type: 'assistant', message: { id: 'c2', model: 'claude-sonnet-5-5', usage: usage(0, 50000, 0, 0), content: [] }, timestamp: loc(11, 14, 1) }]);
  await ixd.mettreAJour();
  const h2 = JSON.parse(fs.readFileSync(fh, 'utf8')).jours['2026-03-11'];
  verif('history: a larger (more complete) figure replaces it', h2.total === 50100 && h2.conversations === 2 && ixd.periode('2026-03-11', '2026-03-11').detailPartiel === false && JSON.parse(fs.readFileSync(fh, 'utf8')).jours['2026-03-10'].total === 1560);
  fs.writeFileSync(fh, '{ pas du json');
  const ixc = new Index();
  verif('history: an unreadable file is set aside, not overwritten, and the index still works', Object.keys(ixc.historique.jours).length === 0 && fs.existsSync(`${fh}.illisible`));
  restaurerEnv();
}

// ---- live view: incremental reader (only the logs that changed are read again), rates, active conversations
{
  const racine = nouveauDossierLogs('direct');
  const maint = Date.now(); const il = (min) => new Date(maint - min * 60000).toISOString();
  const LA = 'cccccccc-0000-0000-0000-00000000000a'; const LB = 'dddddddd-0000-0000-0000-00000000000b'; const LC = 'eeeeeeee-0000-0000-0000-00000000000c';
  const fA = path.join(racine, 'D--live-a', `${LA}.jsonl`); const fB = path.join(racine, 'D--live-b', `${LB}.jsonl`); const fC = path.join(racine, 'D--live-c', `${LC}.jsonl`);
  ecrireLog(fA, [
    { type: 'user', message: { role: 'user', content: 'go' }, timestamp: il(40), cwd: 'D:\\live-a' },
    { type: 'assistant', message: { id: 'la1', model: 'claude-opus-5-5', usage: usage(1, 100000, 60000, 100), content: [] }, timestamp: il(30) },
    { type: 'assistant', message: { id: 'la2', model: 'claude-opus-5-5', usage: usage(1, 170000, 100, 10), content: [] }, timestamp: il(2) },
  ]);
  ecrireLog(fB, [
    { type: 'user', message: { role: 'user', content: 'vieux' }, timestamp: il(30), cwd: 'D:\\live-b' },
    { type: 'assistant', message: { id: 'lb1', model: 'claude-sonnet-5-5', usage: usage(1, 500, 100, 9), content: [] }, timestamp: il(30) },
  ]);
  const vieux = new Date(maint - 3600e3); fs.utimesSync(fB, vieux, vieux); // B was written an hour ago
  const ixl = new Index();
  await ixl.mettreAJour();
  const lus = []; const origine = ixl.lireUn.bind(ixl);
  ixl.lireUn = async (x) => { lus.push(path.basename(x.p)); return origine(x); };
  const etatB = ixl.fichiers[fB].etat; const offsetB = ixl.fichiers[fB].offset;
  let d0 = ixl.direct(maint);
  verif('live: tokens of the last 5 / 60 minutes, rate per minute and one bucket per minute', d0.tokens5 === 170111 && d0.tokens60 === 160101 + 170111 + 610 && d0.debit === Math.round(170111 / 5)
    && d0.minutes.length === 60 && d0.minutes[57] === 170111 && d0.minutes[29] === 160101 + 610 && d0.minutes.reduce((a, b) => a + b, 0) === d0.tokens60, JSON.stringify(d0.minutes));
  verif('live: active = written to in the last 5 minutes (not the log untouched for an hour), with its current context and the >150k warning', d0.actives.length === 1 && d0.actives[0].id === LA
    && d0.actives[0].ctx === 170101 && d0.actives[0].alerte === true && d0.actives[0].tokens5 === 170111 && d0.actives[0].projet === 'live-a');
  fs.appendFileSync(fA, L({ type: 'assistant', message: { id: 'la3', model: 'claude-opus-5-5', usage: usage(1, 40000, 10, 5), content: [] }, timestamp: new Date().toISOString() }) + '{"type":"assistant","message":{"id":"la4"');
  const r1 = await ixl.actualiserRapide();
  verif('live: only the log that grew is read again (not the others), from where it stopped', r1.relus.length === 1 && r1.relus[0] === fA && lus.join() === `${LA}.jsonl`, JSON.stringify(lus));
  verif('live: the other log is left alone (same parsed state, same offset)', ixl.fichiers[fB].etat === etatB && ixl.fichiers[fB].offset === offsetB);
  const d1 = ixl.direct();
  verif('live: the new call shows up at once; today figures follow; the half-written line waits', d1.tokens5 === 170111 + 40016 && d1.actives[0].ctx === 40011 && d1.actives[0].alerte === false && d1.aujourdhui > 0 && Object.keys(d1.jours).length >= 1);
  const r2 = await ixl.actualiserRapide();
  verif('live: nothing changed = nothing read', r2.relus.length === 0 && lus.length === 1);
  ecrireLog(fC, [{ type: 'user', message: { role: 'user', content: 'nouveau' }, timestamp: il(1), cwd: 'D:\\live-c' }, { type: 'assistant', message: { id: 'lc1', model: 'claude-opus-5-5', usage: usage(1, 10, 10, 1), content: [] }, timestamp: il(1) }]);
  const r3 = await ixl.actualiserRapide();
  verif('live: between two full listings a brand new log is not looked for', r3.relus.length === 0);
  const r4 = await ixl.actualiserRapide({ complet: true });
  verif('live: a full listing finds the new log and reads only that one', r4.relus.length === 1 && r4.relus[0] === fC && lus.join() === `${LA}.jsonl,${LC}.jsonl` && ixl.direct().actives.length === 2);
  ixl.enCours = true;
  verif('live: skipped while the full pass is running', (await ixl.actualiserRapide({ complet: true })).saute === true);
  ixl.enCours = false;
  const ixr = new Index();
  verif('live: the recent calls survive a restart (cache)', ixr.direct().tokens60 >= 170111);
  restaurerEnv();
}

// ---- "why so many tokens": findings computed on crafted logs
{
  const racine = nouveauDossierLogs('analyse');
  const SX = 'f0000000-0000-0000-0000-000000000001'; const SY = 'f0000000-0000-0000-0000-000000000002'; const SZ = 'f0000000-0000-0000-0000-000000000003';
  const fX = path.join(racine, 'D--gros-projet', `${SX}.jsonl`); const fY = path.join(racine, 'D--petit-projet', `${SY}.jsonl`); const fZ = path.join(racine, 'D--ancien', `${SZ}.jsonl`);
  const as = (id, ts, u, extra = [], model = 'claude-opus-5-5') => ({ type: 'assistant', message: { id, model, usage: u, content: extra }, timestamp: ts });
  const invite = (texte, ts) => ({ type: 'user', message: { role: 'user', content: texte }, timestamp: ts });
  ecrireLog(fX, [
    { type: 'attachment', cwd: 'D:\gros-projet', attachment: { type: 'instructions', files: [{ path: 'C:\\Users\\x\\.claude\\CLAUDE.md', type: 'User', content: 'a'.repeat(8000) }] }, timestamp: loc(5, 9, 59) },
    { type: 'attachment', attachment: { type: 'skill_listing', content: 's'.repeat(12000), skillCount: 5 }, timestamp: loc(5, 9, 59) },
    { type: 'attachment', attachment: { type: 'mcp_instructions_delta', addedBlocks: ['m'.repeat(2000)] }, timestamp: loc(5, 9, 59) },
    invite('tâche 1', loc(5)),
    { ...as('x1', loc(5, 10, 1), usage(10, 0, 40000, 100), [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'D:\\gros-projet\\gros.txt' } }]) },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(40000) }] }, timestamp: loc(5, 10, 2) },
    as('x2', loc(5, 10, 3), usage(5, 40000, 20000, 100)),
    invite('tâche 2', loc(6)),
    as('x3', loc(6, 10, 1), usage(5, 95000, 5000, 50), [{ type: 'tool_use', id: 't2', name: 'Grep', input: { pattern: 'a' } }]),
    as('x4', loc(6, 10, 2), usage(5, 150000, 5000, 50)),
    invite('tâche 3', loc(7)),
    as('x5', loc(7, 10, 1), usage(5, 165000, 5000, 50), [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'ls' } }, { type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'pwd' } }]),
    as('x6', loc(7, 10, 2), usage(5, 175000, 5000, 50)),
    { type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 900000 }, timestamp: loc(8, 9) },
    invite('tâche 4', loc(8)),
    as('x7', loc(8, 10, 1), usage(5, 0, 30000, 50)),
    { type: 'ai-title', aiTitle: 'Le gros chantier' },
  ]);
  ecrireLog(fY, [
    { type: 'user', message: { role: 'user', content: 'bonjour' }, timestamp: loc(9), cwd: 'D:\\petit-projet' },
    as('y1', loc(9, 10, 1), usage(0, 0, 30000, 10), [], 'claude-sonnet-5-5'),
  ]);
  ecrireLog(path.join(racine, 'D--petit-projet', SY, 'subagents', 'agent-y1.jsonl'), [as('ya', loc(9, 10, 2), usage(1, 500, 500, 10), [], 'claude-haiku-4-8')]);
  fs.writeFileSync(path.join(racine, 'D--petit-projet', SY, 'subagents', 'agent-y1.meta.json'), JSON.stringify({ agentType: 'Explore' }));
  ecrireLog(fZ, [{ type: 'user', message: { role: 'user', content: 'vieux' }, timestamp: new Date(2026, 0, 15, 10).toISOString(), cwd: 'D:\\ancien' }, as('z1', new Date(2026, 0, 15, 10, 1).toISOString(), usage(0, 0, 1000, 5))]);
  const ixa = new Index();
  await ixa.mettreAJour();
  const A = ixa.analyser(7, '2026-03-11');
  const par = (id) => A.constats.find((c) => c.id === id);
  verif('analysis: period = the last N days ending at the given day (the January log is out)', A.de === '2026-03-05' && A.conversations === 2 && ixa.analyser(90, '2026-03-11').conversations === 3 && ixa.analyser(1, '2026-03-09').conversations === 1);
  verif('analysis: findings ranked by tokens concerned, heaviest first', A.constats.length >= 7 && A.constats.every((c, i) => i === 0 || A.constats[i - 1].poids >= c.poids), A.constats.map((c) => `${c.id}:${c.poids}`).join());
  const tot = A.tot.read + A.tot.in + A.tot.out + A.tot.create;
  verif('analysis: share of cache re-reads (history re-read at each call)', par('relus').donnees.read === A.tot.read && A.tokens === tot && Math.abs(par('relus').part - A.tot.read / tot) < 1e-9 && par('relus').donnees.appels === A.tot.appels, JSON.stringify(par('relus')));
  const lo = par('lourdes').donnees;
  verif('analysis: conversations past 150k, with the savings /relais would bring (same rule as the plugin simulation)', lo.n === 1 && lo.relais >= 1 && lo.economie > 0 && lo.simule < lo.reel && lo.seuil === 150000 && lo.top[0].id === SX && lo.top[0].ctxMax === 180005 && lo.pctEco > 0, JSON.stringify(lo));
  const so = par('socle').donnees;
  verif('analysis: starting context = first answer (median), with what it is made of when the log says so', so.n === 2 && so.mediane === 40010 && so.parts.instr === 2000 && so.parts.skills === 3000 && so.parts.mcp === 501
    && so.dominant === 'skills' && so.nSkills === 5 && so.fichiers[0].tokens === 2000 && /CLAUDE\.md$/.test(so.fichiers[0].p) && so.parts.systeme === 40010 - 5501, JSON.stringify(so));
  const ap = par('appels').donnees;
  verif('analysis: tool calls counted per conversation', ap.appels === 4 && ap.n === 2 && ap.parConversation === 2 && ap.nFrequentes === 0, JSON.stringify(ap));
  const gr = par('gros').donnees;
  verif('analysis: heaviest tool results (chars / 4) with the tool and what it read', gr.n === 1 && gr.top[0].tokens === 10000 && gr.top[0].nom === 'Read' && /gros\.txt$/.test(gr.top[0].quoi) && gr.nTresGros === 1 && gr.top[0].titre === 'Le gros chantier');
  const ag = par('agents').donnees;
  verif('analysis: subagent share', ag.tokens === 1011 && ag.n === 1 && ag.types[0].type === 'Explore' && Math.abs(par('agents').part - 1011 / tot) < 1e-9, JSON.stringify(ag));
  const mo = par('modeles').donnees;
  verif('analysis: model mix by family', mo.familles.map((f) => f.famille).join() === 'opus,sonnet,haiku' && mo.opus === mo.familles[0].tokens && Math.abs(mo.familles.reduce((a, f) => a + f.part, 0) - 1) < 1e-9 && mo.familles[1].tokens === 30010 && mo.familles[2].tokens === 1011);
  const lg = par('longues').donnees;
  verif('analysis: automatic compactions counted in the period; a conversation spread over 3 days is a long session', lg.auto === 1 && lg.manuelles === 0 && lg.n === 1 && lg.top[0].id === SX && lg.top[0].heures === 72 && lg.top[0].messages === 4 && par('longues').poids > 0, JSON.stringify(lg));
  verif('analysis: deterministic (same logs, same answer) and a period without activity is empty', JSON.stringify(ixa.analyser(7, '2026-03-11')) === JSON.stringify(A) && ixa.analyser(3, '2026-02-20').constats.length === 0 && ixa.analyser(3, '2026-02-20').tokens === 0);
  // the simulation itself, on a hand-made conversation: context climbs past 150k, then a relay restarts it
  const tour = (texte, appels, ctx) => ({ texte, appels, in: 0, out: 0, read: ctx * appels, create: 0, ctx });
  const { simulerRelais } = await import('./analyse.mjs');
  const sim = simulerRelais([tour('a', 2, 50000), tour('b', 2, 100000), tour('c', 2, 160000), tour('d', 2, 170000), tour('e', 2, 180000)], 40000, 150000);
  verif('simulation: a message sent above the threshold restarts from a fresh session (counted once per restart)', sim.relais === 1 && sim.reel === 2 * (50000 + 100000 + 160000 + 170000 + 180000) && sim.simule < sim.reel && sim.n === 10, JSON.stringify(sim));
  verif('simulation: under the threshold nothing changes, commands and the opening are not moments to relay', (() => { const s = simulerRelais([tour('/clear', 1, 20000), tour('(début)', 2, 30000)], 40000); return s.relais === 0 && s.simule === 2 * 40000 + 40000 && s.reel === 20000 + 60000; })());
  restaurerEnv();
}

// ---- conversation history setting (cleanupPeriodDays in Claude Code's settings.json)
{
  const Gs = await import('./gestion.mjs');
  const avant = process.env.CLAUDE_CONFIG_DIR;
  const nouveau = (nom) => { const d = path.join(TMP, nom); fs.mkdirSync(d, { recursive: true }); process.env.CLAUDE_CONFIG_DIR = d; return path.join(d, 'settings.json'); };
  try {
    let f = nouveau('cfg-absent');
    const a = Gs.historiqueConversations();
    verif('history setting: no settings.json = 30 days (Claude Code default), not explicit, the three choices', a.ok === true && a.jours === 30 && a.explicite === false && a.choix.join() === '30,90,365');
    const a30 = Gs.definirHistorique({ jours: 30 });
    verif('history setting: choosing the default when there is no file writes nothing', a30.ok === true && !fs.existsSync(f));
    const a365 = Gs.definirHistorique({ jours: 365 });
    verif('history setting: 1 year with no file creates settings.json with that one key (nothing to back up)', a365.ok === true && a365.jours === 365 && JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8'))) === '{"cleanupPeriodDays":365}' && !fs.existsSync(`${f}.relais-bak`));

    f = nouveau('cfg-cles');
    const original = '{\n    "env": { "A": "1" },\n    "model": "claude-x",\n    "permissions": { "allow": ["Bash(ls)"] },\n    "hooks": {}\n}\n';
    fs.writeFileSync(f, original);
    verif('history setting: key absent in an existing file = 30, not explicit', Gs.historiqueConversations().jours === 30 && Gs.historiqueConversations().explicite === false);
    const r1 = Gs.definirHistorique({ jours: 365 });
    const o1 = JSON.parse(fs.readFileSync(f, 'utf8'));
    verif('history setting: 365 keeps every other key, its value and its order (new key last)', r1.ok === true && Object.keys(o1).join() === 'env,model,permissions,hooks,cleanupPeriodDays' && o1.cleanupPeriodDays === 365
      && JSON.stringify(o1.permissions) === '{"allow":["Bash(ls)"]}' && o1.env.A === '1' && o1.model === 'claude-x');
    verif('history setting: indentation and final newline of the file are kept', fs.readFileSync(f, 'utf8').startsWith('{\n    "env"') && fs.readFileSync(f, 'utf8').endsWith('}\n'));
    verif('history setting: reads back as 1 year, explicit', Gs.historiqueConversations().jours === 365 && Gs.historiqueConversations().explicite === true);
    verif('history setting: a backup of the original is made once', fs.readFileSync(`${f}.relais-bak`, 'utf8') === original);
    Gs.definirHistorique({ jours: 90 });
    verif('history setting: a second change does not replace the backup (still the very first state)', fs.readFileSync(`${f}.relais-bak`, 'utf8') === original && JSON.parse(fs.readFileSync(f, 'utf8')).cleanupPeriodDays === 90);
    const r30 = Gs.definirHistorique({ jours: 30 });
    const o30 = JSON.parse(fs.readFileSync(f, 'utf8'));
    verif('history setting: 30 removes the key (the default), the other keys stay in order', r30.ok === true && !('cleanupPeriodDays' in o30) && Object.keys(o30).join() === 'env,model,permissions,hooks' && Gs.historiqueConversations().jours === 30);
    verif('history setting: no temporary file left, only the backup next to it', fs.readdirSync(path.dirname(f)).sort().join() === 'settings.json,settings.json.relais-bak');

    f = nouveau('cfg-milieu');
    fs.writeFileSync(f, '{"model":"m","cleanupPeriodDays":10,"env":{}}');
    verif('history setting: a value that is not one of the choices is reported as is', Gs.historiqueConversations().jours === 10);
    Gs.definirHistorique({ jours: 365 });
    verif('history setting: an existing key keeps its place', Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))).join() === 'model,cleanupPeriodDays,env' && JSON.parse(fs.readFileSync(f, 'utf8')).cleanupPeriodDays === 365 && !fs.readFileSync(f, 'utf8').endsWith('\n'));

    f = nouveau('cfg-casse');
    fs.writeFileSync(f, '{ "model": "m", ');
    const bad = Gs.definirHistorique({ jours: 90 });
    verif('history setting: invalid JSON = refused with a clear message, file untouched, no backup, no temporary file', bad.ok === false && /JSON/.test(bad.message) && fs.readFileSync(f, 'utf8') === '{ "model": "m", '
      && fs.readdirSync(path.dirname(f)).join() === 'settings.json');
    const lu = Gs.historiqueConversations();
    verif('history setting: reading invalid JSON says so instead of guessing', lu.ok === false && lu.jours === null);
    fs.writeFileSync(f, '[1,2]');
    verif('history setting: a JSON that is not an object is refused too', Gs.definirHistorique({ jours: 90 }).ok === false && fs.readFileSync(f, 'utf8') === '[1,2]');
    fs.writeFileSync(f, '{}');
    verif('history setting: only 30, 90 or 365 days accepted', Gs.definirHistorique({ jours: 45 }).ok === false && Gs.definirHistorique({ jours: 'abc' }).ok === false && Gs.definirHistorique({}).ok === false && fs.readFileSync(f, 'utf8') === '{}');
    fs.writeFileSync(f, '\uFEFF{"model":"m"}');
    verif('history setting: a file starting with a byte order mark is read', Gs.definirHistorique({ jours: 90 }).ok === true && JSON.parse(fs.readFileSync(f, 'utf8')).cleanupPeriodDays === 90);

    process.env.CLAUDE_CONFIG_DIR = avant;
    const racine = nouveauDossierLogs('taille');
    ecrireLog(path.join(racine, 'D--p', 's1.jsonl'), [{ type: 'user', message: { role: 'user', content: 'x'.repeat(100) }, timestamp: loc(1) }]);
    ecrireLog(path.join(racine, 'D--p', 's1', 'subagents', 'agent-a.jsonl'), [{ type: 'user', message: { role: 'user', content: 'y' }, timestamp: loc(1) }]);
    fs.writeFileSync(path.join(racine, 'D--p', 'notes.txt'), 'pas un journal');
    const tl = Gs.historiqueConversations();
    verif('history setting: size and count of the conversation logs on disk (main threads and subagents, .jsonl only)', tl.fichiers === 2 && tl.octets === fs.statSync(path.join(racine, 'D--p', 's1.jsonl')).size + fs.statSync(path.join(racine, 'D--p', 's1', 'subagents', 'agent-a.jsonl')).size);
    restaurerEnv();
  } finally { process.env.CLAUDE_CONFIG_DIR = avant; restaurerEnv(); }
}

// ---- memory tab: registry + instruction files (memoire.mjs), same format as plugins/relais/scripts/registre.mjs
const M = await import('./memoire.mjs');
const DOSSIER_RELAIS = path.join(CLAUDE, 'relais');
const PROJET_M = path.join(TMP, 'projet-memoire');
{
  verif('memoire: no file = empty registry', M.lireRegistre().entrees.length === 0 && M.fichierRegistre() === path.join(DOSSIER_RELAIS, 'registre.json'));
  const reg = M.lireRegistre();
  const a = M.ajouter(reg, { portee: 'global', sujet: ' Git ', type: 'piege', texte: 'Ne pas pousser sur main', probleme: 'Un push direct a cassé la prod', solution: 'Passer par une branche', corrigeable: true });
  verif('memoire: add = id, origin "utilisateur", topic lower-cased, dates', a.ok && /^r\w{8}$/.test(a.entree.id) && a.entree.origine === 'utilisateur' && a.entree.sujet === 'git'
    && a.entree.actif === true && a.entree.corrigeable === true && !!a.entree.cree && a.entree.cree === a.entree.maj, JSON.stringify(a.entree));
  const b = M.ajouter(reg, { portee: PROJET_M, texte: 'Utiliser pnpm' });
  verif('memoire: project entry without problem / solution carries no empty field, topic defaults to "divers"', b.ok && b.entree.sujet === 'divers' && b.entree.type === 'regle' && !('probleme' in b.entree) && !('solution' in b.entree));
  const dbl = M.ajouter(reg, { portee: 'global', texte: 'ne pas POUSSER sur main.', sujet: 'git' });
  verif('memoire: same scope and same normalised text = refreshed, not duplicated', dbl.ok && dbl.doublon === true && dbl.entree.id === a.entree.id && reg.entrees.length === 2);
  {
    const c = { id: 'rprov0001', portee: 'global', sujet: 's', type: 'regle', texte: 'Règle avec provenance', origine: 'claude', session: 'abcd1234', cree: '2026-01-01T00:00:00Z', actif: true };
    const regP = { entrees: [c] };
    const m = M.modifier(regP, 'rprov0001', { texte: 'Règle avec provenance, retouchée', probleme: '', solution: '', session: '', origine: 'utilisateur', cree: '' });
    verif('memoire: edit keeps origin, session and creation date, and adds no empty field', m.ok && m.entree.origine === 'claude' && m.entree.session === 'abcd1234'
      && m.entree.cree === '2026-01-01T00:00:00Z' && !('probleme' in m.entree) && !('solution' in m.entree) && /retouchée/.test(m.entree.texte), JSON.stringify(m.entree));
  }
  verif('memoire: same text in another scope is another entry', M.ajouter(reg, { portee: PROJET_M, texte: 'Ne pas pousser sur main' }).ok && reg.entrees.length === 3);

  const refus = [
    M.valider({ portee: 'global', texte: 'mot de passe : hunter2hunter2' }), M.valider({ portee: 'global', texte: 'ok', solution: `clé sk-${'a'.repeat(30)}` }),
    M.valider({ portee: 'global', texte: 'ok', probleme: `ghp_${'A'.repeat(36)}` }), M.valider({ portee: 'global', texte: '-----BEGIN RSA ' + 'PRIVATE KEY-----' }),
  ];
  verif('memoire: secrets refused in texte, probleme and solution', refus.every((x) => x.ok === false && /secret/i.test(x.message)), JSON.stringify(refus.map((x) => x.message)));
  verif('memoire: texte and scope required, scope must be "global" or an absolute folder', M.valider({ portee: 'global', texte: '  ' }).ok === false && M.valider({ texte: 'x' }).ok === false
    && M.valider({ portee: 'relatif/dossier', texte: 'x' }).ok === false && M.valider({ portee: 'C:\\projets\\a', texte: 'x' }).ok === true);
  const long = M.valider({ portee: 'global', texte: 'x'.repeat(400), probleme: 'p'.repeat(900), solution: 's'.repeat(900), sujet: 'y'.repeat(50) }).entree;
  verif('memoire: limits (texte 300, problem 800, solution 800, topic 30)', long.texte.length === 300 && long.probleme.length === 800 && long.solution.length === 800 && long.sujet.length === 30);
  const propre = M.valider({ portee: 'global', texte: 'une\nligne\u0007 seule', type: 'inconnu', sujet: 'Sécu/Réseau!' }).entree;
  verif('memoire: one line, control characters stripped, unknown type = rule, topic cleaned', propre.texte === 'une ligne seule' && propre.type === 'regle' && propre.sujet === 'sécuréseau', JSON.stringify(propre));

  // File: atomic write (no temporary file left), valid JSON, unknown fields kept through a modification.
  reg.entrees[0].futur = { garde: 1 };
  M.ecrireRegistre(reg);
  verif('memoire: registry file is valid JSON, version 1, no temporary file left', JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).version === 1
    && JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).entrees.length === 3 && fs.readdirSync(DOSSIER_RELAIS).every((n) => !n.endsWith('.tmp')), fs.readdirSync(DOSSIER_RELAIS).join(','));
  const relu = M.lireRegistre();
  const m1 = M.modifier(relu, relu.entrees[0].id, { id: 'pirate', origine: 'claude', actif: false, texte: 'Pousser par une branche', type: 'solution', corrigeable: false });
  M.ecrireRegistre(relu);
  const disque = JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).entrees[0];
  verif('memoire: edit keeps unknown fields, id, origin and creation date; sets actif, maj', m1.ok && disque.futur?.garde === 1 && disque.id === a.entree.id && disque.origine === 'utilisateur' && disque.cree === a.entree.cree
    && disque.actif === false && disque.texte === 'Pousser par une branche' && disque.type === 'solution' && disque.corrigeable === false && disque.probleme === 'Un push direct a cassé la prod', JSON.stringify(disque));
  verif('memoire: edit refused when it breaks the rules (secret, empty), unknown id', M.modifier(relu, a.entree.id, { texte: 'password=azertyuiop' }).ok === false && M.modifier(relu, a.entree.id, { texte: '' }).ok === false
    && M.modifier(relu, 'zzz', { actif: true }).ok === false && relu.entrees[0].texte === 'Pousser par une branche');
  verif('memoire: delete one entry, unknown id refused', M.supprimer(relu, a.entree.id).ok === true && relu.entrees.length === 2 && M.supprimer(relu, a.entree.id).ok === false);
  fs.writeFileSync(M.fichierRegistre(), '{ pas du json');
  verif('memoire: corrupt registry file = empty registry, no crash', M.lireRegistre().entrees.length === 0);
  fs.rmSync(M.fichierRegistre());

  // Instruction files really loaded (InstructionsLoaded hook): last 7 days, distinct paths, preview, missing file.
  const ETAT_M = path.join(DOSSIER_RELAIS, '.etat');
  fs.mkdirSync(ETAT_M, { recursive: true });
  const FICHIER_CLAUDE = path.join(TMP, 'CLAUDE-test.md');
  const GROS = path.join(TMP, 'gros.md');
  fs.writeFileSync(FICHIER_CLAUDE, '# Règles\n- <script>alert(1)</script>\n');
  fs.writeFileSync(GROS, 'é'.repeat(30000));
  const jour = 86400e3;
  const instr = (nom, o) => fs.writeFileSync(path.join(ETAT_M, `instr_${nom}.json`), JSON.stringify(o));
  instr('s1_aaa', { p: FICHIER_CLAUDE, type: 'Project', raison: 'session_start', parent: '', le: Date.now() - 3 * jour });
  instr('s2_aaa', { p: FICHIER_CLAUDE, type: 'Project', raison: 'compact', parent: '', le: Date.now() - 1 * jour }); // same file, more recent load
  instr('s3_bbb', { p: path.join(TMP, 'disparu.md'), type: 'User', raison: 'session_start', parent: '', le: Date.now() - 2 * jour });
  instr('s4_ccc', { p: path.join(TMP, 'vieux.md'), type: 'User', raison: 'session_start', parent: '', le: Date.now() - 8 * jour });
  instr('s5_ddd', { p: GROS, type: 'Local', raison: 'include', parent: FICHIER_CLAUDE, le: Date.now() - 4 * jour });
  instr('s6_eee', { p: 'relatif/CLAUDE.md', type: 'User', raison: 'session_start', parent: '', le: Date.now() });
  fs.writeFileSync(path.join(ETAT_M, 'instr_s7_fff.json'), 'pas du json');
  fs.writeFileSync(path.join(ETAT_M, 'taille_s8.json'), JSON.stringify({ p: FICHIER_CLAUDE, le: Date.now() })); // not an instr_ file
  fs.writeFileSync(path.join(TMP, 'vieux.md'), 'trop ancien');
  const fl = M.fichiersCharges();
  const parNom = (n) => fl.find((x) => path.basename(x.chemin) === n);
  verif('memoire: files listed = distinct, last 7 days only, newest load first, bad records ignored', fl.length === 3 && fl.map((x) => path.basename(x.chemin)).join() === 'CLAUDE-test.md,disparu.md,gros.md', fl.map((x) => path.basename(x.chemin)).join());
  verif('memoire: same file loaded twice = one line, latest load (reason, time), 2 sessions', parNom('CLAUDE-test.md').raison === 'compact' && parNom('CLAUDE-test.md').sessions === 2 && Date.now() - parNom('CLAUDE-test.md').le < 1.1 * jour);
  verif('memoire: preview = current content of the recorded file, text as is', parNom('CLAUDE-test.md').existe === true && parNom('CLAUDE-test.md').apercu === '# Règles\n- <script>alert(1)</script>\n' && parNom('CLAUDE-test.md').type === 'Project');
  verif('memoire: missing file kept without preview (exists: false), no crash', parNom('disparu.md').existe === false && parNom('disparu.md').apercu === '' && parNom('disparu.md').type === 'User');
  verif('memoire: preview capped at 20 000 characters, marked truncated, parent kept', parNom('gros.md').apercu.length === 20000 && parNom('gros.md').tronque === true && parNom('gros.md').parent === FICHIER_CLAUDE);
  fs.mkdirSync(path.join(TMP, 'dossier.md'));
  instr('s9_ggg', { p: path.join(TMP, 'dossier.md'), type: 'User', raison: 'session_start', le: Date.now() });
  verif('memoire: a folder is never read as a file', M.fichiersCharges().find((x) => x.chemin.endsWith('dossier.md'))?.existe === false);
  fs.rmSync(path.join(ETAT_M, 'instr_s9_ggg.json'));
  const dossiersConnus = M.lire(['D:\\mon-projet', 'd:/Mon-Projet/', PROJET_M]);
  verif('memoire: lire() = entries, distinct known projects (case / slashes ignored), files', dossiersConnus.entrees.length === 0 && dossiersConnus.projets.length === 2 && dossiersConnus.fichiers.length === 3, JSON.stringify(dossiersConnus.projets));
}

// ---- server
const FAUX = path.join(TMP, 'faux-claude.mjs');
const ETAT_CONNEXION = path.join(TMP, 'connecte.txt');
// The fake also plays `claude plugin ...` (state in ETAT_PLUGINS, every call logged in APPELS) and
// `claude --settings <file>` (logged only).
const ETAT_PLUGINS = path.join(TMP, 'faux-plugins.json');
const APPELS = path.join(TMP, 'faux-appels.jsonl');
const CHAT_APPELS = path.join(TMP, 'faux-chat.jsonl');
const SESSION_FAUX = '11111111-2222-4333-8444-555555555555';
fs.writeFileSync(ETAT_PLUGINS, JSON.stringify({ global: { 'taste-skill@taste-skill': true, 'avocat@skills-dir': true }, local: {} }));
fs.writeFileSync(FAUX, `import fs from 'node:fs';
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(APPELS)}, JSON.stringify({ args: a, cwd: process.cwd() }) + '\\n');
const E = ${JSON.stringify(ETAT_PLUGINS)};
const etat = JSON.parse(fs.readFileSync(E, 'utf8'));
const ok = (message) => console.log('progression...\\n' + JSON.stringify({ outcome: 'ok', message }));
if (a[0] === 'plugin') {
  // Like the real one: multi-line, one more 'local' line per project with its own setting (listed from
  // any folder), and every line gives the state in effect in the current folder.
  if (a[1] === 'list') {
    const effectif = (id) => (etat.local[process.cwd()] || {})[id] ?? etat.global[id];
    const lignes = Object.keys(etat.global).map((id) => ({ id, version: '1.0.0', scope: 'user', enabled: effectif(id), mcpServers: { x: { args: ['piege@1.0.0'] } } }));
    for (const [projectPath, ids] of Object.entries(etat.local)) for (const id of Object.keys(ids)) lignes.push({ id, version: '1.0.0', scope: 'local', enabled: effectif(id), projectPath });
    console.log(JSON.stringify(lignes, null, 2));
  }
  else if (a[1] === 'details') console.log('Projected token cost\\n  Always-on:   ~1 216 tok   added to every session');
  else if (a[1] === 'enable' || a[1] === 'disable') {
    const v = a[1] === 'enable';
    if (a[4] === 'local') (etat.local[process.cwd()] ||= {})[a[2]] = v; else etat.global[a[2]] = v;
    fs.writeFileSync(E, JSON.stringify(etat)); ok('fait');
  } else if (a[1] === 'install') { etat.global[a[2]] = true; fs.writeFileSync(E, JSON.stringify(etat)); ok('installé'); }
  else ok('marketplace ajoutée');
} else if (a[0] === '-p') {
  // Rules chat: logs args + stdin; "RENVOIE x" answers x, "ERREUR" fails, "LENT" waits (to be stopped).
  let entree = '';
  for await (const c of process.stdin) entree += c;
  fs.appendFileSync(${JSON.stringify(CHAT_APPELS)}, JSON.stringify({ args: a, cwd: process.cwd(), stdin: entree }) + '\\n');
  if (entree.includes('ERREUR')) { console.error('panne du faux claude'); process.exit(1); }
  const i = a.indexOf('--resume');
  const session = i >= 0 ? a[i + 1] : ${JSON.stringify(SESSION_FAUX)};
  const ecrire = (o) => console.log(JSON.stringify(o));
  ecrire({ type: 'system', subtype: 'init', session_id: session, tools: [] });
  if (entree.includes('LENT')) await new Promise((r) => setTimeout(r, 30000));
  const texte = entree.includes('RENVOIE ') ? entree.slice(entree.indexOf('RENVOIE ') + 8) : 'Bonjour.';
  const moitie = Math.ceil(texte.length / 2);
  for (const morceau of [texte.slice(0, moitie), texte.slice(moitie)]) ecrire({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: morceau } } });
  ecrire({ type: 'result', subtype: 'success', is_error: false, result: texte, session_id: session });
} else if (a[0] !== '--settings') {
  const c = fs.existsSync(${JSON.stringify(ETAT_CONNEXION)});
  console.log(JSON.stringify(c ? { loggedIn: true, authMethod: 'claude.ai', email: 'test@example.com', orgName: 'Org test', subscriptionType: 'max', projectsDirectory: ${JSON.stringify(PROJETS)} } : { loggedIn: false }));
}`);
const appels = () => { try { return fs.readFileSync(APPELS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.args[0] !== 'auth'); } catch { return []; } };
// Fake npm (a .cmd, like the real one): goes through gestion.mjs's cmd.exe path. Only folder in the server's PATH.
const BIN = path.join(TMP, 'bin');
const ARGS_NPM = path.join(TMP, 'npm-args.txt');
const ARGS_UV = path.join(TMP, 'uv-args.txt');
const ARGS_PIPX = path.join(TMP, 'pipx-args.txt');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'npm.cmd'), `@echo %*> "${ARGS_NPM}"\r\n`);
fs.writeFileSync(path.join(BIN, 'pipx.cmd'), `@echo %*> "${ARGS_PIPX}"\r\n`); // the fake uv.cmd is written later, in the test
const ARGS_NPX = path.join(TMP, 'npx-args.txt');
fs.writeFileSync(path.join(BIN, 'npx.cmd'), `@echo %CD%^|%*> "${ARGS_NPX}"\r\n`); // folder it ran in | arguments
fs.writeFileSync(path.join(CLAUDE, '.claude.json'), JSON.stringify({ oauthAccount: { displayName: 'Testeur' } }));

// A server in its own process, in the given language (TABLEAU_LANGUE).
function lancerServeur(langue) {
  const port = 47000 + Math.floor(Math.random() * 1500);
  const enfant = spawn(process.execPath, [path.join(ici, 'serveur.mjs'), '--port', String(port), '--sans-navigateur'], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH')), PATH: BIN, TABLEAU_CLAUDE: FAUX, TABLEAU_LANGUE: langue },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const adresse = new Promise((res, rej) => {
    let out = '';
    enfant.stdout.on('data', (c) => { out += c; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) res(m[0].replace(/\/$/, '')); });
    enfant.on('exit', () => rej(new Error(`server exited: ${out}`)));
    setTimeout(() => rej(new Error('server did not start')), 15000);
  });
  return { enfant, adresse };
}
const { enfant: srv, adresse } = lancerServeur('fr');
const base = await adresse;
const get = (p, h = {}) => fetch(base + p, { headers: h });
const post = (p, corps, h = { 'Content-Type': 'application/json', 'X-Relais': '1' }) => fetch(base + p, { method: 'POST', headers: h, body: JSON.stringify(corps) });

try {
  const c0 = await (await get('/api/compte')).json();
  verif('account: signed out is reported', c0.connecte === false && /aucun compte/.test(c0.raison), JSON.stringify(c0));
  verif('account: data locked while signed out', (await get('/api/conversations')).status === 401 && (await post('/api/avocat', { actif: true })).status === 401);
  verif('memoire (api): locked while signed out too (read and write)', (await get('/api/memoire')).status === 401 && (await post('/api/memoire/ajouter', { portee: 'global', texte: 'x' })).status === 401);
  verif('account: page itself still loads (sign-in screen)', (await get('/')).status === 200);
  verif('node (api): locked while signed out, like the other data routes', (await get('/api/node')).status === 401);
  const lfr = await get('/api/langue');
  verif('langue: /api/langue reachable before sign-in, French here', lfr.status === 200 && (await lfr.json()).langue === 'fr');
  const i18n = await get('/i18n.js');
  verif('langue: the dictionary is served as a script from the fixed list', i18n.status === 200 && /javascript/.test(i18n.headers.get('content-type') || ''));
  fs.writeFileSync(ETAT_CONNEXION, '1');
  const c1 = await (await post('/api/compte/verifier', {})).json();
  verif('account: signed in after "Vérifier"', c1.connecte === true && c1.email === 'test@example.com' && c1.abonnement === 'Max' && c1.nom === 'Testeur', JSON.stringify(c1));
  verif('account: no token in the answer', !/token|access|refresh/i.test(JSON.stringify(c1)));
  await new Promise((r) => setTimeout(r, 800));
  const l = await (await get('/api/conversations')).json();
  verif('server: conversation list', Array.isArray(l) && l.some((x) => x.id === SID), JSON.stringify(l).slice(0, 120));
  {
    const jj = await get('/api/jour?date=2026-10-04'); const jd = await jj.json();
    verif('server: /api/jour = the detail of a local day (split, 24 hourly bars, conversations)', jj.status === 200 && jd.granularite === 'heure' && jd.barres.length === 24 && jd.total > 0 && jd.conversations.some((c) => c.id === SID), JSON.stringify(jd).slice(0, 160));
    const jw = await (await get('/api/jour?date=2026-09-28&fin=2026-10-04')).json();
    verif('server: /api/jour with a range = daily bars over the period', jw.granularite === 'jour' && jw.barres.length === 7 && jw.total === jd.total);
    verif('server: /api/jour refuses bad or oversized dates', (await get('/api/jour')).status === 400 && (await get('/api/jour?date=hier')).status === 400 && (await get('/api/jour?date=2026-10-04&fin=2026-10-03')).status === 400
      && (await get('/api/jour?date=2024-01-01&fin=2026-10-04')).status === 400 && (await get('/api/jour?date=../../x')).status === 400);
    const dr = await (await get('/api/direct')).json();
    verif('server: /api/direct = live figures (windows, rate, minutes, active conversations, today)', Array.isArray(dr.minutes) && dr.minutes.length === 60 && typeof dr.tokens5 === 'number' && typeof dr.debit === 'number' && Array.isArray(dr.actives) && typeof dr.aujourdhui === 'number' && typeof dr.jours === 'object');
    const an = await (await get('/api/analyse?jours=3650')).json(); const an2 = await (await get('/api/analyse?jours=abc')).json();
    verif('server: /api/analyse = ranked findings, period clamped to 365 days, default 30', an.jours === 365 && an2.jours === 30 && Array.isArray(an.constats) && an.constats.every((c, i) => i === 0 || an.constats[i - 1].poids >= c.poids));
    verif('server: the calendar helpers are served as a script from the fixed list', (await get('/periodes.js')).status === 200 && /javascript/.test((await get('/periodes.js')).headers.get('content-type') || ''));
    const h0 = await (await get('/api/historique')).json();
    verif('server: /api/historique reads the setting (30 by default) and the logs size', h0.ok === true && h0.jours === 30 && h0.fichiers >= 2 && h0.octets > 0, JSON.stringify(h0));
    const h1 = await post('/api/historique', { jours: 90 });
    const h1j = await h1.json();
    verif('server: POST /api/historique changes it (same checks as every POST), refuses other values', h1.status === 200 && h1j.jours === 90 && JSON.parse(fs.readFileSync(path.join(CLAUDE, 'settings.json'), 'utf8')).cleanupPeriodDays === 90
      && (await post('/api/historique', { jours: 7 })).status === 400 && (await post('/api/historique', { jours: 90 }, { 'Content-Type': 'application/json' })).status === 403);
    await post('/api/historique', { jours: 30 });
    fs.rmSync(path.join(CLAUDE, 'settings.json'), { force: true }); fs.rmSync(path.join(CLAUDE, 'settings.json.relais-bak'), { force: true });
  }
  verif('server: one message in detail, bad number or id = 404', (await get(`/api/conversation/tour?id=${SID}&n=0`)).status === 200
    && (await get(`/api/conversation/tour?id=${SID}&n=-1`)).status === 404 && (await get(`/api/conversation/tour?id=${SID}&n=abc`)).status === 404
    && (await get('/api/conversation/tour?id=inconnu&n=0')).status === 404);
  verif('server: unknown conversation = 404', (await get('/api/conversation?id=..%2F..%2Fetc')).status === 404);
  verif('server: static files only from the fixed list', (await get('/../serveur.mjs')).status !== 200 && (await get('/public/app.js')).status === 404);
  const page = await get('/');
  verif('server: security headers', /frame-ancestors 'none'/.test(page.headers.get('content-security-policy') || '') && page.headers.get('x-content-type-options') === 'nosniff');
  // fetch() cannot forge Host: raw request.
  const statutHote = await new Promise((res) => http.get({ host: '127.0.0.1', port: Number(new URL(base).port), path: '/api/conversations', headers: { Host: 'evil.example' } }, (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0)));
  verif('server: foreign Host refused (DNS rebinding)', statutHote === 403, String(statutHote));
  verif('server: POST without the custom header refused (CSRF)', (await post('/api/avocat', { actif: true }, { 'Content-Type': 'application/json' })).status === 403);
  verif('server: GET from another site refused (Sec-Fetch-Site)', (await fetch(base + '/api/gestion/plugins', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status === 403 && (await fetch(base + '/api/langue', { headers: { 'Sec-Fetch-Site': 'same-site' } })).status === 403);
  verif('server: GET from the page itself accepted (Sec-Fetch-Site: same-origin)', (await fetch(base + '/api/langue', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status === 200);
  verif('server: POST from another site refused', (await post('/api/avocat', { actif: true }, { 'Content-Type': 'application/json', 'X-Relais': '1', Origin: 'https://evil.example' })).status === 403);
  verif('server: devil\'s advocate switch writes the shared file', (await post('/api/avocat', { actif: true })).status === 200
    && JSON.parse(fs.readFileSync(process.env.AVOCAT_ETAT, 'utf8')).actif === true);
  verif('server: bad switch value refused', (await post('/api/avocat', { actif: 'oui' })).status === 400);
  const skills = await (await get('/api/skills')).json();
  verif('skills: catalogue lists relais and avocat', ['relais', 'avocat'].every((n) => skills.some((s) => s.nom === n && s.etat === 'absent')), skills.map((s) => s.nom).join(','));
  verif('skills: avocat exposes its agent and its /avocat command', skills.find((s) => s.nom === 'avocat')?.agents.some((a) => a.nom === 'avocat-du-diable')
    && skills.find((s) => s.nom === 'avocat')?.skills.some((s) => s.nom === 'avocat'));
  const inst = await post('/api/skills/installer', { nom: 'avocat' });
  const cible = path.join(CLAUDE, 'skills', 'avocat');
  verif('skills: install copies into <config>/skills/<name>', inst.status === 200 && fs.existsSync(path.join(cible, 'hooks', 'hooks.json')) && fs.existsSync(path.join(cible, 'agents', 'avocat-du-diable.md')));
  verif('skills: tests are not copied', !fs.existsSync(path.join(cible, 'scripts', 'tester.mjs')) && fs.existsSync(path.join(cible, 'scripts', 'verifier.mjs')));
  verif('skills: now reported installed', (await (await get('/api/skills')).json()).find((s) => s.nom === 'avocat')?.etat === 'a-jour');
  verif('skills: unknown or path-like name refused', (await post('/api/skills/installer', { nom: '../../x' })).status === 400 && (await post('/api/skills/installer', { nom: 'inconnu' })).status === 400);
  const ext = await (await get('/api/skills/externes')).json();
  // Card template: every card has every field, in French AND English, same number of items in both.
  const { SKILLS_EXTERNES, CATEGORIES, CHAMPS_TRADUITS, skillsExternes } = await import('./skills-externes.mjs');
  const plein = (v) => (Array.isArray(v) ? v.length > 0 && v.every(plein) : typeof v === 'string' ? v.trim().length > 0 : false);
  const trous = SKILLS_EXTERNES.flatMap((f) => [
    ...['id', 'nom', 'depot', 'licence'].filter((k) => !plein(f[k])).map((k) => `${f.id}.${k}`),
    ...(Number.isInteger(f.etoiles) ? [] : [`${f.id}.etoiles`]),
    ...(CATEGORIES.some((c) => c.id === f.categorie) ? [] : [`${f.id}.categorie`]),
    ...(f.cout && (f.cout.jetons === null || Number.isInteger(f.cout.jetons)) && plein(f.cout.note?.fr) && plein(f.cout.note?.en) ? [] : [`${f.id}.cout`]),
    ...CHAMPS_TRADUITS.flatMap((k) => ['fr', 'en'].filter((l) => !plein(f[k]?.[l])).map((l) => `${f.id}.${k}.${l}`)),
    ...['schema', 'description', 'contenu', 'installation', 'utilisation'].filter((k) => f[k]?.fr?.length !== f[k]?.en?.length).map((k) => `${f.id}.${k} (fr/en)`),
    ...(f.schema?.fr?.length >= 3 && f.schema.fr.length <= 6 ? [] : [`${f.id}.schema (3 à 6 étapes)`]),
    ...['contenu', 'installation'].filter((k) => !f[k]?.fr?.every((x, n) => Array.isArray(x) && x.length === 2 && (k !== 'installation' || x[1] === f[k].en[n][1]))).map((k) => `${f.id}.${k} (paires)`),
  ]);
  verif('skills externes: every card follows the template, in French and English', trous.length === 0, trous.join(', '));
  verif('skills externes: ECC, Taste Skill, DESIGN.md, Vercel, Graphify, Remotion listed', ['ecc', 'taste-skill', 'awesome-design-md', 'vercel', 'graphify', 'remotion'].every((id) => ext.skills?.some((s) => s.id === id)));
  // Demo video: fixed route, Range support (seeking), nothing else under /demo/.
  const videoDisque = fs.readFileSync(path.join(ici, 'public', 'demo-remotion.mp4'));
  const v200 = await get('/demo/remotion.mp4');
  const corps200 = Buffer.from(await v200.arrayBuffer());
  verif('demo: GET /demo/remotion.mp4 = 200, video/mp4, whole file, Accept-Ranges, security headers', v200.status === 200 && v200.headers.get('content-type') === 'video/mp4'
    && v200.headers.get('accept-ranges') === 'bytes' && corps200.equals(videoDisque) && v200.headers.get('x-content-type-options') === 'nosniff'
    && /default-src 'self'/.test(v200.headers.get('content-security-policy')) && !/media-src/.test(v200.headers.get('content-security-policy')), `${v200.status} ${corps200.length}/${videoDisque.length}`);
  const v206 = await get('/demo/remotion.mp4', { Range: 'bytes=0-99' });
  const corps206 = Buffer.from(await v206.arrayBuffer());
  verif('demo: Range bytes=0-99 = 206, exactly 100 bytes, right Content-Range', v206.status === 206 && corps206.length === 100 && corps206.equals(videoDisque.subarray(0, 100))
    && v206.headers.get('content-range') === `bytes 0-99/${videoDisque.length}` && v206.headers.get('content-length') === '100', `${v206.status} ${corps206.length} ${v206.headers.get('content-range')}`);
  const vFin = await get('/demo/remotion.mp4', { Range: `bytes=${videoDisque.length - 10}-` });
  const vSuffixe = await get('/demo/remotion.mp4', { Range: 'bytes=-5' });
  const vDepasse = await get('/demo/remotion.mp4', { Range: `bytes=100-${videoDisque.length * 2}` });
  verif('demo: open-ended, suffix and over-long ranges are clamped', vFin.status === 206 && Buffer.from(await vFin.arrayBuffer()).equals(videoDisque.subarray(-10))
    && vSuffixe.status === 206 && Buffer.from(await vSuffixe.arrayBuffer()).equals(videoDisque.subarray(-5))
    && vDepasse.status === 206 && vDepasse.headers.get('content-range') === `bytes 100-${videoDisque.length - 1}/${videoDisque.length}`);
  const v416 = [await get('/demo/remotion.mp4', { Range: `bytes=${videoDisque.length}-` }), await get('/demo/remotion.mp4', { Range: 'bytes=999999999-1000000000' }),
    await get('/demo/remotion.mp4', { Range: 'bytes=50-10' }), await get('/demo/remotion.mp4', { Range: 'bytes=-' }), await get('/demo/remotion.mp4', { Range: 'bytes=abc' })];
  verif('demo: out-of-range or malformed Range = 416 with Content-Range bytes */size', v416.every((r) => r.status === 416 && r.headers.get('content-range') === `bytes */${videoDisque.length}`), v416.map((r) => r.status).join(','));
  // Raw requests: fetch() refuses to forge a Host header.
  const brut = (chemin, entetes = {}) => new Promise((resoudre, rejeter) => {
    const u = new URL(base);
    const rq = http.request({ host: u.hostname, port: u.port, path: chemin, method: 'GET', headers: entetes }, (rep) => { rep.resume(); rep.on('end', () => resoudre(rep.statusCode)); });
    rq.on('error', rejeter); rq.end();
  });
  const autres = await Promise.all(['/demo/', '/demo/autre.mp4', '/demo/remotion.mp4/x', '/demo/..%2fapp.js', '/demo/..%5c..%5cserveur.mjs', '/demo/remotion.webm', '/demo/remotion.mp4?x=/../../etc'].map((u) => brut(u)));
  verif('demo: any other path under /demo/ is 404 (encoded traversal included); a query string changes nothing', autres.slice(0, 6).every((c) => c === 404) && autres[6] === 200, autres.join(','));
  verif('demo: refused from another site or with a foreign Host (same checks as the other routes)', (await brut('/demo/remotion.mp4', { 'Sec-Fetch-Site': 'cross-site' })) === 403
    && (await brut('/demo/remotion.mp4', { Host: 'evil.example' })) === 403);
  const carteDemo = (l) => skillsExternes(l).skills.find((x) => x.id === 'remotion');
  verif('demo: the Remotion card carries demo + prompt in French and English, the video route exists',
    ['fr', 'en'].every((l) => carteDemo(l).demo?.video === '/demo/remotion.mp4' && plein(carteDemo(l).demo.legende) && plein(carteDemo(l).prompt?.texte) && plein(carteDemo(l).prompt?.conseil))
    && carteDemo('fr').demo.legende !== carteDemo('en').demo.legende && carteDemo('fr').prompt.texte !== carteDemo('en').prompt.texte
    && carteDemo('fr').prompt.texte.includes('[ton sujet]') && carteDemo('en').prompt.texte.includes('[your topic]')
    && ext.skills.find((x) => x.id === 'remotion').demo?.video === '/demo/remotion.mp4' && ext.skills.find((x) => x.id === 'graphify').demo === null);
  verif('demo: every card with a demo points to a served route, texts have no em / en dash',
    SKILLS_EXTERNES.filter((x) => x.demo).every((x) => /^\/demo\/[\w-]+\.mp4$/.test(x.demo.video)) && !/[–—]/.test(JSON.stringify(SKILLS_EXTERNES.map((x) => [x.demo, x.prompt]))));
  const fr = skillsExternes('fr'); const en = skillsExternes('en');
  verif('skills externes: one language at a time, English by default', fr.skills[0].resume === SKILLS_EXTERNES[0].resume.fr && en.skills[0].resume === SKILLS_EXTERNES[0].resume.en
    && skillsExternes('de').langue === 'en' && skillsExternes().langue === 'en' && typeof fr.categories[0].nom === 'string', JSON.stringify(ext).slice(0, 200));

  // ---- skill management (gestion.mjs) against the fake claude
  const PROJ = path.join(TMP, 'projet-a');
  fs.mkdirSync(PROJ);
  const reelProj = fs.realpathSync.native(PROJ);
  const pl = await (await get('/api/gestion/plugins')).json();
  verif('gestion: installed plugins listed with their always-on cost', pl.ok && pl.plugins.length === 2 && pl.plugins.every((p) => p.cout === 1216 && p.actif), JSON.stringify(pl).slice(0, 200));
  let r = await post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: false, portee: 'user' });
  const dernier = () => appels().at(-1);
  verif('gestion: switch off everywhere = claude plugin disable --scope user', r.status === 200
    && JSON.stringify(dernier().args) === JSON.stringify(['plugin', 'disable', 'taste-skill@taste-skill', '--scope', 'user', '--json']));
  r = await post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: true, portee: 'local', projet: PROJ });
  verif('gestion: switch on in one project = enable --scope local run INSIDE that folder', r.status === 200 && dernier().args[1] === 'enable' && dernier().args[4] === 'local'
    && path.resolve(dernier().cwd).toLowerCase() === reelProj.toLowerCase(), JSON.stringify(dernier()));
  const dansProjet = await (await get(`/api/gestion/plugins?projet=${encodeURIComponent(PROJ)}`)).json();
  const ailleurs = await (await get('/api/gestion/plugins')).json();
  verif('gestion: the project sees it on, everywhere else it stays off',
    dansProjet.plugins.find((p) => p.nom === 'taste-skill')?.actif === true && ailleurs.plugins.find((p) => p.nom === 'taste-skill')?.actif === false);
  verif('gestion: a plugin set both everywhere and in one project is listed once (claude gives one line per scope)',
    [dansProjet, ailleurs].every((l) => l.plugins.length === 2 && l.plugins.filter((p) => p.id === 'taste-skill@taste-skill').length === 1), JSON.stringify(ailleurs.plugins));
  const avant = appels().length;
  const refus = await Promise.all([
    post('/api/gestion/activer', { id: 'x" & calc', actif: true, portee: 'user' }),
    post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: 'oui', portee: 'user' }),
    post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: true, portee: 'project' }),
    post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: true, portee: 'local', projet: 'relatif\\dossier' }),
    post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: true, portee: 'local', projet: '\\\\serveur\\partage' }),
    post('/api/gestion/activer', { id: 'taste-skill@taste-skill', actif: true, portee: 'local', projet: path.join(TMP, 'absent') }),
    get('/api/gestion/plugins?projet=relatif'),
  ]);
  verif('gestion: bad id, value, scope or folder refused without running claude', refus.every((x) => x.status === 400) && appels().length === avant, refus.map((x) => x.status).join(','));

  // ---- skills installed by hand (read-only list of plain folders)
  {
    const { lireFrontmatter } = await import('./gestion.mjs');
    const fm = lireFrontmatter('﻿---\r\nname: "couture"\r\ndescription: >\r\n  Coud des boutons\r\n  et des ourlets.\r\n__proto__: x\r\n---\r\n# corps');
    verif('skills a la main: frontmatter read (quotes, folded block, CRLF, BOM), __proto__ harmless',
      fm.name === 'couture' && fm.description === 'Coud des boutons et des ourlets.' && ({}).x === undefined && Object.getPrototypeOf(fm) === null, JSON.stringify(fm));
    verif('skills a la main: no frontmatter = nothing read', Object.keys(lireFrontmatter('# juste du texte\nname: non')).length === 0);

    const SK = path.join(CLAUDE, 'skills');
    const ecrire = (dossierSkills, nom, texte) => { fs.mkdirSync(path.join(dossierSkills, nom), { recursive: true }); if (texte !== null) fs.writeFileSync(path.join(dossierSkills, nom, 'SKILL.md'), texte); };
    ecrire(SK, 'couture', '---\nname: couture-pro\ndescription: "Coud des boutons"\n---\nCorps');
    ecrire(SK, 'sans-description', '---\nname: sans-description\n---\n');
    ecrire(SK, 'sans-entete', '# pas de frontmatter\n');
    ecrire(SK, 'trop-long', `---\nname: trop-long\ndescription: ${'x'.repeat(1000)}\n---\n`);
    ecrire(SK, 'pas-un-skill', null);
    fs.writeFileSync(path.join(SK, 'pas-un-skill', 'README.md'), 'rien');
    fs.writeFileSync(path.join(SK, 'fichier-seul.md'), '---\nname: x\n---\n');
    // A link to a folder outside: must not be listed nor read (needs rights on some Windows setups: junction needs none).
    const dehors = path.join(TMP, 'dehors-skill');
    ecrire(dehors, 'x', null);
    fs.writeFileSync(path.join(dehors, 'SKILL.md'), '---\nname: via-lien\n---\n');
    let lienFait = false;
    try { fs.symlinkSync(dehors, path.join(SK, 'lien-sortant'), 'junction'); lienFait = true; } catch { /* no rights: skipped */ }
    ecrire(path.join(PROJ, '.claude', 'skills'), 'local-a', '---\nname: local-a\ndescription: Pour ce projet seulement\n---\n');

    const partout = await (await get('/api/gestion/skills-manuels')).json();
    const nomsPartout = partout.skills.map((x) => x.nom);
    const trouve = (l, nom) => l.skills.find((x) => x.nom === nom);
    verif('skills a la main: every SKILL.md folder of <config>/skills listed, with name, description and folder',
      partout.ok && trouve(partout, 'couture-pro')?.description === 'Coud des boutons' && trouve(partout, 'couture-pro').portee === 'partout'
      && trouve(partout, 'couture-pro').dossier === path.join(SK, 'couture') && trouve(partout, 'couture-pro').parRelais === false, JSON.stringify(partout).slice(0, 300));
    verif('skills a la main: missing description = empty text, no frontmatter = folder name',
      trouve(partout, 'sans-description')?.description === '' && trouve(partout, 'sans-entete')?.dossier === path.join(SK, 'sans-entete'));
    verif('skills a la main: long description capped', trouve(partout, 'trop-long')?.description.length === 400);
    verif('skills a la main: folder without SKILL.md, loose file and outgoing link ignored',
      !nomsPartout.includes('pas-un-skill') && !nomsPartout.includes('fichier-seul') && !nomsPartout.includes('via-lien') && !nomsPartout.includes('lien-sortant'),
      `${nomsPartout.join(',')} (link made: ${lienFait})`);
    verif('skills a la main: no project = no project skill', !nomsPartout.includes('local-a') && partout.projet === '');
    const avecProjet = await (await get(`/api/gestion/skills-manuels?projet=${encodeURIComponent(PROJ)}`)).json();
    verif('skills a la main: project scope adds <projet>/.claude/skills, tagged "projet"',
      trouve(avecProjet, 'local-a')?.portee === 'projet' && trouve(avecProjet, 'local-a').dossier.toLowerCase() === path.join(reelProj, '.claude', 'skills', 'local-a').toLowerCase()
      && trouve(avecProjet, 'couture-pro')?.portee === 'partout', JSON.stringify(avecProjet).slice(0, 300));
    const copie = trouve(partout, 'avocat');
    verif('skills a la main: a copy installed by the app is shown and flagged, a hand-made one is not',
      copie?.parRelais === true && copie.description.length > 0 && partout.skills.filter((x) => x.parRelais).every((x) => ['relais', 'avocat', 'images'].includes(x.nom)), JSON.stringify(copie));
    const refusM = await Promise.all([get('/api/gestion/skills-manuels?projet=relatif'), get(`/api/gestion/skills-manuels?projet=${encodeURIComponent('\\\\serveur\\partage')}`),
      get(`/api/gestion/skills-manuels?projet=${encodeURIComponent(path.join(TMP, 'absent'))}`)]);
    verif('skills a la main: bad project folder refused (400)', refusM.every((x) => x.status === 400), refusM.map((x) => x.status).join(','));
    const GRAND = path.join(TMP, 'projet-grand');
    for (let i = 0; i < 205; i++) ecrire(path.join(GRAND, '.claude', 'skills'), `s${String(i).padStart(3, '0')}`, `---\nname: s${i}\n---\n`);
    const grand = await (await get(`/api/gestion/skills-manuels?projet=${encodeURIComponent(GRAND)}`)).json();
    verif('skills a la main: list limited to 200, flagged as cut', grand.skills.length === 200 && grand.tronque === true, `${grand.skills.length} ${grand.tronque}`);
    verif('skills a la main: nothing run (no claude call)', appels().length === avant);
    for (const n of ['couture', 'sans-description', 'sans-entete', 'trop-long', 'pas-un-skill', 'lien-sortant']) fs.rmSync(path.join(SK, n), { recursive: true, force: true });
    fs.rmSync(path.join(SK, 'fichier-seul.md'), { force: true });
    fs.rmSync(path.join(PROJ, '.claude'), { recursive: true, force: true });
  }

  r = await post('/api/externes/installer', { id: 'taste-skill' });
  const deux = appels().slice(-2).map((x) => x.args.join(' '));
  verif('externes: Install = marketplace add then plugin install, never -y', r.status === 200
    && deux[0] === 'plugin marketplace add Leonxlnx/taste-skill --json' && deux[1] === 'plugin install taste-skill@taste-skill --json', deux.join(' | '));
  r = await post('/api/externes/installer', { id: 'ecc' });
  const trois = appels().slice(-3).map((x) => x.args.join(' '));
  verif('externes: ECC (too expensive) is switched off everywhere right after install', r.status === 200
    && trois.join(' | ') === 'plugin marketplace add affaan-m/ECC --json | plugin install ecc@ecc --json | plugin disable ecc@ecc --scope user --json', trois.join(' | '));
  verif('externes: unknown card refused', (await post('/api/externes/installer', { id: 'inconnu' })).status === 400 && (await post('/api/externes/installer', { id: 'awesome-design-md' })).status === 400);
  r = await post('/api/externes/installer', { id: 'vercel' });
  verif('externes: npm (.cmd) started through cmd.exe with fixed arguments', r.status === 200 && fs.readFileSync(ARGS_NPM, 'utf8').trim() === 'install -g vercel', `${r.status} ${fs.existsSync(ARGS_NPM) ? fs.readFileSync(ARGS_NPM, 'utf8') : 'absent'}`);
  const lire = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'absent');
  r = await post('/api/externes/installer', { id: 'graphify' });
  verif('externes: uv missing -> pipx install (Python tool)', r.status === 200 && lire(ARGS_PIPX) === 'install graphifyy' && (await r.json()).message.includes('(pipx)'), `${r.status} ${lire(ARGS_PIPX)}`);
  fs.writeFileSync(path.join(BIN, 'uv.cmd'), `@echo %*> "${ARGS_UV}"\r\n`);
  r = await post('/api/externes/installer', { id: 'graphify' });
  const mUv = r.status === 200 ? (await r.json()).message : '';
  verif('externes: uv tool install only, never "graphify install" (no CLAUDE.md, no hooks)', lire(ARGS_UV) === 'tool install graphifyy' && mUv.includes('(uv)') && mUv.includes('--code-only'), `${r.status} ${lire(ARGS_UV)} ${mUv}`);
  fs.writeFileSync(path.join(PROJ, 'DESIGN.md'), 'le mien');
  const dExiste = await post('/api/externes/design', { style: 'vercel', projet: PROJ });
  verif('design: an existing DESIGN.md is never overwritten without asking', dExiste.status === 400 && (await dExiste.json()).existe === true && fs.readFileSync(path.join(PROJ, 'DESIGN.md'), 'utf8') === 'le mien');
  const dRefus = await Promise.all([post('/api/externes/design', { style: '../../x', projet: PROJ }), post('/api/externes/design', { style: 'vercel', projet: 'relatif' })]);
  verif('design: unknown style or bad folder refused', dRefus.every((x) => x.status === 400));
  r = await post('/api/externes/skills', { id: 'remotion', projet: PROJ });
  const [ouNpx, argsNpx] = lire(ARGS_NPX).split('|');
  verif('skills: npx skills add run INSIDE the chosen project, skills copied (project only, never -g)', r.status === 200
    && path.resolve(ouNpx.trim()).toLowerCase() === reelProj.toLowerCase()
    && argsNpx === '-y skills add remotion-dev/skills -a claude-code -s remotion-best-practices remotion-create remotion-markup remotion-render --copy -y', `${r.status} ${lire(ARGS_NPX)}`);
  fs.rmSync(ARGS_NPX, { force: true });
  const sRefus = await Promise.all([post('/api/externes/skills', { id: 'graphify', projet: PROJ }), post('/api/externes/skills', { id: 'remotion', projet: 'relatif' }),
    post('/api/externes/skills', { id: 'remotion' }), post('/api/externes/installer', { id: 'remotion' })]);
  verif('skills: other card, bad folder, no folder or plain Install refused without running npx', sRefus.every((x) => x.status === 400) && !fs.existsSync(ARGS_NPX), sRefus.map((x) => x.status).join(','));

  r = await (await post('/api/gestion/profil', { nom: 'Design', plugins: { 'taste-skill@taste-skill': true, 'avocat@skills-dir': false, 'mauvais id': true, 'x@y': 'oui' } })).json();
  const fSettings = path.join(CLAUDE, 'tableau-relais', `profil-${r.profil?.id}.settings.json`);
  verif('profils: saved, only valid entries kept, settings file written', r.ok && JSON.stringify(JSON.parse(fs.readFileSync(fSettings, 'utf8'))) === JSON.stringify({ enabledPlugins: { 'taste-skill@taste-skill': true, 'avocat@skills-dir': false } }));
  const lp = await (await get('/api/gestion/profils')).json();
  verif('profils: listed with the command to copy', lp.length === 1 && lp[0].commande === `claude --settings "${fSettings}"`, JSON.stringify(lp));
  verif('profils: nameless profile refused', (await post('/api/gestion/profil', { nom: '  ', plugins: {} })).status === 400);
  r = await post('/api/gestion/lancer', { id: lp[0].id, projet: PROJ });
  let lance = null;
  for (let i = 0; i < 50 && !lance; i++) { await new Promise((s) => setTimeout(s, 100)); lance = appels().find((x) => x.args[0] === '--settings'); }
  verif('profils: Launch = claude --settings <profile> inside the project', r.status === 200 && lance?.args[1] === fSettings && path.resolve(lance.cwd).toLowerCase() === reelProj.toLowerCase(), JSON.stringify(lance));
  verif('profils: launch refused for unknown profile or bad folder', (await post('/api/gestion/lancer', { id: 'abcdef12', projet: PROJ })).status === 400 && (await post('/api/gestion/lancer', { id: lp[0].id, projet: 'relatif' })).status === 400);
  r = await post('/api/gestion/profil/supprimer', { id: lp[0].id });
  verif('profils: deleted with its settings file', r.status === 200 && !fs.existsSync(fSettings) && (await (await get('/api/gestion/profils')).json()).length === 0);
  fs.mkdirSync(path.join(CLAUDE, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(CLAUDE, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'relais@claude-relais': [{ version: '1.3.0' }] } }));
  verif('skills: no second copy of a marketplace-installed plugin', (await post('/api/skills/installer', { nom: 'relais' })).status === 400);
  // ---- Node.js check through the real server: its PATH only holds BIN, where the fake node.cmd goes
  {
    const noeud = async (forcer = true) => (await get(`/api/node${forcer ? '?forcer=1' : ''}`)).json();
    const ecrireNoeud = (v) => fs.writeFileSync(path.join(BIN, 'node.cmd'), `@echo ${v}\r\n`);
    const n0 = await noeud();
    verif('node (api): no node on the PATH = absent, minimum 18', n0.etat === 'absent' && n0.version === '' && n0.minimum === 18, JSON.stringify(n0));
    ecrireNoeud('v16.20.2');
    const n16 = await noeud();
    verif('node (api): node 16.20.2 on the PATH = too old, version reported', n16.etat === 'ancien' && n16.version === '16.20.2', JSON.stringify(n16));
    ecrireNoeud('v20.11.0');
    const n20cache = await noeud(false);
    verif('node (api): the answer is cached (no new probe without forcer)', n20cache.etat === 'ancien', JSON.stringify(n20cache));
    const n20 = await noeud();
    verif('node (api): node 20.11.0 = ok (forcer=1 probes again)', n20.etat === 'ok' && n20.version === '20.11.0', JSON.stringify(n20));
    verif('node (api): foreign Host or other site refused', (await brut('/api/node', { Host: 'evil.example' })) === 403 && (await brut('/api/node', { 'Sec-Fetch-Site': 'cross-site' })) === 403);
    fs.rmSync(path.join(BIN, 'node.cmd'));
  }
  // ---- plugin installed twice (app copy + marketplace), from installed_plugins.json
  {
    const copie = path.join(CLAUDE, 'skills', 'relais', '.claude-plugin');
    fs.mkdirSync(copie, { recursive: true });
    fs.writeFileSync(path.join(copie, 'plugin.json'), JSON.stringify({ name: 'relais', version: '1.0.0' }));
    const sk = await (await get('/api/skills')).json();
    const rel = sk.find((x) => x.nom === 'relais');
    verif('skills (api): app copy + marketplace = doublons with the uninstall command', rel.doublons.length === 1 && rel.doublons[0].id === 'relais@claude-relais'
      && rel.doublons[0].commande === 'claude plugin uninstall relais@claude-relais', JSON.stringify(rel.doublons));
    verif('skills (api): a plugin installed one way only has no doublon (avocat = app copy, images = nothing)', sk.find((x) => x.nom === 'avocat').doublons.length === 0 && sk.find((x) => x.nom === 'images').doublons.length === 0);
    fs.rmSync(path.join(CLAUDE, 'skills', 'relais'), { recursive: true, force: true });
    verif('skills (api): marketplace only (no app copy) = no doublon', (await (await get('/api/skills')).json()).find((x) => x.nom === 'relais').doublons.length === 0);
  }
  const e = await (await get('/api/etat')).json();
  verif('server: state reports the advocate as installed and on', e.avocat.actif === true && e.avocat.installe === true);
  // ---- memory tab through the real server (same registry file as the module tests above)
  {
    const vide = await (await get('/api/memoire')).json();
    verif('memoire (api): GET = { entrees, projets, fichiers }, known project folders offered, loaded files listed', Array.isArray(vide.entrees) && vide.entrees.length === 0
      && vide.projets.some((p) => /mon-projet$/.test(p)) && vide.fichiers.length === 3, JSON.stringify(vide.projets));
    const a1 = await post('/api/memoire/ajouter', { portee: PROJET_M, sujet: 'Build', type: 'piege', texte: 'Lancer npm run build avant le test', probleme: 'Le test lit dist/', solution: 'Enchaîner les deux', corrigeable: true });
    const ja = await a1.json();
    verif('memoire (api): add = 200, origin "utilisateur", written to the registry file', a1.status === 200 && ja.ok && ja.entree.origine === 'utilisateur' && ja.entree.sujet === 'build'
      && JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).entrees.length === 1);
    const lu = await (await get('/api/memoire')).json();
    verif('memoire (api): the new entry and its project are listed', lu.entrees.length === 1 && lu.entrees[0].id === ja.entree.id && lu.projets.includes(PROJET_M));
    const off = await post('/api/memoire/modifier', { id: ja.entree.id, actif: false });
    verif('memoire (api): switch off = modifier { id, actif: false }, saved', off.status === 200 && (await off.json()).entree.actif === false && JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).entrees[0].actif === false);
    const modif = await post('/api/memoire/modifier', { id: ja.entree.id, texte: 'Toujours builder avant de tester', type: 'regle', portee: 'global', sujet: 'ci', actif: true, corrigeable: false, probleme: '' });
    const jm = await modif.json();
    verif('memoire (api): edit text, type, scope (global), topic, problem cleared, back on', modif.status === 200 && jm.entree.texte === 'Toujours builder avant de tester' && jm.entree.portee === 'global'
      && jm.entree.type === 'regle' && jm.entree.sujet === 'ci' && jm.entree.actif === true && jm.entree.corrigeable === false && !('probleme' in jm.entree) && jm.entree.solution === 'Enchaîner les deux');
    const secret = await post('/api/memoire/ajouter', { portee: 'global', texte: 'password = hunter2hunter2' });
    verif('memoire (api): a secret is refused (400, readable message), nothing written', secret.status === 400 && /secret/i.test((await secret.json()).message) && (await (await get('/api/memoire')).json()).entrees.length === 1);
    const mauvais = await Promise.all([post('/api/memoire/ajouter', { portee: 'global', texte: '' }), post('/api/memoire/ajouter', { texte: 'sans portée' }), post('/api/memoire/modifier', { id: 'inconnu', actif: false }),
      post('/api/memoire/supprimer', { id: 'inconnu' }), post('/api/memoire/supprimer', {})]);
    verif('memoire (api): empty text, no scope, unknown id = 400', mauvais.every((x) => x.status === 400), mauvais.map((x) => x.status).join());
    verif('memoire (api): POST without X-Relais or from another site refused (403), nothing changed',
      (await post('/api/memoire/supprimer', { id: ja.entree.id }, { 'Content-Type': 'application/json' })).status === 403
      && (await post('/api/memoire/supprimer', { id: ja.entree.id }, { 'Content-Type': 'application/json', 'X-Relais': '1', Origin: 'https://evil.example' })).status === 403
      && (await (await get('/api/memoire')).json()).entrees.length === 1);
    const doublon = await (await post('/api/memoire/ajouter', { portee: 'global', texte: 'toujours BUILDER avant de tester!' })).json();
    verif('memoire (api): adding the same rule again refreshes it (doublon: true)', doublon.ok && doublon.doublon === true && doublon.entree.id === ja.entree.id);
    const del = await post('/api/memoire/supprimer', { id: ja.entree.id });
    verif('memoire (api): delete = 200, entry gone from the file', del.status === 200 && (await del.json()).ok === true && JSON.parse(fs.readFileSync(M.fichierRegistre(), 'utf8')).entrees.length === 0);
    const fichiersApi = (await (await get('/api/memoire')).json()).fichiers;
    verif('memoire (api): loaded files carry path, type, reason, time, preview', fichiersApi.every((f) => f.chemin && 'type' in f && 'raison' in f && f.le > 0 && 'apercu' in f) && fichiersApi.some((f) => f.apercu.includes('<script>')));
  }
  // ---- rules chat of the Memory tab (chat-regles.mjs) against the fake claude
  {
    const chatAppels = () => { try { return fs.readFileSync(CHAT_APPELS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    const lignes = async (rep) => (await rep.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const bloc = (o) => `\`\`\`relais-action\n${JSON.stringify(o)}\n\`\`\``;
    const id = (await (await post('/api/memoire/ajouter', { portee: 'global', sujet: 'git', texte: 'Toujours relire le diff avant de committer' })).json()).entree.id;
    let r = await post('/api/memoire/chat', { message: `RENVOIE Je propose ceci.\n${bloc({ action: 'desactiver', id, pourquoi: 'essai' })}\n${bloc({ action: 'supprimer', id: 'inconnu' })}\nfin`, dossiers: ['D:\\un-projet'] });
    const evs = await lignes(r);
    const fin = evs.at(-1);
    const c1 = chatAppels().at(-1) || { args: [], stdin: '' };
    verif('chat: answer streamed as JSON lines (session first, pieces of text, then the end)', r.status === 200 && /ndjson/.test(r.headers.get('content-type')) && evs[0].type === 'session'
      && evs.filter((e) => e.type === 'texte').length === 2 && fin.type === 'fin' && fin.session === SESSION_FAUX, JSON.stringify(evs).slice(0, 300));
    verif('chat: claude -p with no tool, safe mode, no skill, no MCP, its own system prompt, in its own folder', c1.args[0] === '-p' && c1.args.at(-2) === '--tools' && c1.args.at(-1) === ''
      && ['--safe-mode', '--disable-slash-commands', '--strict-mcp-config'].every((o) => c1.args.includes(o)) && c1.args[c1.args.indexOf('--system-prompt') + 1]?.includes('relais-action')
      && !c1.args.includes('--resume') && path.resolve(c1.cwd).toLowerCase() === path.join(CLAUDE, 'relais', 'regles-chat').toLowerCase(), JSON.stringify(c1.args.map((x) => x.slice(0, 30))));
    verif('chat: first message = registry + known folders + the message, on stdin (never in the arguments)', c1.stdin.includes('<registre>') && c1.stdin.includes(id)
      && c1.stdin.includes('D:\\un-projet') && c1.stdin.endsWith('fin') && !c1.args.some((x) => x.includes('RENVOIE')));
    verif('chat: proposals turned into cards (known id kept, unknown id dropped), blocks replaced by a marker where they were', fin.actions?.length === 1 && fin.actions[0].action === 'desactiver'
      && fin.actions[0].id === id && fin.ignorees === 1 && !fin.texte.includes('relais-action') && fin.texte.startsWith('Je propose ceci.') && fin.texte.includes('\u00010\u0001'), JSON.stringify(fin));
    verif('chat: nothing applied without a click (registry unchanged)', M.lireRegistre().entrees.find((e) => e.id === id)?.actif === true);
    await lignes(await post('/api/memoire/chat', { message: 'RENVOIE ok', session: fin.session }));
    const c2 = chatAppels().at(-1);
    verif('chat: next message resumes the session, registry not sent again while unchanged', c2.args[c2.args.indexOf('--resume') + 1] === SESSION_FAUX && !c2.stdin.includes('<registre>') && !c2.stdin.includes('un-projet'), c2.stdin);
    await post('/api/memoire/modifier', { id, actif: false }); // the click on "Apply"
    await lignes(await post('/api/memoire/chat', { message: 'RENVOIE ok', session: fin.session }));
    const c3 = chatAppels().at(-1);
    verif('chat: registry sent again once it changed (Claude sees the applied change)', c3.stdin.includes('<registre>') && c3.stdin.includes('"actif":false'));
    const avant = chatAppels().length;
    const refus = await Promise.all([post('/api/memoire/chat', { message: '  ' }), post('/api/memoire/chat', { message: 'x'.repeat(4001) }),
      post('/api/memoire/chat', { message: 'ok', session: '../x' }), post('/api/memoire/chat', { message: 'ok' }, { 'Content-Type': 'application/json' })]);
    verif('chat: empty or too long message, bad session, no X-Relais refused without running claude', refus.map((x) => x.status).join() === '400,400,400,403' && chatAppels().length === avant, refus.map((x) => x.status).join());
    const panne = await lignes(await post('/api/memoire/chat', { message: 'ERREUR' }));
    verif('chat: claude failing = an error line with its message', panne.at(-1).type === 'erreur' && panne.at(-1).message.includes('panne'), JSON.stringify(panne));
    const ctl = new AbortController();
    const lent = await fetch(base + '/api/memoire/chat', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Relais': '1' }, body: JSON.stringify({ message: 'LENT' }) });
    await lent.body.getReader().read(); // the session line: claude is running
    verif('chat: one message at a time (409 while Claude answers)', (await post('/api/memoire/chat', { message: 'RENVOIE ok' })).status === 409);
    ctl.abort();
    let libre = false;
    for (let i = 0; i < 50 && !libre; i++) { await new Promise((s) => setTimeout(s, 100)); libre = (await post('/api/memoire/chat', { message: 'RENVOIE ok' })).status === 200; }
    verif('chat: Stop (request closed) stops claude, the chat is free again', libre);
    const C = await import('./chat-regles.mjs');
    const x = C.extraireActions([bloc({ action: 'ajouter', entree: { texte: 'sans portée' } }), bloc({ action: 'modifier', id: 'a1', champs: { type: 'autre', id: 'pirate', actif: false, cree: 'x' } }),
      bloc({ action: 'modifier', id: 'a1', champs: { texte: 'Nouveau', type: 'piege', corrigeable: 'oui', inconnu: 1 } }), '```relais-action\npas du json\n```',
      ...Array.from({ length: 12 }, () => bloc({ action: 'activer', id: 'a1' }))].join('\n'), new Set(['a1']));
    verif('chat: only known actions and fields kept (no id, actif, dates), bad type dropped, 10 proposals at most', x.actions.length === 10
      && JSON.stringify(x.actions[0]) === JSON.stringify({ action: 'modifier', id: 'a1', champs: { texte: 'Nouveau', type: 'piege' }, pourquoi: '' }) && x.ignorees === 6 && (x.texte.match(/\u0001\d+\u0001/g) || []).length === 10 && x.texte.replace(/\u0001\d+\u0001/g, '').trim() === '', JSON.stringify(x).slice(0, 300));
  }
  verif('server: command line has no desktop routes (/api/bureau/* = 404)', (await get('/api/bureau/etat')).status === 404 && (await post('/api/bureau/demarrage', { actif: true })).status === 404);
} finally {
  srv.kill();
}

// ---- language: French or English only, from the system language (langue.mjs)
// String literals of a JS source (template literals: their fixed parts); comments and regexes skipped.
function litteraux(src) {
  const res = []; const pile = []; // pile: open braces inside each `${`
  let i = 0; let precedent = ''; // last significant character: tells a regex from a division
  const chaine = (q) => { let s = ''; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++]; } i++; res.push(s); };
  const modele = () => { // from after ` or the } closing a ${...}, up to ` (end) or ${ (expression)
    let s = '';
    while (i < src.length) {
      if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
      if (src[i] === '`') { i++; res.push(s); return 'a'; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; res.push(s); pile.push(0); return '{'; }
      s += src[i++];
    }
    return 'a';
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '\'' || c === '"') { chaine(c); precedent = 'a'; continue; }
    if (c === '`') { i++; precedent = modele(); continue; }
    if (c === '/' && (!precedent || /[(,=:[!&|?{};+\-*%<>~^]/.test(precedent))) {
      let classe = false; i++;
      while (i < src.length && (src[i] !== '/' || classe)) { if (src[i] === '\\') i++; else if (src[i] === '[') classe = true; else if (src[i] === ']') classe = false; i++; }
      i++; while (/[a-z]/i.test(src[i] || '')) i++;
      precedent = 'a'; continue;
    }
    if (pile.length && c === '{') pile[pile.length - 1]++;
    if (pile.length && c === '}') {
      if (pile.at(-1) === 0) { pile.pop(); i++; precedent = modele(); continue; }
      pile[pile.length - 1]--;
    }
    if (!/\s/.test(c)) precedent = c;
    i++;
  }
  return res;
}
// Visible text of an HTML page: text nodes and the title / placeholder / aria-label / alt attributes.
function texteHtml(html) {
  const sans = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const attributs = [...sans.matchAll(/\s(?:title|placeholder|aria-label|alt)="([^"]*)"/gi)].map((m) => m[1]);
  return [...sans.replace(/<[^>]*>/g, '\n').split('\n'), ...attributs].map((s) => s.trim()).filter(Boolean);
}
{
  const { langueSysteme, langueDe } = await import('./langue.mjs');
  const env = { TABLEAU_LANGUE: process.env.TABLEAU_LANGUE, RELAIS_LANGUE: process.env.RELAIS_LANGUE };
  const avec = (tableau, relais) => {
    for (const [k, v] of [['TABLEAU_LANGUE', tableau], ['RELAIS_LANGUE', relais]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    return langueSysteme();
  };
  verif('langue: TABLEAU_LANGUE wins (tests)', avec('en', 'fr-FR') === 'en' && avec('fr', 'en-US') === 'fr');
  verif('langue: RELAIS_LANGUE (desktop app) maps fr-FR to fr, de-DE / en-GB to en', avec(undefined, 'fr-FR') === 'fr' && avec(undefined, 'de-DE') === 'en' && avec(undefined, 'en-GB') === 'en' && avec('', 'fr-CA') === 'fr');
  verif('langue: empty or unknown value = English, fr_FR.UTF-8 = French', langueDe('') === 'en' && langueDe(undefined) === 'en' && langueDe('es') === 'en' && langueDe('fr_FR.UTF-8') === 'fr');
  verif('langue: no variable = the locale Node reports', avec(undefined, undefined) === langueDe(Intl.DateTimeFormat().resolvedOptions().locale));
  avec(env.TABLEAU_LANGUE, env.RELAIS_LANGUE);

  // The same server, started in English.
  const { enfant, adresse } = lancerServeur('en');
  try {
    const b = await adresse;
    const g = (p) => fetch(b + p);
    const p = (chemin, corps) => fetch(b + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relais': '1' }, body: JSON.stringify(corps) });
    verif('langue (en): /api/langue = en', (await (await g('/api/langue')).json()).langue === 'en');
    fs.rmSync(ETAT_CONNEXION);
    const hors = await (await p('/api/compte/verifier', {})).json();
    const verrou = await (await g('/api/conversations')).json();
    fs.writeFileSync(ETAT_CONNEXION, '1');
    verif('langue (en): signed-out reason and lock message in English', hors.raison === 'Claude Code is not signed in to any account.' && verrou.erreur === 'Sign in to Claude Code first.', `${hors.raison} | ${verrou.erreur}`);
    verif('langue (en): signed in again', (await (await p('/api/compte/verifier', {})).json()).connecte === true);
    const refus = await p('/api/gestion/activer', { id: 'x" & calc', actif: true, portee: 'user' });
    verif('langue (en): refused switch explained in English', refus.status === 400 && (await refus.json()).message === 'Unknown plugin.');
    verif('langue (en): unknown route in English', (await (await g('/api/rien')).json()).erreur === 'Not found.');
    const { SKILLS_EXTERNES, CATEGORIES } = await import('./skills-externes.mjs');
    const ext = await (await g('/api/skills/externes')).json();
    verif('langue (en): external cards in English', ext.langue === 'en' && ext.skills[0].resume === SKILLS_EXTERNES[0].resume.en && ext.categories[0].nom === CATEGORIES[0].nom.en);
    const r = await p('/api/externes/installer', { id: 'vercel' });
    verif('langue (en): "next step" of an npm card in English', r.status === 200 && (await r.json()).message.includes('type "vercel login"'));
  } finally {
    enfant.kill();
  }

  // Dictionary of the page: same keys in French and English, nothing empty, same {placeholders}.
  const { TEXTES } = await import('./public/i18n.js');
  const cles = (o) => Object.keys(o).sort();
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(); // displayed values ({n|one|many} only picks a form)
  const ecarts = [...cles(TEXTES.fr).filter((k) => !(k in TEXTES.en)).map((k) => `en manque ${k}`), ...cles(TEXTES.en).filter((k) => !(k in TEXTES.fr)).map((k) => `fr manque ${k}`)];
  verif('i18n: fr and en have exactly the same keys', ecarts.length === 0 && cles(TEXTES.fr).length > 100, ecarts.join(', ') || `${cles(TEXTES.fr).length} keys`);
  const vides = Object.entries(TEXTES).flatMap(([l, d]) => Object.entries(d).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => `${l}.${k}`));
  verif('i18n: no empty text', vides.length === 0, vides.join(', '));
  const trous = cles(TEXTES.fr).filter((k) => k in TEXTES.en && vars(TEXTES.fr[k]) !== vars(TEXTES.en[k]));
  verif('i18n: same displayed placeholders in both languages', trous.length === 0, trous.join(', '));

  // Every key used by the page exists; no dash punctuation in the texts.
  const appJs = fs.readFileSync(path.join(ici, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ici, 'public', 'index.html'), 'utf8');
  const utilisees = [...appJs.matchAll(/\bt\('([^']+)'/g), ...html.matchAll(/data-t(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
  const inconnues = [...new Set(utilisees.filter((k) => !(k in TEXTES.fr)))];
  verif('i18n: every key used by app.js / index.html exists', utilisees.length > 150 && inconnues.length === 0, inconnues.join(', ') || `${utilisees.length} uses`);
  const tirets = Object.entries(TEXTES).flatMap(([l, d]) => Object.entries(d).filter(([, v]) => /[\u2013\u2014]/.test(v)).map(([k]) => `${l}.${k}`));
  verif('i18n: no em / en dash in the texts', tirets.length === 0, tirets.join(', '));

  // Guard: no French UI text left hard-coded in app.js / index.html (it belongs in public/i18n.js).
  const FRANCAIS = /[àâçéèêëîïôûùüÿœæ«»]/i;
  const MOTS = /(^|[^\w-])(le|la|les|des|du|une|pour|avec|dans|sur|tes|ton|ta|est|sont|aucun|aucune|pas|chaque|tous|toutes|jetons|depuis|installer|copier|fermer|supprimer|modifier|lancer|vérifier)(?![\w-])/i;
  const BOUTONS = /^(Copier|Fermer|Ouvrir|Installer|Supprimer|Modifier|Actualiser|Enregistrer|Projet|Outils|Appels|Contexte|Quand|Heure|Tri|Agents|Messages|Conseils)$/; // lone capitalised labels
  const suspect = (s) => FRANCAIS.test(s) || (/\s/.test(s.trim()) && MOTS.test(s)) || BOUTONS.test(s.trim());
  const NEUTRES = ['Relais', 'Tableau relais', 'claude auth login']; // brand, <title> before the script runs, a command
  const restes = [...litteraux(appJs).filter(suspect).map((s) => `app.js: ${s.slice(0, 60)}`),
    ...texteHtml(html).filter((s) => !NEUTRES.includes(s)).map((s) => `index.html: ${s.slice(0, 60)}`)];
  verif('i18n: no hard-coded French UI string in app.js / index.html', restes.length === 0, restes.join(' | '));

  // The desktop app only embeds the files listed in bureau/package.json: everything the server loads must be there.
  const liste = JSON.parse(fs.readFileSync(path.join(ici, 'bureau', 'package.json'), 'utf8')).build.files[0].filter;
  const vus = new Set();
  const parcourir = (f) => {
    if (vus.has(f)) return;
    vus.add(f);
    for (const m of fs.readFileSync(path.join(ici, f), 'utf8').matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) parcourir(m[1]);
  };
  parcourir('serveur.mjs');
  const servis = ['public/index.html', 'public/app.js', 'public/i18n.js', 'public/style.css', 'public/demo-remotion.mp4'];
  const absents = [...vus, ...servis].filter((f) => !liste.includes(f));
  verif('bureau: every module and page file is embedded in the app (build.files)', absents.length === 0 && vus.has('langue.mjs'), absents.join(', '));
}

// ---- data repo given from outside (desktop app): validated, read as DATA only, never imported
{
  const { validerDepot } = await import('./catalogue.mjs');
  const { demarrerServeur } = await import('./serveur.mjs');
  const vrai = path.resolve(ici, '..');
  const refuse = (p) => validerDepot(p).ok === false;
  verif('depot: network / relative / \\\\?\\ paths refused', ['\\\\srv\\share', '//srv/share', '\\\\?\\D:\\x', 'claude-relais', '.\\x', ''].every(refuse));
  verif('depot: folder without marketplace.json refused', refuse(TMP));
  verif('depot: the real repo accepted', validerDepot(vrai).ok === true);

  // A fake repo whose CODE would leave a witness file if it ever ran.
  const DONNEES = path.join(TMP, 'depot-piege');
  const TEMOIN = path.join(TMP, 'temoin.txt');
  const piege = `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(TEMOIN)}, 'exécuté'); export function demarrerServeur() {} export function catalogue() { return []; }\n`;
  for (const f of ['tableau/serveur.mjs', 'tableau/catalogue.mjs', 'plugins/demo/scripts/hook.mjs']) {
    fs.mkdirSync(path.dirname(path.join(DONNEES, f)), { recursive: true });
    fs.writeFileSync(path.join(DONNEES, f), piege);
  }
  fs.mkdirSync(path.join(DONNEES, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(DONNEES, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'faux', plugins: [{ name: 'demo', source: './plugins/demo' }] }));
  fs.mkdirSync(path.join(DONNEES, 'plugins', 'demo', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(DONNEES, 'plugins', 'demo', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

  process.env.TABLEAU_CLAUDE = FAUX; // signed in (ETAT_CONNEXION exists)
  const s1 = await demarrerServeur({ port: 0, journal: () => {}, depot: DONNEES });
  const sk1 = await (await fetch(s1.url + 'api/skills')).json();
  await s1.fermer();
  verif('depot: Skills read from the given repo (data)', s1.depot?.ok === true && JSON.stringify(sk1.map((x) => x.nom)) === '["demo"]', JSON.stringify(sk1.map?.((x) => x.nom)));
  verif('depot: code planted in the given repo never runs', !fs.existsSync(TEMOIN));
  const s2 = await demarrerServeur({ port: 0, journal: () => {}, depot: '\\\\srv\\share' });
  const sk2 = await (await fetch(s2.url + 'api/skills')).json();
  await s2.fermer();
  verif('depot: refused path = empty Skills tab + reason', s2.depot?.ok === false && /réseau/.test(s2.depot.raison) && Array.isArray(sk2) && sk2.length === 0, s2.depot?.raison);

  // Candidates in order (desktop app: RELAIS_DEPOT, recorded repo, embedded copy): first valid wins.
  const s3 = await demarrerServeur({ port: 0, journal: () => {}, depot: ['\\\\srv\\share', 'relatif', DONNEES] });
  const sk3 = await (await fetch(s3.url + 'api/skills')).json();
  verif('depot: first valid candidate used, refusals reported', s3.depot?.ok === true && s3.depot.refus.length === 2 && sk3.length === 1 && sk3[0].nom === 'demo', JSON.stringify(s3.depot));
  verif('depot: still no planted code run', !fs.existsSync(TEMOIN));
  await s3.fermer();

  // Desktop routes: only with the functions of the Electron app, behind the same Host / CSRF checks.
  const appels = [];
  const bureau = {
    etat: () => ({ version: '9.9.9', demarrage: false }),
    demarrage: (actif) => { appels.push(['demarrage', actif]); return { demarrage: actif }; },
    verifierMaj: () => { appels.push(['verifier']); return { statut: 'aucune' }; },
    telechargerMaj: () => { appels.push(['telecharger']); return { statut: 'telechargement' }; },
    installerMaj: () => { appels.push(['installer']); return { ok: false }; },
  };
  const s4 = await demarrerServeur({ port: 0, journal: () => {}, bureau });
  const b4 = s4.url.replace(/\/$/, '');
  const p4 = (p, corps, h = { 'Content-Type': 'application/json', 'X-Relais': '1' }) => fetch(b4 + p, { method: 'POST', headers: h, body: JSON.stringify(corps) });
  verif('bureau: state route', (await (await fetch(b4 + '/api/bureau/etat')).json()).version === '9.9.9');
  verif('bureau: POST without X-Relais refused', (await p4('/api/bureau/demarrage', { actif: true }, { 'Content-Type': 'application/json' })).status === 403);
  verif('bureau: POST from another site refused', (await p4('/api/bureau/maj/installer', {}, { 'Content-Type': 'application/json', 'X-Relais': '1', Origin: 'https://evil.example' })).status === 403);
  const hote4 = await new Promise((res) => http.request({ host: '127.0.0.1', port: s4.port, method: 'POST', path: '/api/bureau/demarrage', headers: { Host: 'evil.example', 'Content-Type': 'application/json', 'X-Relais': '1' } }, (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0)).end('{"actif":true}'));
  verif('bureau: foreign Host refused', hote4 === 403, String(hote4));
  verif('bureau: bad value refused', (await p4('/api/bureau/demarrage', { actif: 'oui' })).status === 400);
  verif('bureau: nothing called by refused requests', appels.length === 0, JSON.stringify(appels));
  const ok4 = (await p4('/api/bureau/demarrage', { actif: true })).status === 200 && (await p4('/api/bureau/maj/verifier', {})).status === 200;
  verif('bureau: accepted requests reach the app', ok4 && JSON.stringify(appels) === '[["demarrage",true],["verifier"]]', JSON.stringify(appels));
  verif('bureau: unknown desktop route = 404', (await p4('/api/bureau/rien', {})).status === 404);
  await s4.fermer();
}

// ---- anonymous statistics (statistiques.mjs): opt-in, contract in docs/statistiques.md
{
  const S = await import('./statistiques.mjs');
  const { demarrerServeur } = await import('./serveur.mjs');
  const DOSSIER_STATS = path.join(TMP, 'stats');
  fs.mkdirSync(DOSSIER_STATS);
  let n = 0;
  const nouveauFichier = () => path.join(DOSSIER_STATS, `stats-${++n}.json`);
  // Fake clock (local time) and fake stats server (RELAIS_STATS_URL).
  const jourPlus = (k, h = 12, m = 0, s = 0) => new Date(2026, 9, 8 + k, h, m, s).getTime();
  let horloge = jourPlus(0);
  const recus = [];
  let reponseFaux = 204; // status of the fake server, or 'coupe' = connection cut
  const faux = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      recus.push({ method: req.method, url: req.url, type: req.headers['content-type'], cookie: req.headers.cookie, corps });
      if (reponseFaux === 'coupe') return req.socket.destroy();
      res.writeHead(reponseFaux); res.end();
    });
  });
  await new Promise((fini) => faux.listen(0, '127.0.0.1', fini));
  const BASE_FAUX = `http://127.0.0.1:${faux.address().port}/api/relais/stats`;
  const avantUrl = process.env.RELAIS_STATS_URL;
  process.env.RELAIS_STATS_URL = BASE_FAUX;
  const sondes = {
    claude: () => '2.1.291', node: () => '22.11.0', relais7j: () => 4, avocat: () => true,
    plugins: () => [{ nom: 'relais', etat: 'a-jour', versionInstallee: '2.3.0' }, { nom: 'avocat', etat: 'marketplace', versionInstallee: '1.0.0' }, { nom: 'images', etat: 'absent', versionInstallee: '' }],
  };
  const creer = (fichier, extra = {}) => S.creerStatistiques({ fichier, version: '1.0.7', maintenant: () => horloge, sondes, ...extra });
  const lireFichier = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // Consent: nothing counted, written or sent until the answer.
  const f1 = nouveauFichier();
  const s1 = creer(f1);
  verif('stats: no answer yet = reponse null', s1.etat().reponse === null && s1.etat().disponible === true);
  s1.demarrer(); s1.focus(true); horloge += 120e3; s1.focus(false);
  verif('stats: before the answer a tab is not counted', s1.onglet('vue') === false);
  const avant = await s1.apercu();
  verif('stats: before the answer nothing to send (no day) and no file written', avant.jours.length === 0 && !fs.existsSync(f1));
  verif('stats: before the answer nothing is sent', (await s1.envoyer()).envoye === false && recus.length === 0);
  s1.fermer();

  // Yes: random UUID v4 + choice stored, this launch counted.
  s1.repondre(true);
  const stocke = lireFichier(f1);
  verif('stats: "yes" is stored with a random UUID v4', stocke.reponse === true && UUID4.test(stocke.id), stocke.id);
  verif('stats: this launch is counted for today', stocke.jours['2026-10-08']?.ouvertures === 1, JSON.stringify(stocke.jours));
  s1.repondre(true);
  verif('stats: answering "yes" twice does not count the launch twice', lireFichier(f1).jours['2026-10-08'].ouvertures === 1);

  // Tabs: only the 7 keys.
  const ok7 = ['vue', 'conversations', 'skills', 'gestion', 'memoire', 'avocat', 'parametres'].map((k) => s1.onglet(k));
  s1.onglet('vue');
  const refuses = ['secret', 'Vue', '', '__proto__', 'constructor', 'vue ', 'toString', null, 5, {}].map((k) => s1.onglet(k));
  verif('stats: the 7 tab keys are counted, anything else refused', ok7.every(Boolean) && refuses.every((x) => x === false), JSON.stringify([ok7, refuses]));
  const tabs = lireFichier(f1).jours['2026-10-08'].onglets;
  verif('stats: tab counters per day', tabs.vue === 2 && tabs.parametres === 1 && Object.keys(tabs).length === 7, JSON.stringify(tabs));

  // Foreground time: a gap longer than 3 minutes (PC asleep) counts one minute only.
  s1.focus(true); horloge += 120e3; s1.focus(false);
  s1.focus(true); horloge += 600e3; s1.focus(false);
  const charge = await s1.apercu();
  verif('stats: minutes in the foreground (2 min, then a 10 min gap counted as 1)', charge.jours[0].minutes === 3, String(charge.jours[0].minutes));

  // Payload = the contract, exactly.
  verif('stats: payload keys', JSON.stringify(Object.keys(charge)) === '["v","id","app","os","claude","node","langue","plugins","jours"]', Object.keys(charge).join());
  verif('stats: payload values', charge.v === 1 && charge.id === stocke.id && charge.app === '1.0.7' && charge.claude === '2.1.291' && charge.node === '22.11.0' && charge.langue === 'fr'
    && /^[0-9A-Za-z. ()_+-]{1,40}$/.test(charge.os), JSON.stringify(charge));
  verif('stats: plugins (installed, version, relais7j, avocat actif)', JSON.stringify(charge.plugins) === JSON.stringify({
    relais: { installe: true, version: '2.3.0', relais7j: 4 }, avocat: { installe: true, version: '1.0.0', actif: true }, images: { installe: false, version: '' } }), JSON.stringify(charge.plugins));
  verif('stats: day entry', charge.jours.length === 1 && charge.jours[0].date === '2026-10-08' && charge.jours[0].ouvertures === 1
    && JSON.stringify(Object.keys(charge.jours[0])) === '["date","ouvertures","minutes","onglets"]');
  verif('stats: payload passes the contract validation', S.verifierCharge(charge, horloge) === '', S.verifierCharge(charge, horloge));
  const copie = () => JSON.parse(JSON.stringify(charge));
  const invalide = (modif) => { const c = copie(); modif(c); return S.verifierCharge(c, horloge) !== ''; };
  verif('stats: validation rejects what the server would (key, type, limits)', [
    (c) => { c.email = 'x'; }, (c) => { c.v = 2; }, (c) => { c.id = c.id.toUpperCase(); }, (c) => { c.id = '1234'; }, (c) => { c.langue = 'de'; }, (c) => { c.app = 'a b'; },
    (c) => { c.os = 'C:\\x'; }, (c) => { c.node = 'x'.repeat(41); }, (c) => { c.plugins.autre = { installe: true, version: '' }; }, (c) => { c.plugins.relais.relais7j = 10001; },
    (c) => { delete c.plugins.avocat.actif; }, (c) => { c.plugins.images.actif = true; }, (c) => { c.jours[0].minutes = 1441; }, (c) => { c.jours[0].minutes = 1.5; },
    (c) => { c.jours[0].ouvertures = 1001; }, (c) => { c.jours[0].onglets.secret = 1; }, (c) => { c.jours[0].onglets.vue = 10001; }, (c) => { c.jours[0].date = '2026-13-01'; },
    (c) => { c.jours[0].date = '2026-08-01'; }, (c) => { c.jours[0].date = '2026-10-20'; }, (c) => { c.jours[0].chemin = 'D:\\x'; },
    (c) => { c.jours = [c.jours[0], c.jours[0]]; }, (c) => { c.jours = Array.from({ length: 32 }, (_, i) => ({ ...c.jours[0], date: `2026-09-${String(i % 28 + 1).padStart(2, '0')}` })); },
  ].every(invalide));

  // Send: success marks past days, today stays resendable.
  recus.length = 0;
  const r1 = await s1.envoyer();
  verif('stats: send OK', r1.envoye === true && recus.length === 1 && recus[0].method === 'POST' && recus[0].url === '/api/relais/stats'
    && recus[0].type === 'application/json' && !recus[0].cookie, JSON.stringify(recus.map((x) => [x.method, x.url])));
  const corpsEnvoye = JSON.parse(recus[0].corps);
  verif('stats: what is sent is valid, small, and equal to the preview', S.verifierCharge(corpsEnvoye, horloge) === '' && recus[0].corps.length < 16384 && JSON.stringify(corpsEnvoye) === JSON.stringify(charge));
  verif('stats: today is not marked sent (resendable)', lireFichier(f1).jours['2026-10-08'].envoye === false);
  horloge = jourPlus(1);
  s1.onglet('skills');
  recus.length = 0;
  await s1.envoyer();
  const c2 = JSON.parse(recus[0].corps);
  verif('stats: next day sends yesterday (was today when sent) and today', c2.jours.map((j) => j.date).join() === '2026-10-08,2026-10-09', c2.jours.map((j) => j.date).join());
  verif('stats: yesterday is now marked sent, today not', lireFichier(f1).jours['2026-10-08'].envoye === true && lireFichier(f1).jours['2026-10-09'].envoye === false);
  horloge = jourPlus(2);
  s1.onglet('vue');
  recus.length = 0;
  await s1.envoyer();
  verif('stats: a day already sent is not sent again', JSON.parse(recus[0].corps).jours.map((j) => j.date).join() === '2026-10-09,2026-10-10');

  // Failure: silent, days stay unsent, retried next time.
  reponseFaux = 500; recus.length = 0;
  horloge = jourPlus(3);
  s1.onglet('vue');
  const echec500 = await s1.envoyer();
  verif('stats: server error = silent, nothing marked sent', echec500.envoye === false && recus.length === 1 && lireFichier(f1).jours['2026-10-10'].envoye === false);
  reponseFaux = 'coupe';
  const echecCoupe = await s1.envoyer();
  verif('stats: cut connection = silent, no exception', echecCoupe.envoye === false);
  s1.fermer();
  const sans = S.creerStatistiques({ fichier: nouveauFichier(), version: '1', maintenant: () => horloge, sondes, url: () => 'http://127.0.0.1:1/x' });
  sans.repondre(true);
  verif('stats: server unreachable = silent', (await sans.envoyer()).envoye === false);
  sans.fermer();
  reponseFaux = 204; recus.length = 0;
  const r3 = await s1.envoyer();
  verif('stats: retry sends the days that failed', r3.envoye === true && JSON.parse(recus[0].corps).jours.map((j) => j.date).join() === '2026-10-10,2026-10-11', recus[0]?.corps);

  // Settings are kept between launches.
  const retour = creer(f1);
  verif('stats: answer and id survive a restart', retour.etat().reponse === true && lireFichier(f1).id === stocke.id);
  retour.fermer();

  // DELETE: /stats/:id, then a new id and empty counters; offline = message, nothing changes.
  recus.length = 0;
  const idAvant = lireFichier(f1).id;
  const suppr = await s1.supprimer();
  const idApres = lireFichier(f1).id;
  verif('stats: DELETE /stats/:id sent with the old id', suppr.ok === true && recus.length === 1 && recus[0].method === 'DELETE' && recus[0].url === `/api/relais/stats/${idAvant}`, JSON.stringify(recus.map((x) => [x.method, x.url])));
  verif('stats: after DELETE a new random id and no counters left', idApres !== idAvant && UUID4.test(idApres) && Object.keys(lireFichier(f1).jours).length === 0 && lireFichier(f1).reponse === true);
  reponseFaux = 500;
  const refuse = await s1.supprimer();
  verif('stats: DELETE refused by the server = "refuse", id kept', refuse.ok === false && refuse.raison === 'refuse' && lireFichier(f1).id === idApres);
  reponseFaux = 204;
  const horsLigne = creer(f1, { url: () => 'http://127.0.0.1:1/x' });
  const rh = await horsLigne.supprimer();
  verif('stats: DELETE offline = "hors-ligne", id kept to retry', rh.ok === false && rh.raison === 'hors-ligne' && lireFichier(f1).id === idApres);
  horsLigne.fermer();

  // Refusing (or switching off) erases the counters and stops everything.
  s1.onglet('vue');
  s1.repondre(false);
  const apresNon = lireFichier(f1);
  recus.length = 0;
  verif('stats: "no" clears the local counters', apresNon.reponse === false && Object.keys(apresNon.jours).length === 0);
  verif('stats: after "no" nothing is counted, nothing is sent', s1.onglet('vue') === false && (await s1.envoyer()).envoye === false && recus.length === 0 && (await s1.apercu()).jours.length === 0);
  s1.focus(true); horloge += 60e3; s1.focus(false);
  verif('stats: after "no" no foreground time is counted', Object.keys(lireFichier(f1).jours).length === 0);
  s1.fermer();

  // A corrupt file = not answered (asked again), never an exception.
  const fCorrompu = nouveauFichier();
  fs.writeFileSync(fCorrompu, '{pas du json');
  verif('stats: unreadable file = not answered', creer(fCorrompu).etat().reponse === null);

  // Off in test mode / smoke test: never asks nor counts.
  const fTest = nouveauFichier();
  const sTest = creer(fTest, { desactive: true });
  sTest.repondre(true); sTest.demarrer();
  verif('stats: disabled mode (tests) = unavailable, nothing stored or counted', sTest.etat().disponible === false && sTest.etat().reponse === null && sTest.onglet('vue') === false && !fs.existsSync(fTest));
  sTest.fermer();

  // Day change in the middle of a foreground segment, and 31 days at most.
  horloge = jourPlus(0, 23, 58, 30);
  const f2 = nouveauFichier();
  const s2 = creer(f2);
  s2.repondre(true);
  s2.focus(true);
  horloge = jourPlus(1, 0, 0, 30);
  s2.focus(false);
  const j2 = lireFichier(f2).jours;
  verif('stats: foreground time is split at midnight', Math.round(j2['2026-10-08'].sec) === 90 && Math.round(j2['2026-10-09'].sec) === 30, JSON.stringify(j2));
  verif('stats: repartirSecondes cuts at local midnights', JSON.stringify(S.repartirSecondes(jourPlus(0, 23, 59), jourPlus(1, 0, 1))) === '[["2026-10-08",60],["2026-10-09",60]]');
  for (let k = 2; k <= 45; k++) { horloge = jourPlus(k); s2.onglet('vue'); }
  const dates = Object.keys(lireFichier(f2).jours).sort();
  verif('stats: at most 31 days kept (today and the 30 before)', dates.length === 31 && dates[0] === '2026-10-23' && dates.at(-1) === '2026-11-22',`${dates.length} ${dates[0]} ${dates.at(-1)}`);
  const c31 = await s2.apercu();
  verif('stats: 31 days are valid in a payload', c31.jours.length === 31 && S.verifierCharge(c31, horloge) === '' && c31.jours[0].date === '2026-10-23', `${c31.jours.length} ${c31.jours[0]?.date}`);
  s2.fermer();

  // relais7j: real relays only (auto_*.md, dated .md, .repris.md), last 7 days.
  const DR = path.join(TMP, 'relais-7j');
  fs.mkdirSync(path.join(DR, '.etat'), { recursive: true });
  const maintenant7 = Date.now();
  for (const f of ['auto_aaaa-1111.md', 'auto_bbbb-2222.repris.md', '2026-10-08_10h00_sujet.md', '2026-10-08_11h30_autre-sujet.repris.md', 'a-ranger.md', 'a-ranger.importe-2026-10-07.md', 'notes.md', 'registre.json']) fs.writeFileSync(path.join(DR, f), 'x');
  fs.writeFileSync(path.join(DR, 'auto_vieux-3333.md'), 'x');
  const vieux = new Date(maintenant7 - 10 * 864e5);
  fs.utimesSync(path.join(DR, 'auto_vieux-3333.md'), vieux, vieux);
  verif('stats: relais7j counts real relays written in the last 7 days only', S.compterRelais(DR, maintenant7) === 4 && S.compterRelais(path.join(TMP, 'rien-du-tout'), maintenant7) === 0, String(S.compterRelais(DR, maintenant7)));

  // Desktop routes: tab key whitelist at the server too, same Host / CSRF checks.
  const appelsStats = [];
  const bureauStats = {
    etat: () => ({ version: '9.9.9', stats: { disponible: true, reponse: null } }),
    statsApercu: () => ({ v: 1 }), statsReponse: (a) => { appelsStats.push(['reponse', a]); return { stats: { reponse: a } }; },
    statsOnglet: (k) => { appelsStats.push(['onglet', k]); return S.ONGLETS.includes(k); }, statsSupprimer: () => { appelsStats.push(['supprimer']); return { ok: true, raison: 'ok' }; },
  };
  const s5 = await demarrerServeur({ port: 0, journal: () => {}, bureau: bureauStats });
  const b5 = s5.url.replace(/\/$/, '');
  const p5 = (p, corps, h = { 'Content-Type': 'application/json', 'X-Relais': '1' }) => fetch(b5 + p, { method: 'POST', headers: h, body: JSON.stringify(corps) });
  verif('stats route: preview', (await (await fetch(b5 + '/api/bureau/stats/apercu')).json()).v === 1);
  verif('stats route: POST without X-Relais refused', (await p5('/api/bureau/stats/onglet', { cle: 'vue' }, { 'Content-Type': 'application/json' })).status === 403 && appelsStats.length === 0);
  verif('stats route: bad answer refused', (await p5('/api/bureau/stats/reponse', { accepte: 'oui' })).status === 400 && appelsStats.length === 0);
  verif('stats route: answer reaches the app', (await p5('/api/bureau/stats/reponse', { accepte: true })).status === 200 && JSON.stringify(appelsStats) === '[["reponse",true]]');
  verif('stats route: unknown tab key = 400', (await p5('/api/bureau/stats/onglet', { cle: 'secret' })).status === 400 && (await p5('/api/bureau/stats/onglet', { cle: 12 })).status === 400);
  verif('stats route: real tab key = 200', (await p5('/api/bureau/stats/onglet', { cle: 'memoire' })).status === 200);
  verif('stats route: delete reaches the app', (await (await p5('/api/bureau/stats/supprimer', {})).json()).ok === true && appelsStats.at(-1)[0] === 'supprimer');
  verif('stats route: unknown stats route = 404', (await p5('/api/bureau/stats/rien', {})).status === 404);
  await s5.fermer();
  const s6 = await demarrerServeur({ port: 0, journal: () => {}, bureau: { etat: () => ({}) } });
  verif('stats route: without statistics in the app = 404', (await fetch(s6.url + 'api/bureau/stats/apercu')).status === 404);
  await s6.fermer();

  // Wiring: tab ids of the page, desktop-only, not embedded twice.
  const indexHtml = fs.readFileSync(path.join(ici, 'public', 'index.html'), 'utf8');
  const pages = [...indexHtml.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);
  verif('stats: tab keys of the contract = the pages of the sidebar', JSON.stringify([...pages].sort()) === JSON.stringify([...S.ONGLETS].sort()), pages.join());
  const mainJs = fs.readFileSync(path.join(ici, 'bureau', 'main.mjs'), 'utf8');
  const serveurJs = fs.readFileSync(path.join(ici, 'serveur.mjs'), 'utf8');
  verif('stats: only the desktop app creates the statistics (never the command-line server), off in test mode', /creerStatistiques\(\{[^}]*desactive: TEST/.test(mainJs) && !/from '\.\/statistiques\.mjs'/.test(serveurJs));
  verif('stats: statistiques.mjs is embedded in the app (build.files)', JSON.parse(fs.readFileSync(path.join(ici, 'bureau', 'package.json'), 'utf8')).build.files[0].filter.includes('statistiques.mjs'));
  verif('stats: the fixed URL is the contract one', S.URL_STATS === 'https://api.nybo.fr/api/relais/stats');
  // The publishing config only exists in the private repo: the public copy has nothing to check here.
  const configPublication = path.join(ici, '..', '.publier-public.json');
  if (fs.existsSync(configPublication)) verif('stats: docs/statistiques.md is in the published paths', JSON.parse(fs.readFileSync(configPublication, 'utf8')).paths.includes('docs/statistiques.md'));

  if (avantUrl === undefined) delete process.env.RELAIS_STATS_URL; else process.env.RELAIS_STATS_URL = avantUrl;
  await new Promise((fini) => { faux.close(fini); faux.closeAllConnections(); });
}

// ---- Node.js probe (gestion.mjs): injected probe, never the real node of this PC
{
  const G = await import('./gestion.mjs');
  const essai = async (sortie, options = {}) => { G.oublierNode(); return G.verifierNode({ forcer: true, sonde: async () => { if (sortie instanceof Error) throw sortie; return sortie; }, ...options }); };
  const a = await essai('');
  verif('node: nothing printed (not on the PATH) = absent', a.etat === 'absent' && a.version === '' && a.minimum === 18, JSON.stringify(a));
  verif('node: probe failing = absent, no crash', (await essai(new Error('ENOENT'))).etat === 'absent');
  verif('node: a message that is not a version = absent', (await essai('bash: node: command not found')).etat === 'absent');
  const v16 = await essai('v16.20.2\n');
  verif('node: 16.20.2 = too old, version kept', v16.etat === 'ancien' && v16.version === '16.20.2', JSON.stringify(v16));
  verif('node: 17.9.1 = too old', (await essai('v17.9.1')).etat === 'ancien');
  const v20 = await essai('v20.11.0\r\n');
  verif('node: 20.11.0 = ok', v20.etat === 'ok' && v20.version === '20.11.0', JSON.stringify(v20));
  verif('node: 18.0.0 (the minimum) and 24.1.0 = ok', (await essai('v18.0.0')).etat === 'ok' && (await essai('v24.1.0')).etat === 'ok');
  // cache: one probe for repeated calls, a new one after a few minutes or with forcer; concurrent calls share a probe
  let sondes = 0; let horloge = 1000;
  const sonde = async () => { sondes += 1; return 'v20.0.0'; };
  G.oublierNode();
  await G.verifierNode({ sonde, maintenant: () => horloge }); await G.verifierNode({ sonde, maintenant: () => horloge + 60e3 });
  verif('node: result cached for a few minutes (one probe for two calls a minute apart)', sondes === 1, String(sondes));
  await G.verifierNode({ sonde, maintenant: () => horloge + 4 * 60e3 });
  verif('node: probed again after the cache expired', sondes === 2, String(sondes));
  await G.verifierNode({ sonde, forcer: true, maintenant: () => horloge + 4 * 60e3 });
  verif('node: forcer skips the cache', sondes === 3, String(sondes));
  G.oublierNode(); sondes = 0;
  await Promise.all([G.verifierNode({ sonde }), G.verifierNode({ sonde }), G.verifierNode({ sonde })]);
  verif('node: simultaneous calls share one probe', sondes === 1, String(sondes));
  G.oublierNode();

  // Plugin installed twice: simulated list of plugin ids
  const { doublonsMarketplace: dbl } = await import('./catalogue.mjs');
  verif('doublon: app copy + marketplace = the marketplace id to uninstall', JSON.stringify(dbl('relais', ['relais@claude-relais', 'avocat@claude-relais'], true)) === '["relais@claude-relais"]');
  verif('doublon: marketplace only (no app copy) = none', dbl('relais', ['relais@claude-relais'], false).length === 0);
  verif('doublon: app copy only = none', dbl('relais', ['avocat@claude-relais'], true).length === 0 && dbl('relais', [], true).length === 0);
  verif('doublon: copy known as <name>@skills-dir in the list, other marketplace = doublon, skills-dir itself ignored',
    JSON.stringify(dbl('avocat', ['avocat@skills-dir', 'avocat@autre-place'], false)) === '["avocat@autre-place"]' && dbl('avocat', ['avocat@skills-dir'], true).length === 0);
  verif('doublon: several marketplaces listed, de-duplicated; other plugin names and unsafe ids ignored',
    JSON.stringify(dbl('images', ['images@a', 'images@a', 'images@b', 'images-x@a', 'images@mauvais id', 'images@x&calc'], true)) === '["images@a","images@b"]');
  verif('doublon: not a list = none, no crash', dbl('relais', undefined, true).length === 0 && dbl('relais', null, true).length === 0);
}

// ---- "Claude Code not installed": the account answer says so (the page then shows how to install it)
{
  const { compte } = await import('./compte.mjs');
  const sauve = { chemin: process.env.PATH, faux: process.env.TABLEAU_CLAUDE };
  delete process.env.TABLEAU_CLAUDE;
  process.env.PATH = BIN; // fake folder with no `claude` in it
  let c;
  try { c = await compte(true); } finally { process.env.PATH = sauve.chemin; if (sauve.faux !== undefined) process.env.TABLEAU_CLAUDE = sauve.faux; }
  verif('account: no claude command = connecte false, introuvable true, "introuvable" reason', c.connecte === false && c.introuvable === true && /introuvable/.test(c.raison), JSON.stringify(c));
  verif('account: not-installed flag is also what the page reads (app.js sends c.introuvable to the sign-in screen)', /verrouiller\(c\.raison, c\.introuvable === true\)/.test(fs.readFileSync(path.join(ici, 'public', 'app.js'), 'utf8')));
  await compte(true); // refresh the cache with the real environment
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folder deleted)`);
process.exit(ko ? 1 : 0);
