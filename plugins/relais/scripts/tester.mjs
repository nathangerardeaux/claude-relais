// Tests for the relais plugin. Everything happens in a TEMPORARY home folder (never the real ~/.claude),
// with a synthetic 60 MB conversation log and throw-away git repositories. Usage: node tester.mjs
// The v1 suite always runs with RELAIS_V2=0 (the emergency switch must give back v1 exactly);
// the v2 suite runs unless RELAIS_V2=0 is set in the environment.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-test-'));
const PROJET = path.join(HOME, 'mon-projet');
fs.mkdirSync(PROJET);
const envBase = { ...process.env, USERPROFILE: HOME, HOME, RELAIS_DOSSIER: '', RELAIS_V2: '0' };
delete envBase.RELAIS_DOSSIER;
delete envBase.RELAIS_SEUIL_K;
delete envBase.RELAIS_SEUIL_FORT_K;

const lancer = (script, entree, lang = 'fr', envPlus = {}) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ici, script)], {
    input: typeof entree === 'string' ? entree : JSON.stringify(entree),
    env: { ...envBase, RELAIS_LANG: lang, ...envPlus }, encoding: 'utf8',
  });
  let json = null; try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch { json = 'NOT-JSON'; }
  return { code: r.status, ms: Date.now() - t0, json, stderr: r.stderr };
};
let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${detail ? ' — ' + detail : ''}`); };
const usage = (ctx) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5, cache_read_input_tokens: ctx - 2005, cache_creation_input_tokens: 2000 } } });

// Synthetic heavy conversation: ~60 MB of noise, then the last response re-read 680k tokens.
const GROS = path.join(HOME, 'gros.jsonl');
const bruit = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x'.repeat(4000) }] } }) + '\n';
const fd = fs.openSync(GROS, 'w');
fs.writeSync(fd, usage(300000) + '\n');
const bloc = bruit.repeat(250);
for (let i = 0; i < 60; i++) fs.writeSync(fd, bloc);
fs.writeSync(fd, usage(680000) + '\n');
fs.closeSync(fd);
const PETIT = path.join(HOME, 'petit.jsonl');
fs.writeFileSync(PETIT, usage(40000) + '\n');

// ---- Gauge ----
const r1 = lancer('jauge.mjs', { session_id: 's1', transcript_path: GROS, cwd: PROJET, prompt: 'continue' });
verif('gauge: warns on a heavy conversation', r1.code === 0 && /680k/.test(r1.json?.systemMessage || ''), r1.json?.systemMessage);
verif('gauge: note passed to Claude', r1.json?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit' && /jauge relais/.test(r1.json?.hookSpecificOutput?.additionalContext || ''));
verif('gauge: fast on a 60 MB log', r1.ms < 1500, `${r1.ms} ms, ${(fs.statSync(GROS).size / 1e6).toFixed(0)} MB`);
const r2 = lancer('jauge.mjs', { session_id: 's1', transcript_path: GROS, cwd: PROJET, prompt: 'and this?' });
verif('gauge: does not repeat the same reminder', r2.code === 0 && r2.json === null);
const r3 = lancer('jauge.mjs', { session_id: 's2', transcript_path: PETIT, cwd: PROJET, prompt: 'hi' });
verif('gauge: silent below 150k', r3.code === 0 && r3.json === null);
const r4 = lancer('jauge.mjs', { session_id: 's3', transcript_path: GROS, cwd: PROJET, prompt: '/relais' });
verif('gauge: /relais gets the real size, no on-screen reminder', r4.code === 0 && !r4.json?.systemMessage
  && /680k/.test(r4.json?.hookSpecificOutput?.additionalContext || ''), r4.json?.hookSpecificOutput?.additionalContext);
const r5 = lancer('jauge.mjs', 'not json');
verif('gauge: invalid input, no error', r5.code === 0 && r5.json === null && !r5.stderr);
const r6 = lancer('jauge.mjs', { session_id: 's4', transcript_path: GROS, cwd: PROJET, prompt: 'go' }, 'en');
verif('gauge: English messages', /^Relay: this conversation is 680k/.test(r6.json?.systemMessage || '') && /relais gauge/.test(r6.json?.hookSpecificOutput?.additionalContext || ''), r6.json?.systemMessage);

// ---- Resume ----
const dirR = path.join(HOME, '.claude', 'relais');
fs.mkdirSync(dirR, { recursive: true });
const ecrire = (nom, cwd, titre, cle = 'title') => fs.writeFileSync(path.join(dirR, nom), `---\n${cle}: ${titre}\ncwd: ${cwd}\ndate: 2026-09-30 12:00\n---\n\n## Next step\nDo X.\n`);

ecrire('2026-09-30_12h00_menu.md', PROJET, 'Mobile menu', 'titre');
const r7 = lancer('reprise.mjs', { source: 'startup', cwd: PROJET, session_id: 'n1' });
verif('resume startup: announces the relay', /Relais disponible/.test(r7.json?.systemMessage || ''), r7.json?.systemMessage);
verif('resume startup: does not load it', !/Do X\./.test(r7.json?.hookSpecificOutput?.additionalContext || '') && fs.existsSync(path.join(dirR, '2026-09-30_12h00_menu.md')));

const autreEcriture = process.platform === 'win32' ? PROJET.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, l) => `/${l.toLowerCase()}`) : PROJET + '/';
const r8 = lancer('reprise.mjs', { source: 'clear', cwd: autreEcriture, session_id: 'n2' });
verif('resume clear: reloads the content (path written differently)', /Do X\./.test(r8.json?.hookSpecificOutput?.additionalContext || ''), r8.json?.systemMessage);
verif('resume clear: archived after use', fs.existsSync(path.join(dirR, '2026-09-30_12h00_menu.repris.md')) && !fs.existsSync(path.join(dirR, '2026-09-30_12h00_menu.md')));
const r9 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n3' });
verif('resume: single use', r9.code === 0 && r9.json === null);

ecrire('2026-09-30_12h05_autre.md', path.join(HOME, 'autre-projet'), 'Other project');
const r10 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n4' });
verif('resume: ignores a relay from another project', r10.json === null);

ecrire('2026-09-20_10h00_vieux.md', PROJET, 'Old');
const vieux = path.join(dirR, '2026-09-20_10h00_vieux.md');
const t = (Date.now() - 5 * 86400e3) / 1000; fs.utimesSync(vieux, t, t);
const r11 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n5' });
verif('resume: ignores a relay older than 72 h', r11.json === null);

ecrire('2026-09-30_12h10_x.md', PROJET, 'X');
const r12 = lancer('reprise.mjs', { source: 'resume', cwd: PROJET });
verif('resume: leaves a resumed session alone', r12.json === null && fs.existsSync(path.join(dirR, '2026-09-30_12h10_x.md')));
const r13 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n6' }, 'en');
verif('resume: English messages + "title" key', /^Relay resumed: "X"/.test(r13.json?.systemMessage || ''), r13.json?.systemMessage);

// ---- Auto mode ----
verif('auto: Claude is told to write ONE file per conversation', /auto_s1\.md/.test(r1.json?.hookSpecificOutput?.additionalContext || ''));
const r14 = lancer('jauge.mjs', { session_id: 's5', transcript_path: GROS, cwd: PROJET, prompt: 'go' }, 'fr', { RELAIS_AUTO: '0' });
verif('auto: RELAIS_AUTO=0 brings back the simple reminder', /\/relais/.test(r14.json?.systemMessage || '') && !/auto_/.test(r14.json?.hookSpecificOutput?.additionalContext || ''), r14.json?.systemMessage);
ecrire('2026-09-30_09h00_ancien.md', PROJET, 'Ancien');
const t2 = (Date.now() - 3600e3) / 1000; fs.utimesSync(path.join(dirR, '2026-09-30_09h00_ancien.md'), t2, t2);
ecrire('auto_s9.md', PROJET, 'Recent');
const r15 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n7' });
verif('resume: loads the newest and archives the older one too', /Recent/.test(r15.json?.systemMessage || '')
  && fs.existsSync(path.join(dirR, '2026-09-30_09h00_ancien.repris.md')) && fs.existsSync(path.join(dirR, 'auto_s9.repris.md')));
const r16 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'n8' });
verif('resume: the outdated relay never comes back', r16.json === null);

// ---- Tally: tokens before the relay, now, and freed ----
const ancien = path.join(HOME, 'ancien.jsonl');
fs.writeFileSync(ancien, usage(200000) + '\n');
lancer('jauge.mjs', { session_id: 'v1', transcript_path: PETIT, cwd: PROJET, prompt: 'hi' }); // measured at 40k...
const r17 = lancer('fin.mjs', { session_id: 'v1', transcript_path: ancien, cwd: PROJET, reason: 'clear' }); // ...then closed at 200k
verif('end: silent', r17.code === 0 && r17.json === null && !r17.stderr);
lancer('jauge.mjs', { session_id: 'autre', transcript_path: GROS, cwd: path.join(HOME, 'autre-projet'), prompt: 'x' });
ecrire('2026-09-30_13h00_bilan.md', PROJET, 'Bilan');
const r18 = lancer('reprise.mjs', { source: 'clear', cwd: PROJET, session_id: 'v2' });
verif('resume: announces the size of the cleared conversation (this folder only)', /200k/.test(r18.json?.systemMessage || ''), r18.json?.systemMessage);
const neuf = path.join(HOME, 'neuf.jsonl');
fs.writeFileSync(neuf, '');
const r19 = lancer('bilan.mjs', { session_id: 'v2', transcript_path: neuf });
verif('tally: waits until an answer is measured', r19.json === null);
fs.writeFileSync(neuf, usage(30000) + '\n');
const r20 = lancer('bilan.mjs', { session_id: 'v2', transcript_path: neuf });
verif('tally: before / now / freed', /avant 200k.*maintenant 30k.*170k.*-85 %/.test(r20.json?.systemMessage || ''), r20.json?.systemMessage);
const r21 = lancer('bilan.mjs', { session_id: 'v2', transcript_path: neuf });
verif('tally: shown only once', r21.json === null);
const r22 = lancer('bilan.mjs', { session_id: 'jamais', transcript_path: neuf });
verif('tally: silent in an ordinary session', r22.code === 0 && r22.json === null);

// ---- Delegation note (SessionStart, once per session) ----
const ctxD = (r) => r.json?.hookSpecificOutput?.additionalContext || '';
const d1 = lancer('deleguer.mjs', { session_id: 'd1', cwd: PROJET, source: 'startup' });
verif('delegation: note at startup', d1.code === 0 && d1.json?.hookSpecificOutput?.hookEventName === 'SessionStart'
  && /sous-agent/.test(ctxD(d1)) && /"sonnet"/.test(ctxD(d1)) && !d1.json?.systemMessage, ctxD(d1).slice(0, 80));
const d2 = ['clear', 'compact'].map((source) => lancer('deleguer.mjs', { session_id: 'd2', cwd: PROJET, source }));
verif('delegation: note after /clear and after compaction', d2.every((r) => /sous-agent/.test(ctxD(r))));
const d3 = lancer('deleguer.mjs', { session_id: 'd3', cwd: PROJET, source: 'resume' });
verif('delegation: nothing on resume (already in the conversation)', d3.code === 0 && d3.json === null);
const d4 = lancer('deleguer.mjs', { session_id: 'd4', cwd: PROJET, source: 'startup' }, 'fr', { RELAIS_DELEGUER: '0' });
verif('delegation: RELAIS_DELEGUER=0 turns it off', d4.code === 0 && d4.json === null);
const d5 = lancer('deleguer.mjs', { session_id: 'd5', cwd: PROJET, source: 'startup' }, 'en');
verif('delegation: English note', /^\[relais\] Token saving/.test(ctxD(d5)) && /subagent/.test(ctxD(d5)), ctxD(d5).slice(0, 60));
const d6 = lancer('deleguer.mjs', 'not json');
verif('delegation: invalid input, no error', d6.code === 0 && !d6.stderr);
verif('delegation: short note (~90 tokens, under 600 characters)', ctxD(d1).length < 600 && ctxD(d5).length < 600, `${ctxD(d1).length} / ${ctxD(d5).length} car.`);
const hk = JSON.parse(fs.readFileSync(path.join(ici, '..', 'hooks', 'hooks.json'), 'utf8')).hooks.SessionStart;
verif('delegation: hook wired on startup|clear|compact', hk.some((h) => h.matcher === 'startup|clear|compact' && h.hooks.some((x) => /deleguer\.mjs/.test(x.command))));

console.log(`v1 (RELAIS_V2=0): ${ok} passed, ${ko} failed`);
if (process.env.RELAIS_V2 === '0') console.log('RELAIS_V2=0 in the environment: v2 suite skipped');
else await suiteV2();

fs.rmSync(HOME, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folders deleted)`);
process.exit(ko ? 1 : 0);

// ============================================================ v2 ============================================================
async function suiteV2() {
  console.log('\n---- v2 ----');
  const C = await import(pathToFileURL(path.join(ici, 'commun.mjs')).href); // pure functions, tested in-process
  const H = path.join(HOME, 'v2');
  fs.mkdirSync(H);
  const env2 = { ...process.env, USERPROFILE: H, HOME: H, RELAIS_LANG: 'fr' };
  for (const v of ['RELAIS_DOSSIER', 'RELAIS_SEUIL_K', 'RELAIS_SEUIL_FORT_K', 'RELAIS_V2', 'RELAIS_AUTO', 'RELAIS_ATTENTE_MS', 'RELAIS_TEST_GIT_DELAI_MS']) delete env2[v];
  let pire = 0;
  const lire = (out) => { try { return out ? JSON.parse(out) : null; } catch { return 'NOT-JSON'; } };
  const L = (script, entree, plus = {}) => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(ici, script)], {
      input: typeof entree === 'string' ? entree : JSON.stringify(entree), env: { ...env2, ...plus }, encoding: 'utf8',
    });
    const ms = Date.now() - t0; pire = Math.max(pire, ms);
    return { code: r.status, ms, json: lire(r.stdout), stderr: r.stderr };
  };
  const LA = (script, entree, plus = {}) => new Promise((resolve) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, [path.join(ici, script)], { env: { ...env2, ...plus } });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => { const ms = Date.now() - t0; pire = Math.max(pire, ms); resolve({ code, ms, json: lire(out), stderr: err }); });
    c.stdin.end(JSON.stringify(entree));
  });
  const dormir = (ms) => new Promise((fait) => setTimeout(fait, ms));
  const G = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const depot = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    G(dir, 'init', '-q'); G(dir, 'config', 'user.email', 't@t'); G(dir, 'config', 'user.name', 't'); G(dir, 'config', 'core.autocrlf', 'false');
  };
  const commit = (dir, msg) => { G(dir, 'add', '-A'); G(dir, 'commit', '-q', '-m', msg); };
  const D = path.join(H, '.claude', 'relais');
  fs.mkdirSync(path.join(D, '.etat'), { recursive: true });
  const slug = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');
  // Each project has its own Claude Code project folder (where the logs and the memory live).
  const TP = (P) => { const d = path.join(H, '.claude', 'projects', slug(P)); fs.mkdirSync(d, { recursive: true }); return d; };
  const proj = (nom) => { const p = path.join(H, nom); fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'README.md'), 'x\n'); TP(p); return p; };
  const tr = (P, nom, ctx) => { const p = path.join(TP(P), `${nom}.jsonl`); fs.writeFileSync(p, usage(ctx) + '\n'); return p; };
  const BON = (titre, plus = '') => `# ${titre}\n\n## Objectif\nFinir X.\n\n## Où lire quoi\n- \`README.md\` : contexte\n\n## Vérifié / pas vérifié\n- Vérifié : tests verts.\n\n## En attente du feu vert\n- Déploiement.\n\n## Prochaine étape\nCORPS_${titre}\n${plus}`;
  const auto = (sid, texte, ilYa = 0) => {
    const p = path.join(D, `auto_${sid}.md`); fs.writeFileSync(p, texte);
    if (ilYa) { const t = (Date.now() - ilYa) / 1000; fs.utimesSync(p, t, t); }
    return p;
  };
  const existe = (nom) => fs.existsSync(path.join(D, nom));
  const jauge = (sid, P, prompt, ctx = 20000, plus = {}, cwd = P) => L('jauge.mjs', { session_id: sid, transcript_path: tr(P, sid, ctx), cwd, prompt }, plus);
  const demande = (sid, P, cwd = P) => jauge(sid, P, '/relais', 100000, {}, cwd);
  const stop = (sid, ctx, P, plus = {}, cwd = P) => L('controle.mjs', { session_id: sid, transcript_path: tr(P, sid, ctx), cwd, stop_hook_active: false, ...plus }, plus.env || {});
  const fin = (sid, ctx, P, cwd = P, env = {}) => L('fin.mjs', { session_id: sid, transcript_path: tr(P, sid, ctx), cwd, reason: 'clear' }, env);
  const entreeReprise = (sid, P, source = 'clear', cwd = P) => ({ session_id: sid, cwd, source, transcript_path: path.join(TP(P), `${sid}.jsonl`) });
  const reprise = (sid, P, source = 'clear', env = {}, cwd = P) => L('reprise.mjs', entreeReprise(sid, P, source, cwd), env);
  const ac = (r) => r.json?.hookSpecificOutput?.additionalContext || '';
  const sm = (r) => r.json?.systemMessage || '';
  const ligneDe = (r, debut) => (ac(r).split('\n').find((l) => l.startsWith(debut)) || '');
  const meta = (sid) => { try { return JSON.parse(fs.readFileSync(path.join(D, '.etat', `meta_${sid}.json`), 'utf8')); } catch { return null; } };
  const egal = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  const memoire = (P, git = true) => {
    const m = path.join(TP(P), 'memory');
    if (git) depot(m); else fs.mkdirSync(m, { recursive: true });
    fs.writeFileSync(path.join(m, 'MEMORY.md'), 'ligne 1\nligne 2\nligne 3\n');
    if (git) commit(m, 'init');
    return m;
  };

  // ---- Gauge: exact file of the session, real project recorded, narrow request detection (2) ----
  const PJ = proj('jauge');
  const j1 = jauge('m1', PJ, '/relais', 90000);
  verif('v2 /relais: gets the exact path auto_<sid>.md + the real size + the mode, nothing on screen',
    /relais\/auto_m1\.md/.test(ac(j1)) && /90k/.test(ac(j1)) && /relais v2/.test(ac(j1)) && !j1.json?.systemMessage, ac(j1).slice(0, 120));
  verif('v2 /relais: real folder and project recorded by the script', egal(meta('m1')?.cwd, PJ) && /^p:/.test(meta('m1')?.cle || ''));
  for (const p of ['écris le relais', 'fais le relais', 'ok, fais le relais stp', 'rédige le relais', 'write the handoff']) {
    verif(`v2 request detected: "${p}"`, /auto_m2\.md/.test(ac(jauge('m2', PJ, p))));
  }
  for (const p of ['lance les tests du relais', 'fais une revue du relais', 'relais : pourquoi la jauge ne dit rien ?', 'do not make a relay', 'reprends le relais', 'on parlera du relais demain, fais le relais plus tard']) {
    verif(`v2 not a request: "${p}"`, jauge('m3', PJ, p).json === null);
  }
  const j4 = jauge('g1', PJ, 'continue', 160000);
  verif('v2 auto threshold: same screen message, exact file, a-ranger.md, "for this relay" only (8)',
    /160k/.test(sm(j4)) && /auto_g1\.md/.test(ac(j4)) && /a-ranger\.md/.test(ac(j4)) && /Pour ce relais, ne modifie aucun fichier de mémoire/.test(ac(j4))
    && /n'interdit pas ce que l'utilisateur te demande/.test(ac(j4)) && !/notes durables/.test(ac(j4)), ac(j4).slice(0, 120));
  verif('v2 auto: no repeated reminder (thresholds unchanged)', jauge('g1', PJ, 'encore', 170000).json === null);
  const j6 = jauge('g2', PJ, 'go', 160000, { RELAIS_LANG: 'en' });
  verif('v2 auto: English note', /relais v2/.test(ac(j6)) && /For this relay, do not modify any memory file/.test(ac(j6)));

  // ---- Normal resume + a-ranger.md + tally ----
  const PN = proj('normal');
  fs.writeFileSync(path.join(D, 'a-ranger.md'), '# À ranger\n- idée 1\n- idée 2\n');
  demande('n1', PN);
  auto('n1', BON('Menu'));
  const s1 = stop('n1', 160000, PN);
  verif('v2 Stop: well-formed relay, silent, metadata recorded', s1.json === null && meta('n1')?.ctx === 160000 && egal(meta('n1').cwd, PN));
  const f1 = fin('n1', 170000, PN);
  const ferme1 = JSON.parse(fs.readFileSync(path.join(D, '.etat', 'ferme_n1.json'), 'utf8'));
  verif('v2 end: closing record written without waiting for the log, size apart (5)',
    f1.json === null && !('ctx' in ferme1) && JSON.parse(fs.readFileSync(path.join(D, '.etat', 'fermectx_n1.json'), 'utf8')).ctx === 170000);
  const n1 = reprise('n1b', PN);
  verif('v2 resume: reloads the closed session\'s fresh relay', /CORPS_Menu/.test(ac(n1)) && /Relais repris/.test(sm(n1)) && /170k/.test(sm(n1)), sm(n1));
  verif('v2 resume: proposes the next step and waits (8)', /attends une demande de l'utilisateur avant d'agir/.test(ac(n1)) && !/Enchaîne/.test(ac(n1)));
  verif('v2 resume: small gap (10k) = no freshness warning', !/Fraîcheur/.test(ac(n1)));
  verif('v2 resume: archived after use', existe('auto_n1.repris.md') && !existe('auto_n1.md'));
  verif('v2 a-ranger.md: counter shown, file kept', /2 proposition/.test(ac(n1)) && /2 proposition/.test(sm(n1)) && existe('a-ranger.md'));
  verif('v2 tally prepared with the final size', JSON.parse(fs.readFileSync(path.join(D, '.etat', 'bilan_n1b.json'), 'utf8')).avant === 170000);
  verif('v2 resume: single use, a-ranger.md never archived', reprise('n1c', PN).json === null && !existe('a-ranger.repris.md') && existe('a-ranger.md'));

  // ---- B4 in auto mode (11): /clear long after the relay = pointed to, not reloaded ----
  const PB4 = proj('b4');
  auto('b41', BON('Vieux'), 40 * 60e3);
  stop('b41', 160000, PB4); fin('b41', 165000, PB4);
  const b4 = reprise('b42', PB4);
  verif('v2 B4: relay written 40 min before /clear is pointed to, not loaded nor archived',
    !/CORPS_Vieux/.test(ac(b4)) && /non rechargé/.test(sm(b4)) && /auto_b41\.md/.test(ac(b4)) && /archivable/.test(ac(b4)) && existe('auto_b41.md'), sm(b4));

  // ---- Two parallel sessions in the same project ----
  const PP = proj('paralleles');
  auto('pA', BON('SujetA')); stop('pA', 160000, PP);
  auto('pB', BON('SujetB')); stop('pB', 165000, PP);
  fin('pA', 170000, PP);
  const pa = reprise('pA2', PP);
  verif('v2 parallel: A gets A\'s relay, not B\'s', /CORPS_SujetA/.test(ac(pa)) && !/CORPS_SujetB/.test(ac(pa)));
  verif('v2 parallel: B\'s relay neither archived nor touched', existe('auto_pB.md') && existe('auto_pA.repris.md'));
  fin('pB', 175000, PP);
  const pb = reprise('pB2', PP);
  verif('v2 parallel: B then gets B\'s relay', /CORPS_SujetB/.test(ac(pb)) && !/CORPS_SujetA/.test(ac(pb)) && existe('auto_pB.repris.md'));
  auto('amA', BON('AmbA')); stop('amA', 160000, PP);
  auto('amB', BON('AmbB')); stop('amB', 160000, PP);
  fin('amA', 170000, PP); fin('amB', 170000, PP);
  const am = reprise('amX', PP);
  verif('v2 parallel: two /clear at once = ambiguous, nothing injected or archived', !/CORPS_/.test(ac(am)) && existe('auto_amA.md') && existe('auto_amB.md'));
  const st = reprise('neuf', PP, 'startup');
  verif('v2 startup: announces, never loads', /relais disponibles|Relais disponible/.test(sm(st)) && !/CORPS_/.test(ac(st)) && existe('auto_amA.md'), sm(st));

  // ---- /clear to change topic ----
  const PS = proj('sujet');
  auto('autre', BON('AutreSession')); stop('autre', 160000, PS);
  fin('sujet1', 50000, PS);
  const s2 = reprise('sujet2', PS);
  verif('v2 /clear without own relay: nothing injected, other relay only announced',
    !/CORPS_/.test(ac(s2)) && existe('auto_autre.md') && /Relais disponible/.test(sm(s2)) && /NON chargés/.test(ac(s2)), sm(s2));
  const PV = proj('vide');
  fin('vide1', 50000, PV);
  const vr = reprise('vide2', PV);
  verif('v2 /clear in a project without relay: silent and immediate', vr.json === null && vr.ms < 2000, `${vr.ms} ms`);

  // ---- SessionEnd / SessionStart race, both orders (End first = the normal order, covered above) ----
  const PC = proj('course');
  auto('rc1', BON('Course')); stop('rc1', 160000, PC);
  const promesse = LA('reprise.mjs', entreeReprise('rc2', PC));
  await dormir(700);
  fin('rc1', 165000, PC);
  const rc = await promesse;
  verif('v2 race: SessionStart before SessionEnd still reloads the right relay', /CORPS_Course/.test(ac(rc)), `${rc.ms} ms`);
  auto('rc3', BON('SansFin')); stop('rc3', 160000, PC);
  const rs = reprise('rc4', PC);
  verif('v2 race: no SessionEnd at all = waits ~3 s then announces only', !/CORPS_/.test(ac(rs)) && existe('auto_rc3.md') && rs.ms >= 2900 && rs.ms < 6000, `${rs.ms} ms`);
  // (5) A's SessionEnd arrives after A' gave up; B is cleared soon after: B' must not take A's relay.
  const P5 = proj('abandon');
  const vite = { RELAIS_ATTENTE_MS: '1000' };
  auto('a5', BON('RelaisDeA')); stop('a5', 160000, P5);
  reprise('a5bis', P5, 'clear', vite);
  fin('a5', 165000, P5);
  await dormir(3500);
  const pB5 = LA('reprise.mjs', entreeReprise('b5bis', P5), vite);
  await dormir(300);
  fin('b5', 50000, P5);
  const b5 = await pB5;
  verif('v2 race: an abandoned closing record (> ATTENTE + 2 s) is never taken by another /clear (5)', !/CORPS_RelaisDeA/.test(ac(b5)) && existe('auto_a5.md'), sm(b5));

  // ---- Relay without header; old v1-format file of the session (1) ----
  const PH = proj('sans-entete');
  auto('h1', '## Prochaine étape\nCORPS_SansTete\n\n## Vérifié\n- rien\n\n## En attente du feu vert\n- rien\n');
  stop('h1', 160000, PH); fin('h1', 165000, PH);
  const h = reprise('h2', PH);
  verif('v2 relay without header (no cwd:, no title): reloaded all the same', /CORPS_SansTete/.test(ac(h)) && /auto_h1\.md/.test(sm(h)), sm(h));
  auto('v1fmt', '---\ntitle: ancien\ncwd: x\n---\n## Next\nDo X.\n');
  const v1s = stop('v1fmt', 160000, PH);
  verif('v2 Stop: a relay file written without any relay request is recorded silently, never blocked (1)', v1s.json === null && !!meta('v1fmt')?.mtimeVu);
  const PH2 = proj('avant-demande');
  auto('v1b', '# rien\n', 60e3);
  demande('v1b', PH2);
  verif('v2 Stop: a relay older than the request is not blocked (1)', stop('v1b', 160000, PH2).json === null);

  // ---- Relay too long / sections missing: Stop check once, 8,000 budget at reload ----
  const PL = proj('long');
  const long = BON('Long') + Array.from({ length: 120 }, (_, i) => `- détail ${i} ${'x'.repeat(200)}`).join('\n');
  demande('L1', PL);
  auto('L1', long);
  const b1 = stop('L1', 160000, PL);
  verif('v2 Stop: too long relay -> Claude told (decision block)', b1.json?.decision === 'block' && /trop long/.test(b1.json?.reason || ''), b1.json?.reason);
  auto('L1', `${long}\n- encore`);
  const b2 = stop('L1', 160000, PL, { stop_hook_active: true });
  auto('L1', `${long}\n- encore 2`);
  const b3 = stop('L1', 160000, PL);
  verif('v2 Stop: never blocks when stop_hook_active, and only once', b2.json === null && b3.json === null);
  fin('L1', 165000, PL);
  const rl = reprise('L2', PL);
  const total = ac(rl).length + sm(rl).length;
  verif('v2 budget: note + checks + relay <= 8,000 characters', total <= 8000 && /relais tronqué/.test(ac(rl)) && /CORPS_Long/.test(ac(rl)), `${total} car.`);
  demande('sec1', PL);
  auto('sec1', '# Manque\n\n## Objectif\nX\n');
  const b4s = stop('sec1', 160000, PL);
  verif('v2 Stop: missing sections named', b4s.json?.decision === 'block' && /Prochaine étape/.test(b4s.json.reason) && /feu vert/.test(b4s.json.reason), b4s.json?.reason);

  // ---- Stale relay: > 20k gap -> pointed to, with the files changed since (git, accented names) ----
  const PG = proj('perime');
  depot(PG); fs.writeFileSync(path.join(PG, 'a.txt'), 'a\n'); fs.writeFileSync(path.join(PG, 'é.txt'), 'e\n'); commit(PG, 'init');
  const avant = (Date.now() - 600e3) / 1000; // the project existed before the relay
  for (const f of ['README.md', 'a.txt', 'é.txt']) fs.utimesSync(path.join(PG, f), avant, avant);
  auto('st1', BON('Perime'), 120e3);
  stop('st1', 150000, PG);
  fs.writeFileSync(path.join(PG, 'a.txt'), 'a modifié\n');
  fs.writeFileSync(path.join(PG, 'é.txt'), 'é modifié\n');
  fs.writeFileSync(path.join(PG, 'b.txt'), 'nouveau\n');
  fin('st1', 200000, PG);
  const rp = reprise('st2', PG);
  const ligneF = ligneDe(rp, '- Fichiers du dossier');
  verif('v2 stale: not reloaded, gap and relay time stated', !/CORPS_Perime/.test(ac(rp)) && /Fraîcheur/.test(ac(rp)) && /\+50k/.test(ac(rp)) && existe('auto_st1.md'), ligneDe(rp, '- Fraîcheur'));
  verif('v2 stale: files changed since listed, accented name intact (9)', /a\.txt/.test(ligneF) && /b\.txt/.test(ligneF) && /é\.txt/.test(ligneF)
    && !/supprimé|\\303|README/.test(ligneF), ligneF);

  // ---- Memory guard: deleted lines detected, never undone ----
  const PM = proj('memoire');
  const M = memoire(PM);
  demande('mm1', PM);
  fs.writeFileSync(path.join(M, 'MEMORY.md'), 'ligne 1\nligne 3\nligne 4\n'); commit(M, 'synchro');
  auto('mm1', BON('Memoire')); stop('mm1', 110000, PM); fin('mm1', 115000, PM);
  const nbCommits = G(M, 'rev-list', '--count', 'HEAD').stdout.trim();
  const rm = reprise('mm2', PM);
  verif('v2 memory: deleted line reported', /ATTENTION mémoire/.test(ac(rm)) && /MEMORY\.md \(-1\)/.test(ac(rm)), ligneDe(rm, '- ATTENTION'));
  verif('v2 memory: the plugin changed nothing in it', fs.readFileSync(path.join(M, 'MEMORY.md'), 'utf8') === 'ligne 1\nligne 3\nligne 4\n'
    && G(M, 'rev-list', '--count', 'HEAD').stdout.trim() === nbCommits && G(M, 'status', '--porcelain').stdout === '');
  const PMn = proj('memoire-non-commit');
  const Mn = memoire(PMn);
  demande('mn1', PMn);
  auto('mn1', BON('NonCommite')); stop('mn1', 110000, PMn);
  fs.writeFileSync(path.join(Mn, 'MEMORY.md'), 'ligne 1\n'); // deleted, not committed yet
  fin('mn1', 115000, PMn);
  verif('v2 memory: uncommitted deletions reported too', /MEMORY\.md \(-2\)/.test(ac(reprise('mn2', PMn))));
  const PM2 = proj('memoire-ajout');
  const M2 = memoire(PM2);
  demande('ma1', PM2);
  fs.appendFileSync(path.join(M2, 'MEMORY.md'), 'ligne ajoutée\n'); commit(M2, 'ajout');
  auto('ma1', BON('Ajout')); stop('ma1', 110000, PM2); fin('ma1', 115000, PM2);
  const ra = reprise('ma2', PM2);
  verif('v2 memory: additions only = no warning, and the memory WAS found (10)', egal(meta('ma1')?.memDir, M2) && !!meta('ma1')?.headMem
    && /CORPS_Ajout/.test(ac(ra)) && !/ATTENTION|Contrôle mémoire/.test(ac(ra)));
  const P7 = proj('memoire-sans-git');
  memoire(P7, false);
  auto('m71', BON('SansGit')); stop('m71', 110000, P7); fin('m71', 115000, P7);
  verif('v2 memory folder without git: "contrôle mémoire impossible" stated (7)', /Contrôle mémoire impossible/.test(ac(reprise('m72', P7))));

  // ---- Project identity survives a `cd` during the session (6) ----
  const P6 = proj('identite');
  fs.mkdirSync(path.join(P6, 'sous'));
  const M6 = memoire(P6);
  demande('cd1', P6);
  fs.writeFileSync(path.join(M6, 'MEMORY.md'), 'ligne 1\n'); commit(M6, 'synchro');
  auto('cd1', BON('ApresCd'));
  stop('cd1', 110000, P6, {}, path.join(P6, 'sous'));
  fin('cd1', 115000, P6, path.join(P6, 'sous'));
  const r6 = reprise('cd2', P6);
  verif('v2 identity: after a cd, the relay is still reloaded and the memory still guarded (6)',
    /CORPS_ApresCd/.test(ac(r6)) && /MEMORY\.md \(-2\)/.test(ac(r6)) && egal(meta('cd1')?.memDir, M6), sm(r6));

  // ---- Corrupted metadata never reaches git as an option (9) ----
  const P9 = proj('meta-corrompu');
  depot(P9); commit(P9, 'init');
  memoire(P9);
  auto('c91', BON('Corrompu'), 120e3); stop('c91', 100000, P9);
  const m9 = meta('c91');
  fs.writeFileSync(path.join(D, '.etat', 'meta_c91.json'), JSON.stringify({ ...m9, headMem: '--output=TEMOIN_MEM.txt', headCwd: '--output=TEMOIN_CWD.txt' }));
  fin('c91', 150000, P9);
  const r9 = reprise('c92', P9);
  const temoins = [P9, path.join(TP(P9), 'memory'), H, ici].some((d) => fs.readdirSync(d).some((f) => f.startsWith('TEMOIN')));
  verif('v2 corrupted HEAD in .etat: refused, no file written, memory check stated impossible (9)', !temoins && /Contrôle mémoire impossible/.test(ac(r9)));

  // ---- Secret (warned, not masked) + missing path + UNC never probed (S2) ----
  const PK = proj('controles');
  const cle = `sk-ant-api03-${'A1b2'.repeat(10)}`;
  demande('k1', PK);
  auto('k1', BON('Controles', `- clé : ${cle}\n- \`src/absent.js:12\` à créer\n- \`README.md:1\`\n- \`origin/main\`, \`/clear\`\n- \`\\\\exemple.invalid\\partage\\x.txt\` \`//exemple.invalid/y.txt\` \`file://exemple.invalid/z.txt\` \`../dehors/w.txt\`\n`));
  const kb = stop('k1', 160000, PK);
  verif('v2 Stop: possible secret -> Claude told', kb.json?.decision === 'block' && /secret/.test(kb.json?.reason || ''), kb.json?.reason);
  fin('k1', 165000, PK);
  const rk = reprise('k2', PK);
  const ligneC = ligneDe(rk, '- Chemins cités');
  verif('v2 secret: reported at reload, text NOT masked', /Secret possible/.test(ac(rk)) && ac(rk).includes(cle));
  verif('v2 missing path: "non trouvés (relatifs ou à créer ?)", existing paths and non-paths ignored',
    /src\/absent\.js/.test(ligneC) && /à créer/.test(ligneC) && !/README|origin|clear/.test(ligneC), ligneC);
  verif('v2 S2: UNC, //host, URL and paths outside the cwd are never probed', !/exemple|dehors/.test(ligneC), ligneC);
  const sond = (c) => C.cheminSondable(c, PK);
  verif('v2 S2: cheminSondable refuses \\\\host, //host, \\\\?\\, \\\\.\\, URLs, control chars, ~, ..',
    ['\\\\exemple.invalid\\partage\\x.txt', '//exemple.invalid/x.txt', '\\\\?\\C:\\x.txt', '\\\\.\\pipe\\x', '\\\\?\\UNC\\h\\s\\x.txt',
      'file://exemple.invalid/x.txt', 'file:x.txt', 'http://h/y.txt', 'a\u0001b/c.txt', '~/x.txt', '../dehors/x.txt', 'C:x.txt']
      .every((c) => sond(c) === null)
    && egal(sond('src/a.js'), path.join(PK, 'src', 'a.js')) && C.cheminSondable('src/a.js', '\\\\h\\s') === null
    && (process.platform !== 'win32' || egal(sond('C:\\x\\y.txt'), 'C:\\x\\y.txt')));
  verif('v2 (9) estHash: only a 40-64 hex hash may reach git',
    C.estHash('a'.repeat(40)) && C.estHash('0123456789abcdef'.repeat(4)) && !C.estHash('--output=x') && !C.estHash('HEAD') && !C.estHash('a'.repeat(39))
    && C.suppressionsMemoire(path.join(TP(PK)), '--output=x', Date.now() + 5000) === null && C.fichiersDepuis !== undefined);
  demande('k3', PK);
  auto('k3', BON('Faux', '- password=<ton mot de passe>\n- préfixe sk-court, AKIA seul, password=${PASS}\n'));
  verif('v2 secrets: no false positive on placeholders', stop('k3', 160000, PK).json === null);

  // ---- Worst-case budget (10): all alerts + huge relay, in both modes ----
  const pireCas = async (nom, ctxFin) => {
    const P = proj(nom);
    depot(P);
    const noms = Array.from({ length: 15 }, (_, i) => `${String(i).padStart(2, '0')}_${'n'.repeat(116)}.txt`);
    for (const n of noms) fs.writeFileSync(path.join(P, n), 'x\n');
    commit(P, 'init');
    const m = path.join(TP(P), 'memory');
    depot(m);
    for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(m, `${i}_${'m'.repeat(100)}.md`), 'a\nb\nc\n');
    commit(m, 'init');
    demande(`${nom}1`, P);
    for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(m, `${i}_${'m'.repeat(100)}.md`), 'a\n');
    commit(m, 'synchro');
    const absents = Array.from({ length: 5 }, (_, i) => `- \`src/${'p'.repeat(100)}${i}.js\``).join('\n');
    auto(`${nom}1`, BON('Pire', `- ${cle}\n${absents}\n${'- remplissage '.repeat(2000)}`), 120e3);
    stop(`${nom}1`, 150000, P);
    for (const n of noms) fs.writeFileSync(path.join(P, n), 'modifié\n');
    fin(`${nom}1`, ctxFin, P);
    const r = reprise(`${nom}2`, P);
    const c = ac(r);
    const iMem = c.indexOf('ATTENTION mémoire');
    const iSec = c.indexOf('Secret possible');
    const iFr = c.indexOf('Fraîcheur');
    return { total: c.length + sm(r).length, iMem, iSec, iFr, c, fichiers: ligneDe(r, '- Fichiers du dossier') };
  };
  const w1 = await pireCas('pire-plein', 155000);
  verif('v2 worst case, relay reloaded: <= 8,000 with memory + secret alerts present', w1.total <= 8000 && w1.iMem > 0 && w1.iSec > 0 && /CORPS_Pire/.test(w1.c), `${w1.total} car.`);
  const w2 = await pireCas('pire-perime', 250000);
  verif('v2 worst case, stale: <= 8,000, alerts BEFORE freshness, file list capped (~800)',
    w2.total <= 8000 && w2.iMem > 0 && w2.iSec > w2.iMem && w2.iFr > w2.iSec && w2.fichiers.length < 1000 && /\+\d+ autres/.test(w2.fichiers), `${w2.total} car., liste ${w2.fichiers.length} car.`);

  // ---- S1: a trapped repository never makes git run anything ----
  const PT = proj('piege');
  depot(PT); fs.writeFileSync(path.join(PT, 'a.txt'), 'a\n'); commit(PT, 'init');
  const MT = memoire(PT);
  const temoin = path.join(H, 'TEMOIN_PIEGE').replace(/\\/g, '/');
  const script = path.join(H, 'piege.sh');
  fs.writeFileSync(script, `#!/bin/sh\necho "$0 $*" >> "${temoin}"\nexit 1\n`);
  fs.chmodSync(script, 0o755);
  const s = script.replace(/\\/g, '/');
  for (const d of [PT, MT]) {
    for (const [cfg, val] of [['core.fsmonitor', s], ['diff.external', s], ['filter.pg.clean', s], ['filter.pg.smudge', s],
      ['diff.pg.textconv', s], ['core.pager', s], ['log.showSignature', 'true'], ['gpg.program', s]]) G(d, 'config', cfg, val);
    fs.writeFileSync(path.join(d, '.git', 'info', 'attributes'), '* filter=pg diff=pg\n');
  }
  // Control: the trap does fire with a plain git command.
  G(PT, 'ls-files'); const piegeActif = fs.existsSync(temoin); try { fs.unlinkSync(temoin); } catch { /* none */ }
  demande('pt1', PT);
  auto('pt1', BON('Piege'), 120e3); stop('pt1', 150000, PT);
  fs.writeFileSync(path.join(PT, 'a.txt'), 'a modifié\n');
  fs.writeFileSync(path.join(MT, 'MEMORY.md'), 'ligne 1\n');
  fin('pt1', 200000, PT);
  const rt = reprise('pt2', PT);
  verif('v2 S1: hooks never trigger core.fsmonitor / filters / diff.external / textconv / pager of a trapped repo',
    piegeActif && !fs.existsSync(temoin) && /a\.txt/.test(ligneDe(rt, '- Fichiers du dossier')) && /MEMORY\.md \(-2\)/.test(ac(rt)),
    `piège actif sans protection : ${piegeActif}, témoin après hooks : ${fs.existsSync(temoin)}`);

  // ---- Slow git (simulated): every hook still answers well under 10 s (10) ----
  const PZ = proj('git-lent');
  depot(PZ); commit(PZ, 'init');
  memoire(PZ);
  const lent = { RELAIS_TEST_GIT_DELAI_MS: '2500' };
  auto('z1', BON('Lent'), 120e3);
  const sz = stop('z1', 150000, PZ, { env: lent });
  fin('z1', 200000, PZ);
  const rz = reprise('z2', PZ, 'clear', lent);
  verif('v2 slow git (2.5 s per call, git really run): Stop and resume still answer < 9.5 s', sz.ms < 9500 && rz.ms < 9500 && /Fraîcheur/.test(ac(rz)) && !!meta('z1')?.headCwd && !!meta('z1')?.headMem, `Stop ${sz.ms} ms, reprise ${rz.ms} ms`);

  // ---- v1 relays: announced, never injected ----
  const P1 = proj('ancien-v1');
  fs.writeFileSync(path.join(D, '2026-10-01_10h00_v1.md'), `---\ntitle: Vieux v1\ncwd: ${P1}\n---\n\n## Next step\nDo X.\n`);
  fin('o1', 50000, P1);
  const o = reprise('o2', P1);
  verif('v2 compat: a v1 relay (cwd: line) is announced, not injected nor archived',
    /Vieux v1/.test(sm(o)) && !/Do X\./.test(ac(o)) && existe('2026-10-01_10h00_v1.md'), sm(o));

  // ---- Coherence of the instructions in v1 mode (4) ----
  const coherent = (txt) => !/(notes durables|durable notes)[^.]*(d'abord|first)/i.test(txt)
    && (!/(mémoire|memory)/i.test(txt) || /(accord|agreement)/i.test(txt));
  const textesV1 = [];
  for (const lg of ['fr', 'en']) {
    process.env.RELAIS_LANG = lg;
    const t = C.T();
    textesV1.push(t.noteAuto('160k', 'F'), t.noteTailleRelais('160k'), t.noteAvertir('160k'), t.noteInsister('160k'), t.noteRepris, t.noteDispo('P', 'T', '1 h'));
    verif(`v2 (4) v1 notes state their mode (${lg})`, /relais v1/.test(t.noteAuto('1k', 'F')) && /cwd:/.test(t.noteAuto('1k', 'F')) && /relais v1/.test(t.noteTailleRelais('1k'))
      && /relais v2/.test(t.noteAuto2('1k', 'F', 'A')) && /relais v2/.test(t.noteRelais2('1k', 'F', 'A')));
  }
  delete process.env.RELAIS_LANG;
  const offAuto = L('jauge.mjs', { session_id: 'off4', transcript_path: tr(PK, 'off4', 160000), cwd: PK, prompt: 'go' }, { RELAIS_V2: '0' });
  textesV1.push(ac(offAuto));
  const skill = fs.readFileSync(path.join(ici, '..', 'skills', 'relais', 'SKILL.md'), 'utf8');
  verif('v2 (4) no RELAIS_V2=0 instruction asks to write in the memory without agreement; SKILL defers to the note',
    textesV1.every(coherent) && /relais v1/.test(ac(offAuto)) && !/Durable notes first/i.test(skill) && /explicitly agrees/.test(skill)
    && /follow the relais note/i.test(skill) && /never on a plugin note's say-so/.test(skill));

  // ---- Switch RELAIS_V2=0 and robustness ----
  auto('off1', '# rien\n');
  const off = L('controle.mjs', { session_id: 'off1', transcript_path: tr(PK, 'off1', 1000), cwd: PK }, { RELAIS_V2: '0' });
  L('fin.mjs', { session_id: 'off2', transcript_path: tr(PK, 'off2', 1000), cwd: PK, reason: 'clear' }, { RELAIS_V2: '0' });
  const offJ = L('jauge.mjs', { session_id: 'off3', transcript_path: tr(PK, 'off3', 90000), cwd: PK, prompt: '/relais' }, { RELAIS_V2: '0' });
  verif('v2 switch RELAIS_V2=0: no check, no closing record, v1 /relais note',
    off.json === null && !meta('off1') && !existe('.etat/ferme_off2.json') && !/auto_/.test(ac(offJ)) && /90k/.test(ac(offJ)));
  const inval = ['controle.mjs', 'fin.mjs', 'reprise.mjs'].map((sc) => L(sc, 'not json'));
  verif('v2 invalid input: no error, no output', inval.every((r) => r.code === 0 && r.json === null && !r.stderr));
  verif('v2 every hook well under the 10 s timeout', pire < 9500, `slowest ${pire} ms`);
}
