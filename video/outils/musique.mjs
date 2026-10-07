// Background music of the video, synthesized from scratch (no sample, no licence issue): calm electronic
// "focus" mood, 96 BPM, A minor (Am - F - C - G, 2 bars each). 25 bars = 62.5 s = the video length.
// Arrangement: pad (bars 1-2), + arpeggio (3-6), + bass, kick, hats (7-20), breakdown (21-23), pad (24-25).
// Usage: node outils/musique.mjs  ->  public/musique.wav (then converted to mp3, see README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BPM = 96;
const BEAT = 60 / BPM;          // 0.625 s
const BAR = 4 * BEAT;           // 2.5 s
const BARS = 25;
const DUREE = BARS * BAR;       // 62.5 s
const N = Math.round(DUREE * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
// Chords (MIDI notes) and their bass roots: Am, F, C, G.
const ACCORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]];
const BASSES = [33, 29, 36, 31];
const accordDe = (bar) => Math.floor(bar / 2) % 4;

// Deterministic noise (same file every run).
let graine = 12345;
const bruit = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x3fffffff - 1; };

// ---- Pad: additive saw-like tones, 3 detuned voices, slow crossfade between chords.
function pad() {
  for (let bar = 0; bar < BARS; bar += 2) {
    const notes = ACCORDS[accordDe(bar)];
    const t0 = bar * BAR, t1 = Math.min(DUREE, (bar + 2) * BAR);
    const a = 0.8, rel = 1.2;
    const i0 = Math.round(t0 * SR), i1 = Math.min(N, Math.round((t1 + rel) * SR));
    for (const n of notes) {
      for (const det of [-0.07, 0, 0.07]) {
        const f = freq(n + det);
        const pan = 0.5 + det * 4;
        for (let i = i0; i < i1; i++) {
          const t = i / SR - t0;
          const env = Math.min(1, t / a) * (i / SR > t1 ? Math.max(0, 1 - (i / SR - t1) / rel) : 1);
          if (env <= 0) continue;
          let s = 0;
          for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t + h) / h ** 1.6;
          s *= env * 0.018;
          L[i] += s * (1 - pan * 0.5); R[i] += s * (0.5 + pan * 0.5);
        }
      }
    }
  }
}

// ---- Plucked arpeggio (eighth notes over the chord, 2 octaves up), dotted-eighth echo.
function arpege(debutBar, finBar) {
  const croche = BEAT / 2;
  for (let bar = debutBar; bar < finBar; bar++) {
    const notes = ACCORDS[accordDe(bar)];
    const motif = [0, 1, 2, 3, 2, 1, 3, 2];
    for (let k = 0; k < 8; k++) {
      const t0 = bar * BAR + k * croche;
      const f = freq(notes[motif[k]] + 12);
      const i0 = Math.round(t0 * SR), i1 = Math.min(N, i0 + Math.round(0.5 * SR));
      const pan = k % 2 ? 0.7 : 0.3;
      for (const [retard, gain] of [[0, 1], [0.75 * BEAT, 0.35], [1.5 * BEAT, 0.12]]) {
        const d = Math.round(retard * SR);
        const p = retard ? 1 - pan : pan;
        for (let i = i0; i < i1 && i + d < N; i++) {
          const t = (i - i0) / SR;
          const s = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 9) * 0.05 * gain;
          L[i + d] += s * (1 - p); R[i + d] += s * p;
        }
      }
    }
  }
}

// ---- Bass: root on every beat, short and round.
function basse(debutBar, finBar) {
  for (let bar = debutBar; bar < finBar; bar++) {
    const f = freq(BASSES[accordDe(bar)]);
    for (let b = 0; b < 4; b++) {
      const i0 = Math.round((bar * BAR + b * BEAT) * SR), i1 = Math.min(N, i0 + Math.round(BEAT * 0.9 * SR));
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR;
        const s = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 80) * Math.exp(-t * 3) * 0.16;
        L[i] += s; R[i] += s;
      }
    }
  }
}

// ---- Soft kick (four on the floor) and off-beat hats.
function rythme(debutBar, finBar) {
  for (let bar = debutBar; bar < finBar; bar++) {
    for (let b = 0; b < 4; b++) {
      const i0 = Math.round((bar * BAR + b * BEAT) * SR);
      let phase = 0;
      for (let i = i0; i < Math.min(N, i0 + Math.round(0.35 * SR)); i++) {
        const t = (i - i0) / SR;
        phase += (2 * Math.PI * (45 + 75 * Math.exp(-t * 30))) / SR;
        const s = Math.sin(phase) * Math.exp(-t * 9) * 0.22;
        L[i] += s; R[i] += s;
      }
      const h0 = Math.round((bar * BAR + (b + 0.5) * BEAT) * SR);
      let avant = 0;
      for (let i = h0; i < Math.min(N, h0 + Math.round(0.06 * SR)); i++) {
        const t = (i - h0) / SR;
        const x = bruit();
        const s = (x - avant) * Math.exp(-t * 70) * 0.03; // difference = crude high-pass
        avant = x;
        L[i] += s * 0.8; R[i] += s;
      }
    }
  }
}

pad();
arpege(2, 23);
basse(6, 23);
rythme(6, 20);

// Master: fade in 1.5 s, fade out 4 s, normalise to -1 dBFS.
let crete = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = Math.min(1, t / 1.5) * Math.min(1, (DUREE - t) / 4);
  L[i] *= g; R[i] *= g;
  crete = Math.max(crete, Math.abs(L[i]), Math.abs(R[i]));
}
const k = 0.89 / crete;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * k)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * k)) * 32767), 46 + i * 4);
}
const sortie = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'musique.wav');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, buf);
console.log(`${sortie} : ${DUREE} s, crête ${crete.toFixed(3)} avant normalisation`);
