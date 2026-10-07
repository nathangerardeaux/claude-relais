// Tests for the avocat plugin, in a TEMPORARY folder (never the real ~/.claude). Usage: node tester.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avocat-test-'));
const ETAT = path.join(TMP, 'avocat', 'etat.json');
const envBase = { ...process.env, AVOCAT_ETAT: ETAT, AVOCAT_LANG: 'fr' };
delete envBase.AVOCAT_MIN_CAR;

const lancer = (script, entree, args = [], env = {}) => {
  const r = spawnSync(process.execPath, [path.join(ici, script), ...args], {
    input: typeof entree === 'string' ? entree : JSON.stringify(entree ?? {}), env: { ...envBase, ...env }, encoding: 'utf8',
  });
  let json = null; try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch { json = 'NOT-JSON'; }
  return { code: r.status, json, out: r.stdout, stderr: r.stderr };
};
let ok = 0, ko = 0;
const verif = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom}${detail ? ' — ' + detail : ''}`); };

let n = 0;
const transcript = (blocs, prompt = 'Explique-moi ce code') => {
  const f = path.join(TMP, `t${++n}.jsonl`);
  const l = [
    { type: 'user', message: { role: 'user', content: 'ancienne question' } },
    { type: 'assistant', message: { id: 'old', content: [{ type: 'tool_use', id: 'x0', name: 'Agent', input: { subagent_type: 'avocat-du-diable' } }] } },
    { type: 'user', message: { role: 'user', content: prompt } },
    ...blocs.map((b, i) => ({ type: 'assistant', message: { id: `m${i}`, content: [b] } })),
  ];
  fs.writeFileSync(f, l.map((x) => JSON.stringify(x)).join('\n') + '\n');
  return f;
};
const LONG = { type: 'text', text: 'La fonction X renvoie toujours un tableau trié, et le test passe. '.repeat(5) };
const COURT = { type: 'text', text: 'Bonjour !' };

// ---- switch ----
verif('switch: off by default', /désactivé/.test(lancer('basculer.mjs', null, ['status']).out));
const tLong = transcript([LONG]);
verif('hook: silent while off', lancer('verifier.mjs', { transcript_path: tLong }).json === null);
verif('switch: on', /ACTIVÉ/.test(lancer('basculer.mjs', null, ['on']).out) && JSON.parse(fs.readFileSync(ETAT, 'utf8')).actif === true);

// ---- hook while on ----
const r1 = lancer('verifier.mjs', { transcript_path: tLong });
verif('hook: blocks a long answer and asks for the agent', r1.json?.decision === 'block' && /avocat-du-diable/.test(r1.json?.reason || ''), r1.out.slice(0, 80));
verif('hook: gives the agent file as fallback', /agents\/avocat-du-diable\.md/.test(r1.json?.reason || ''));
verif('hook: tells the USER the advocate is on (visible message)', /Avocat du diable activé/.test(r1.json?.systemMessage || '') && /\/avocat off/.test(r1.json?.systemMessage || ''));
verif('hook: final line asked from Claude says it is on', /Avocat du diable activé : X confirmé/.test(r1.json?.reason || ''));
verif('hook: never loops (stop_hook_active)', lancer('verifier.mjs', { transcript_path: tLong, stop_hook_active: true }).json === null);
verif('hook: short answer without action is not checked', lancer('verifier.mjs', { transcript_path: transcript([COURT]) }).json === null);
const tAction = transcript([{ type: 'tool_use', id: 'e1', name: 'Edit', input: {} }, { type: 'text', text: "C'est fait." }]);
verif('hook: short answer AFTER an edit is checked', lancer('verifier.mjs', { transcript_path: tAction }).json?.decision === 'block');
const tFait = transcript([{ type: 'tool_use', id: 'a1', name: 'Agent', input: { subagent_type: 'avocat:avocat-du-diable', description: 'contre-vérif' } }, LONG]);
verif('hook: turn already checked by the agent is let through', lancer('verifier.mjs', { transcript_path: tFait }).json === null);
verif('hook: an earlier turn\'s check does not count', lancer('verifier.mjs', { transcript_path: tLong }).json?.decision === 'block');
verif('hook: last_assistant_message is used when given', lancer('verifier.mjs', { transcript_path: tAction.replace('.jsonl', 'x.jsonl'), last_assistant_message: LONG.text }).json?.decision === 'block');
verif('hook: invalid input, no error', (() => { const r = lancer('verifier.mjs', 'pas du json'); return r.code === 0 && r.json === null && !r.stderr; })());
const rEn = lancer('verifier.mjs', { transcript_path: tLong }, [], { AVOCAT_LANG: 'en' });
verif('hook: English instructions', /Devil's advocate mode is on/.test(rEn.json?.reason || ''));
fs.writeFileSync(ETAT, '{ cassé');
verif('hook: corrupted switch file = off', lancer('verifier.mjs', { transcript_path: tLong }).json === null);
lancer('basculer.mjs', null, ['off']);
verif('switch: off', lancer('verifier.mjs', { transcript_path: tLong }).json === null && /désactivé/.test(lancer('basculer.mjs', null, []).out));

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} passed, ${ko} failed (temporary folder deleted)`);
process.exit(ko ? 1 : 0);
