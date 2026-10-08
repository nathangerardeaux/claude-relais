// Estimates, on your REAL past conversations, how many re-read tokens the relay would have saved:
// as soon as the context goes over the threshold and you send a message, the simulation restarts from
// a fresh session (your measured baseline: instructions + project notes + the relay). It counts tokens
// RE-READ from cache, not dollars (prices depend on the model). Read-only: nothing is modified.
//
// Usage:
//   node simuler-economie.mjs --top [n=5]                     your n heaviest conversations
//   node simuler-economie.mjs <log.jsonl> [threshold_k=150] [baseline_k=auto]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { langue, dossierClaude } from './commun.mjs';

const FR = langue() === 'fr';
const M = (n) => `${(n / 1e6).toFixed(0)} M`;
const ctxDe = (u) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);

// Baseline of a fresh session = context of the FIRST response of your conversations (median).
function socleMesure(fichiers) {
  const v = [];
  for (const f of fichiers) {
    const fd = fs.openSync(f, 'r');
    const buf = Buffer.alloc(Math.min(4 << 20, fs.statSync(f).size));
    fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    for (const l of buf.toString('utf8').split('\n')) {
      if (!l.includes('"usage"')) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.type === 'assistant' && o.message?.usage) { v.push(ctxDe(o.message.usage)); break; }
    }
  }
  v.sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 40000;
}

async function simuler(file, seuil, socle) {
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  const pas = [];
  for await (const line of rl) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'assistant' && o.message?.usage) pas.push({ ctx: ctxDe(o.message.usage) });
    else if (o.type === 'user') {
      const c = o.message?.content;
      if (Array.isArray(c) && c.every((x) => x.type === 'tool_result')) continue;
      const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : '';
      if (/task-notification|^\s*<(system-reminder|local-command|command-name)/.test(txt) || o.isMeta) continue;
      pas.push({ humain: true }); // a moment where you could have typed /relais
    }
  }
  let reel = 0, simule = 0, relais = 0, base = null, dernier = 0, demande = false, n = 0;
  for (const p of pas) {
    if (p.humain) { if (dernier - (base ?? 0) + socle > seuil) demande = true; continue; }
    n++; reel += p.ctx;
    if (base === null || p.ctx < base) base = Math.max(0, p.ctx - socle); // original compaction: re-anchor
    if (demande) { base = Math.max(0, p.ctx - socle); relais++; demande = false; }
    simule += Math.max(socle, p.ctx - base);
    dernier = p.ctx;
  }
  return { n, reel, simule, relais };
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log(FR ? 'Usage : node simuler-economie.mjs --top [n]   ou   node simuler-economie.mjs <journal.jsonl> [seuil_k] [socle_k]'
    : 'Usage: node simuler-economie.mjs --top [n]   or   node simuler-economie.mjs <log.jsonl> [threshold_k] [baseline_k]');
  process.exit(0);
}

let fichiers, seuil = 150000, socle;
if (args[0] === '--top') {
  const racine = path.join(dossierClaude(), 'projects');
  const tous = fs.existsSync(racine) ? fs.readdirSync(racine).flatMap((d) => {
    const dd = path.join(racine, d);
    try { return fs.readdirSync(dd).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dd, f)); } catch { return []; }
  }) : [];
  if (!tous.length) { console.log(FR ? `Aucune conversation trouvée dans ${racine}.` : `No conversation found in ${racine}.`); process.exit(0); }
  tous.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  fichiers = tous.slice(0, Number(args[1] || 5));
  socle = socleMesure(tous.slice(0, 60));
} else {
  fichiers = [args[0]];
  seuil = Number(args[1] || 150) * 1000;
  socle = args[2] ? Number(args[2]) * 1000 : socleMesure([args[0]]);
}

console.log(FR ? `Seuil du relais : ${seuil / 1000}k | session neuve mesurée : ~${Math.round(socle / 1000)}k`
  : `Relay threshold: ${seuil / 1000}k | measured fresh session: ~${Math.round(socle / 1000)}k`);
let totReel = 0, totSim = 0;
for (const f of fichiers) {
  const r = await simuler(f, seuil, socle);
  if (!r.n) continue;
  totReel += r.reel; totSim += r.simule;
  const eco = (100 * (1 - r.simule / r.reel)).toFixed(0);
  console.log(FR
    ? `- ${path.basename(f).slice(0, 8)} : ${r.n} réponses, ${Math.round(r.reel / r.n / 1000)}k relus par action en moyenne | ${M(r.reel)} → ${M(r.simule)} (${r.relais} relais) : -${eco} %`
    : `- ${path.basename(f).slice(0, 8)}: ${r.n} responses, ${Math.round(r.reel / r.n / 1000)}k re-read per action on average | ${M(r.reel)} → ${M(r.simule)} (${r.relais} relays): -${eco}%`);
}
if (fichiers.length > 1 && totReel) {
  const eco = (100 * (1 - totSim / totReel)).toFixed(0);
  console.log(FR ? `Total : ${M(totReel)} → ${M(totSim)} tokens relus, soit -${eco} %` : `Total: ${M(totReel)} → ${M(totSim)} re-read tokens, i.e. -${eco}%`);
}
