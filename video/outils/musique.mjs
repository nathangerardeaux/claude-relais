// Background music of the video, synthesized from scratch (no sample, no licence issue): calm electronic
// "focus" mood, 120 BPM, A minor (Am - F - C - G, 2 bars each). 25 bars = 50 s = the final video length
// (rendered at 62.5 s, then sped up x1.25 by ffmpeg: 96 x 1.25 = 120 BPM keeps the scene changes on the beat).
// Arrangement: pad (bars 1-2), + arpeggio (3-6), + bass, kick, hats (7-20), breakdown (21-23), pad (24-25).
// Usage: node outils/musique.mjs  ->  public/musique.wav (then converted to mp3, see README).
//        node outils/musique.mjs --v2  ->  public/musique-v2.wav (56 s, story video, sound effects).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;          // 0.5 s
const BAR = 4 * BEAT;           // 2 s
// --v2 : 28 bars = 56 s for the story video (public/musique-v2.wav), with sound effects on the cuts.
const V2 = process.argv.includes('--v2');
const BARS = V2 ? 28 : 25;
const DUREE = BARS * BAR;       // 50 s
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

// ---- v2 sound effects, in seconds of the story video (times match src/v2/Story.tsx and Fin.tsx).
function pop(t0, f0 = 700, f1 = 180, gain = 0.2) {
  const i0 = Math.round(t0 * SR);
  let phase = 0;
  for (let i = i0; i < Math.min(N, i0 + Math.round(0.25 * SR)); i++) {
    const t = (i - i0) / SR;
    phase += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 28))) / SR;
    const s = Math.sin(phase) * Math.exp(-t * 14) * gain;
    L[i] += s; R[i] += s;
  }
}
function whoosh(t0, dur, gain = 0.12) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  let lp = 0;
  for (let i = i0; i < Math.min(N, i0 + n); i++) {
    const x = (i - i0) / n;
    const env = Math.sin(Math.PI * x) ** 2;
    const k = 0.02 + 0.5 * x; // low-pass opens as the whoosh goes by
    lp += k * (bruit() - lp);
    const pan = x;
    L[i] += lp * env * gain * (1 - pan * 0.6); R[i] += lp * env * gain * (0.4 + pan * 0.6);
  }
}
function suce(t0, dur, gain = 0.07) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  let phase = 0;
  for (let i = i0; i < Math.min(N, i0 + n); i++) {
    const x = (i - i0) / n;
    phase += (2 * Math.PI * (220 * 2 ** (x * 3))) / SR;
    const s = (Math.sin(phase) + 0.4 * Math.sin(phase * 2)) * gain * Math.min(1, x * 8) * (x < 0.97 ? 1 : (1 - x) / 0.03);
    L[i] += s; R[i] += s;
  }
}
function tic(t0, hauteur = 1800, gain = 0.06) {
  const i0 = Math.round(t0 * SR);
  for (let i = i0; i < Math.min(N, i0 + Math.round(0.06 * SR)); i++) {
    const t = (i - i0) / SR;
    const s = Math.sin(2 * Math.PI * hauteur * t) * Math.exp(-t * 80) * gain;
    L[i] += s; R[i] += s;
  }
}
function carillon(t0, notes = [76, 83, 88], gain = 0.07) {
  notes.forEach((n, k) => {
    const i0 = Math.round((t0 + k * 0.09) * SR);
    for (let i = i0; i < Math.min(N, i0 + Math.round(1.2 * SR)); i++) {
      const t = (i - i0) / SR;
      const s = (Math.sin(2 * Math.PI * freq(n) * t) + 0.3 * Math.sin(2 * Math.PI * freq(n) * 2.01 * t)) * Math.exp(-t * 4) * gain;
      L[i] += s * 0.9; R[i] += s;
    }
  });
}

pad();
if (V2) {
  arpege(1, BARS - 2);
  basse(3, BARS - 2);
  rythme(3, BARS - 4);
  for (const t of [6.2, 11.2, 17.2]) pop(t, 900, 400, 0.1); // user messages
  pop(24.5, 600, 160, 0.22);                                  // box appears
  suce(25.0, 2.75);                                           // pages sucked into the box
  pop(28.0, 900, 120, 0.3); carillon(28.0, [72, 79, 84], 0.06); // box closes
  whoosh(31.0, 1.7, 0.16);                                    // /clear curtain
  pop(34.0, 800, 200, 0.22); carillon(34.0);                  // box opens
  for (let i = 0; i < 6; i++) tic(37.4 + i * 0.55);           // tests passing
  carillon(40.9, [79, 84, 88, 91], 0.07);                     // task done
  whoosh(45.5, 0.9, 0.14);                                    // iris to the ending
  pop(46.7, 700, 180, 0.15);
} else {
  arpege(2, 23);
  basse(6, 23);
  rythme(6, 20);
}

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
const sortie = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', V2 ? 'musique-v2.wav' : 'musique.wav');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, buf);
console.log(`${sortie} : ${DUREE} s, crête ${crete.toFixed(3)} avant normalisation`);
