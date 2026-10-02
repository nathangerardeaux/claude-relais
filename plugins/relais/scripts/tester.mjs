// Tests for the relais plugin. Everything happens in a TEMPORARY home folder (never the real ~/.claude),
// with a synthetic 60 MB conversation log. Usage: node tester.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-test-'));
const PROJET = path.join(HOME, 'mon-projet');
fs.mkdirSync(PROJET);
const envBase = { ...process.env, USERPROFILE: HOME, HOME, RELAIS_DOSSIER: '' };
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

fs.rmSync(HOME, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folder deleted)`);
process.exit(ko ? 1 : 0);
