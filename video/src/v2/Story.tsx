import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { Comparaison } from "./Fin";
import { Robot } from "./Robot";
import type { Mood } from "./Robot";
import { Bang, Bit, BoxRelais, Bulle, Burst, Carte, Chaine, Hud, Kinetic, Message, Slab, SLAB_H, SLAB_W, Terminal, parseMots } from "./Parts";
import { CL, DOUX, FPS, INOUT, clamp, keys, lerp, pop, prog, rnd, V } from "./util";

// ------------------------------------------------------------------ world layout (1920 x 1080 at zoom 1)
const FLOOR = 880;
const HOME = 480;
const READ = 1150;
const STACK_X = 1420;
const PITCH = 23;
const PALLET = 16;
const BOX2 = 900;
const BOX3 = 640;
const TERM_X = 1120;
const SWAP = 31.85; // instant when the /clear curtain covers the whole screen
const slabY = (i: number) => FLOOR - PALLET - SLAB_H / 2 - i * PITCH;
const HEAD_Y = FLOOR - 197;

// ------------------------------------------------------------------ the three turns without relais
type Tour = { start: number; msg: string; ans: string; n: number; tok: number; run: number; per: number; speed: number };
const BASE: Tour[] = [
  { start: 6.0, msg: "Ajoute la page de connexion", ans: "Fait", n: 5, tok: 12, run: 0.7, per: 0.3, speed: 0.55 },
  { start: 11.0, msg: "Corrige le bug du panier", ans: "Corrigé", n: 12, tok: 60, run: 0.8, per: 0.2, speed: 0.42 },
  { start: 17.0, msg: "Écris les tests", ans: "", n: 26, tok: 191, run: 1.3, per: 0.16, speed: 0.28 },
];
const TURNS = BASE.map((k) => {
  const runStart = k.start + 1.1;
  const scanStart = runStart + k.run + 0.1;
  const scanEnd = scanStart + k.n * k.per;
  const backStart = scanEnd + 0.1;
  const backEnd = backStart + k.run;
  return { ...k, runStart, scanStart, scanEnd, backStart, backEnd, growStart: backEnd + 0.2 };
});

const birth = (i: number) => (i < 5 ? 2.6 + i * 0.12 : i < 12 ? TURNS[0].growStart + (i - 5) * 0.09 : TURNS[1].growStart + (i - 12) * 0.06);
const LAUNCH0 = 25.0;
const launch = (i: number) => LAUNCH0 + (25 - i) * 0.08;
const FLIGHT = 0.75;
const MOUTH_Y = FLOOR - PALLET - 124;

// ------------------------------------------------------------------ robot path
type Seg = { t0: number; t1: number; x0: number; x1: number; dir: number; speed: number };
const SEGS: Seg[] = [
  ...TURNS.flatMap((k, i) => {
    const out: Seg[] = [{ t0: k.runStart, t1: k.runStart + k.run, x0: HOME, x1: READ, dir: 1, speed: k.speed }];
    if (i < 2) out.push({ t0: k.backStart, t1: k.backEnd, x0: READ, x1: HOME, dir: -1, speed: k.speed });
    return out;
  }),
  { t0: 32.6, t1: 33.5, x0: -150, x1: 430, dir: 1, speed: 0.55 },
  { t0: 36.2, t1: 36.9, x0: 430, x1: 980, dir: 1, speed: 0.55 },
];
const easeWalk = Easing.inOut(Easing.quad);
const robotAt = (t: number) => {
  let x = HOME;
  let dir = 1;
  let walking = false;
  let speed = 0.4;
  for (const s of SEGS) {
    if (t < s.t0) break;
    dir = s.dir;
    if (t >= s.t1) x = s.x1;
    else {
      x = lerp(s.x0, s.x1, easeWalk((t - s.t0) / (s.t1 - s.t0)));
      walking = true;
      speed = s.speed;
    }
  }
  if (t >= 24.1 && t < 32) dir = -1;
  return { x, dir, walking, speed };
};
const dirSmooth = (t: number) => {
  let s = 0;
  for (let k = 0; k < 4; k++) s += robotAt(t - k / FPS).dir;
  return s / 4;
};

const JUMPS = [
  { t: 0.3, h: 90, d: 0.7 },
  ...TURNS.map((k, i) => ({ t: k.start + 0.9, h: 30 - i * 3, d: 0.38 })),
  { t: 28.0, h: 70, d: 0.6 },
  { t: 36.0, h: 44, d: 0.5 },
  { t: 40.9, h: 80, d: 0.7 },
];
const jumpFx = (t: number) => {
  let lift = 0;
  let sq = 1;
  for (const j of JUMPS) {
    const q = (t - j.t) / j.d;
    if (q >= 0 && q <= 1) {
      lift += j.h * 4 * q * (1 - q);
      sq = Math.min(sq, 1.07);
    } else if (t >= j.t - 0.12 && t < j.t) sq = Math.min(sq, 1 - 0.14 * ((t - (j.t - 0.12)) / 0.12));
    else if (q > 1 && t < j.t + j.d + 0.2) sq = Math.min(sq, 0.86 + 0.14 * ((t - j.t - j.d) / 0.2));
  }
  return { lift, sq };
};

// ------------------------------------------------------------------ captions (bottom lane)
const LEGENDES: { t0: number; t1: number; texte: string }[] = [
  { t0: 7.2, t1: 10.8, texte: "Chaque réponse : il relit *TOUT*." },
  { t0: 12.3, t1: 16.5, texte: "La pile grossit. La relecture aussi." },
  { t0: 19.6, t1: 23.8, texte: "*191k* tokens relus, à chaque appel." },
  { t0: 24.3, t1: 27.8, texte: "Il écrit un *relais* : l'essentiel." },
  { t0: 28.3, t1: 30.2, texte: "Tout tient en *~3k* tokens." },
  { t0: 33.0, t1: 35.9, texte: "Session neuve : il lit juste *le_relais*." },
  { t0: 36.5, t1: 41.0, texte: "Et il reprend *là_où_il_en_était*." },
  { t0: 41.8, t1: 46.0, texte: "*~60_fois* moins relu à chaque appel." },
];

// ------------------------------------------------------------------ the story: intro, without relais, relais, with relais, comparison
export const Monde: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const fresh = t >= SWAP;

  // ---- camera
  const camPts = (ix: 1 | 2 | 3): [number, number][] => {
    const P: [number, number, number, number][] = [
      [0, 960, 540, 1],
      [5.6, 1010, 545, 1.05],
      [6.2, 960, 540, 1],
      [7.0, 960, 540, 1],
      [7.9, 1130, 560, 1.12],
      [9.5, 1130, 560, 1.12],
      [10.3, 960, 540, 1],
      [12.1, 960, 540, 1],
      [13.0, 1170, 570, 1.16],
      [15.5, 1170, 570, 1.16],
      [16.4, 960, 540, 1],
      [18.1, 1000, 540, 1],
      [19.5, 1280, 600, 1.3],
      [23.7, 1280, 600, 1.3],
      [24.8, 1100, 540, 0.98],
      [27.6, 1100, 540, 0.98],
      [28.05, 900, 690, 1.3],
      [29.3, 900, 640, 1.1],
      [30.5, 960, 540, 1],
      [31.8, 600, 600, 1],
      [33.4, 600, 620, 1],
      [34.0, 600, 650, 1.35],
      [35.9, 600, 650, 1.35],
      [36.3, 700, 640, 1.15],
      [36.9, 1050, 620, 1.1],
      [41.0, 1050, 620, 1.1],
      [41.5, 960, 540, 1],
    ];
    return P.map((p) => [p[0], p[ix]]);
  };
  const cx = keys(f, camPts(1));
  const cy = keys(f, camPts(2));
  const z = keys(f, camPts(3));

  // ---- robot state
  const rb = robotAt(t);
  const dir = dirSmooth(t);
  const jf = jumpFx(t);
  const tired = keys(f, [[6, 0], [9.4, 0.15], [13, 0.15], [15.4, 0.5], [19.5, 0.5], [23.6, 1], [24.1, 1], [25.0, 0.1], [32, 0.1], [32.6, 0]], (x) => x);
  const heat = keys(f, [[12.9, 0], [15.4, 0.3], [17.5, 0.05], [19.5, 0.05], [23.6, 1], [24.2, 1], [25.2, 0]], (x) => x);
  const robotOn = !(fresh && t < 32.6);
  const rScale = pop(f, 0.3, { damping: 9, stiffness: 150, mass: 0.8 });

  // current scan
  const sIdx = TURNS.findIndex((k) => t >= k.scanStart - 0.15 && t < k.scanEnd + 0.45);
  const sk = sIdx >= 0 ? TURNS[sIdx] : null;
  const m = sk ? clamp((t - sk.scanStart) / sk.per, 0, sk.n) : 0;
  const scanning = sk !== null && t >= sk.scanStart - 0.15 && t < sk.scanEnd + 0.2;

  // arms, eyes, mood
  const idleA = 10 - tired * 6 + Math.sin(f / 18) * 4;
  let armL = idleA;
  let armR = idleA + Math.sin(f / 18 + 1) * 2;
  let look: [number, number] = [0.25, 0];
  let mood: Mood = "normal";
  const phase = f * rb.speed;
  if (rb.walking) {
    armL = 18 + Math.sin(phase) * 24;
    armR = 18 - Math.sin(phase) * 24;
    look = [0.6, 0];
  }
  if (t >= 0.8 && t < 2.4) {
    armR = 135 + Math.sin(f * 0.55) * 25;
    mood = "happy";
  }
  if (t >= 2.6 && t < 5.8) look = [0.8, 0.3];
  if (scanning && sk) {
    const sy = slabY(Math.min(sk.n - 1, Math.floor(m)));
    const ang = (Math.atan2(STACK_X - SLAB_W / 2 - (rb.x + 52), sy - (FLOOR - 114)) * 180) / Math.PI;
    armR = ang + Math.sin(f * 0.9) * 4;
    armL = 28;
    look = [0.9, clamp((sy - HEAD_Y) / 220, -1, 1)];
  }
  if (jf.lift > 2) {
    armL = 135 + Math.sin(f * 0.6) * 12;
    armR = 135 - Math.sin(f * 0.6) * 12;
  }
  if (t >= 24.1 && t < 28.0) {
    armR = 95;
    armL = 20;
    look = [0.8, -0.2];
  }
  if (t >= 28.0 && t < 30.2) {
    armL = 150 + Math.sin(f * 0.5) * 12;
    armR = 150 - Math.sin(f * 0.5) * 12;
    mood = "happy";
  }
  if (t >= 34.0 && t < 36.0) {
    armR = 40;
    armL = 15;
    look = [0.7, -0.7];
  }
  if (t >= 37.3 && t < 40.9) {
    armR = 55 + Math.sin(f * 1.4) * 16;
    armL = 55 - Math.sin(f * 1.4) * 16;
    look = [0.8, 0.2];
  }
  if (t >= 40.9) {
    armL = 150 + Math.sin(f * 0.5) * 12;
    armR = 150 - Math.sin(f * 0.5) * 12;
  }
  if (t >= 35.9) mood = "happy";
  if (TURNS.some((k) => t >= k.start + 0.9 && t < k.start + 1.4)) mood = "surprised";
  const bulb = keys(f, [[35.9, 0], [36.0, 1], [36.9, 1], [37.3, 0]], (x) => x);

  // ---- HUD value
  let kilo = 0;
  if (t < 24) {
    const k = [...TURNS].reverse().find((tt) => t >= tt.start + 1.0);
    if (k) kilo = k.tok * clamp((t - k.scanStart) / (k.n * k.per));
  } else if (!fresh) kilo = lerp(191, 3, prog(f, 25.7, 27.9, Easing.inOut(Easing.quad)) );
  else kilo = 3 * prog(f, 34.8, 35.9, DOUX);
  let bump = scanning ? 1 - (m % 1) : 0;
  const callTimes = [0, 1, 2, 3, 4, 5].map((i) => 37.4 + i * 0.55);
  for (const ct of callTimes) {
    const dt = t - (ct + 0.2);
    if (dt >= 0 && dt < 0.4) bump = Math.max(bump, Math.exp(-dt * 10));
  }

  // ---- box (act 2 and 3)
  const boxX = fresh ? BOX3 : BOX2;
  let pulse = 0;
  for (let i = 0; i < 26; i++) {
    const dt = t - (launch(i) + FLIGHT);
    if (dt >= 0 && dt < 0.4) pulse += Math.exp(-dt * 14) * 0.05;
  }
  const boxVisible = t >= 24.5;
  const boxPop = fresh ? 1 : pop(f, 24.5, { damping: 8, stiffness: 160, mass: 0.8 });
  const boxOpen = fresh ? (t >= 34.0 ? pop(f, 34.0, { damping: 7, stiffness: 200, mass: 0.6 }) : 0) : t < 28.0 ? pop(f, 24.6, { damping: 9, stiffness: 180, mass: 0.7 }) : 1 - pop(f, 28.0, { damping: 12, stiffness: 240, mass: 0.6 });
  const labelK = !fresh && t >= 28.0 ? 1 + 0.35 * (1 - pop(f, 28.05, { damping: 8, stiffness: 260, mass: 0.6 })) : 1;
  const boxGlow = fresh ? clamp(boxOpen) * 0.6 : prog(f, 25.7, 27.9) * 0.7 + Math.max(0, 1 - prog(f, 28.0, 29.0)) * 0.5;

  // card
  const rise = pop(f, 34.15, { damping: 12, stiffness: 120, mass: 0.9 });
  const shrink = prog(f, 36.0, 36.6, DOUX);
  const carteY = lerp(lerp(MOUTH_Y, 540, rise), MOUTH_Y, shrink);
  const carteS = lerp(0.2, 0.88, rise) * lerp(1, 0.15, shrink);
  const checks = Math.min(4, Math.floor(prog(f, 34.8, 35.9) * 4.01));

  // terminal
  const shown = prog(f, 37.4, 37.4 + 6 * 0.55, (x) => x) * 6;
  const termS = pop(f, 37.0, { damping: 12, stiffness: 150, mass: 0.8 });
  const fini = prog(f, 40.7, 41.0);

  // ---- vignette and wipe
  const stress = fresh ? 0 : heat * 0.5 + (t > 24 ? 0 : 0);
  const curtainX = interpolate(f, [31.0 * FPS, 32.7 * FPS], [-3500, 1950], { ...CL, easing: INOUT });

  // ---- logo (big title, then corner)
  const logoP = keys(f, [[2.3, 0], [3.0, 1]], DOUX);
  const logoX = lerp(960, 1745, logoP);
  const logoY = lerp(400, 78, logoP);
  const logoS = lerp(1, 0.25, logoP);
  const barW = interpolate(f, [0.7 * FPS, 1.6 * FPS], [0, 560], { ...CL, easing: DOUX }) * (1 - prog(f, 2.2, 2.6));

  // ---- dust puffs under running feet
  const dust: React.ReactNode[] = [];
  for (let j = 0; j < 7; j++) {
    const ts = Math.floor(f / 3) * 3 - j * 3;
    const age = f - ts;
    const tt = ts / FPS;
    const seg = SEGS.find((s) => tt >= s.t0 && tt < s.t1);
    if (!seg || age > 20) continue;
    const r = robotAt(tt);
    dust.push(
      <div
        key={j}
        style={{
          position: "absolute",
          left: r.x - r.dir * 26 - (10 + age * 1.3),
          top: FLOOR - 8 - age * 1.2 - (10 + age * 1.3),
          width: 2 * (10 + age * 1.3),
          height: 2 * (10 + age * 1.3),
          borderRadius: "50%",
          background: "rgba(210,205,190,0.28)",
          opacity: 1 - age / 20,
        }}
      />,
    );
  }

  // ---- flying pages (read pages into the head, one stream per scan)
  const bits: React.ReactNode[] = [];
  TURNS.forEach((k, ki) => {
    for (let i = 0; i < k.n; i++) {
      const tf = k.scanStart + i * k.per;
      const q = (t - tf) / 0.4;
      if (q < 0 || q > 1) continue;
      const sx = STACK_X - SLAB_W / 2 - 46;
      const sy = slabY(i);
      const ex = rb.x + 22;
      const e = Easing.in(Easing.quad)(q);
      bits.push(<Bit key={`${ki}-${i}`} x={lerp(sx, ex, e)} y={lerp(sy, HEAD_Y, e) - Math.sin(q * Math.PI) * 50} rot={q * 360 * (i % 2 ? 1 : -1)} s={lerp(1, 0.5, q)} opacity={1 - Math.max(0, q - 0.8) * 5} />);
    }
  });
  callTimes.forEach((ct, i) => {
    const q = (t - (ct - 0.1)) / 0.4;
    if (q < 0 || q > 1) return;
    const e = Easing.inOut(Easing.quad)(q);
    bits.push(<Bit key={`c${i}`} x={lerp(BOX3, rb.x + 24, e)} y={lerp(MOUTH_Y, HEAD_Y, e) - Math.sin(q * Math.PI) * 70} rot={q * 200} s={0.7} color="#cfe3ff" opacity={1 - Math.max(0, q - 0.8) * 5} />);
  });

  // ---- slabs
  const slabs: React.ReactNode[] = [];
  const e1 = Easing.bezier(0.55, 0, 0.3, 1);
  const flightPos = (i: number, tt: number) => {
    const q = e1(clamp((tt - launch(i)) / FLIGHT));
    const p0x = STACK_X + 14;
    const p0y = slabY(i);
    const p1x = 1190;
    const p1y = Math.min(p0y, MOUTH_Y) - 300;
    const x = (1 - q) * (1 - q) * p0x + 2 * (1 - q) * q * p1x + q * q * BOX2;
    const y = (1 - q) * (1 - q) * p0y + 2 * (1 - q) * q * p1y + q * q * MOUTH_Y;
    return { x, y, q };
  };
  if (!fresh) {
    for (let i = 0; i < 26; i++) {
      if (t < birth(i)) continue;
      const l = launch(i);
      const land = l + FLIGHT;
      if (t >= land) continue;
      if (t >= l) {
        const { x, y, q } = flightPos(i, t);
        const dirRot = i % 2 ? 1 : -1;
        for (const lag of [6, 4, 2]) {
          if (t - lag / FPS < l) continue;
          const g = flightPos(i, t - lag / FPS);
          slabs.push(<Slab key={`g${i}-${lag}`} i={i} x={g.x} y={g.y} s={lerp(1, 0.25, Math.pow(g.q, 0.8))} rot={g.q * 320 * dirRot} opacity={0.4 - lag * 0.05} glow={1} tint={1} />);
        }
        slabs.push(<Slab key={i} i={i} x={x} y={y} s={lerp(1, 0.25, Math.pow(q, 0.8))} rot={q * 320 * dirRot} opacity={1 - prog(q, 0.9, 1)} glow={0.9} tint={0.6} />);
        continue;
      }
      // growth drop
      const b = pop(f, birth(i), { damping: 12, stiffness: 190, mass: 0.7 });
      let dx = 0;
      let glow = 0;
      let tint = 0;
      let s = 1;
      if (sk && i < sk.n && t >= sk.scanStart && t < sk.scanEnd + 0.5) {
        const d = m - i;
        const fade = t > sk.scanEnd ? 1 - (t - sk.scanEnd) / 0.5 : 1;
        const bp = d < 0 ? 0 : d < 1.6 ? Math.sin((Math.PI * d) / 1.6) : 0;
        dx = -44 * bp;
        glow = bp;
        tint = bp * 0.8 + (d >= 1.6 ? 0.4 * fade : 0);
      }
      const a = prog(f, l - 0.12, l);
      if (a > 0) {
        dx += 14 * a;
        glow = Math.max(glow, a);
        tint = Math.max(tint, a * 0.6);
        s = 1 + 0.06 * a;
      }
      slabs.push(<Slab key={i} i={i} x={STACK_X + dx} y={slabY(i) - (1 - b) * 170} s={s} opacity={clamp(b * 3)} glow={glow} tint={tint} />);
    }
  }

  // ---- caption bubbles and sparks positions
  const pulseSq = clamp(pulse, 0, 0.2);
  const answerTurns = TURNS.slice(0, 2);

  return (
    <AbsoluteFill style={{ background: fresh ? "#0f1613" : C.fond, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
      {/* world */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${960 - cx * z}px, ${540 - cy * z}px) scale(${z})` }}>
        <div
          style={{
            position: "absolute",
            left: -1500,
            top: -900,
            width: 5000,
            height: 3000,
            backgroundImage: `radial-gradient(circle, ${fresh ? "#243a2f" : "#2a2a27"} 2.5px, transparent 3px)`,
            backgroundSize: "64px 64px",
            backgroundPosition: `${-(f * 0.4) % 64}px 0px`,
          }}
        />
        {fresh && <div style={{ position: "absolute", left: -200, top: 100, width: 2400, height: 1000, background: "radial-gradient(ellipse at center, rgba(61,220,90,0.12), transparent 65%)" }} />}
        <div style={{ position: "absolute", left: -1500, top: FLOOR, width: 5000, height: 1500, background: fresh ? V.solFrais : V.sol, borderTop: `4px solid ${fresh ? "rgba(61,220,90,0.55)" : C.bord}` }} />

        {!fresh && (
          <>
            <div style={{ position: "absolute", left: STACK_X - SLAB_W / 2 - 16, top: FLOOR - PALLET, width: SLAB_W + 32, height: PALLET, background: "#5b4636", borderRadius: 4, boxShadow: "inset 0 -4px 0 #3f2f24" }} />
            {slabs}
          </>
        )}

        {boxVisible && t < 46.5 && (
          <>
            {fresh && boxOpen > 0.05 && rise < 0.9 && (
              <div style={{ position: "absolute", left: BOX3 - 120, top: MOUTH_Y - 380, width: 240, height: 380, background: "linear-gradient(to top, rgba(160,205,255,0.7), transparent)", clipPath: "polygon(35% 100%, 65% 100%, 100% 0, 0 0)", opacity: clamp(boxOpen) * 0.8 }} />
            )}
            <BoxRelais x={boxX} y={FLOOR} open={boxOpen} squash={1 - pulseSq} glow={boxGlow} label={labelK} scale={boxPop} />
          </>
        )}
        {fresh && t >= 34.1 && <Carte x={BOX3 + 40} y={carteY} scale={carteS} checks={checks} opacity={clamp(rise * 2) * (1 - prog(f, 36.4, 36.6))} />}
        {fresh && t >= 37.0 && <Terminal x={TERM_X} y={FLOOR - 440} shown={shown} scale={termS} fini={fini} />}

        {dust}
        {robotOn && (
          <Robot
            x={rb.x}
            y={FLOOR}
            scale={rScale}
            dir={dir}
            walk={rb.walking}
            speed={rb.speed}
            tired={tired}
            heat={heat}
            look={look}
            mood={mood}
            armL={armL}
            armR={armR}
            squash={jf.sq}
            lift={jf.lift}
            bulb={bulb}
          />
        )}
        {bits}

        {/* speech */}
        {TURNS.map((k, i) => (
          <Bang key={`b${i}`} x={HOME} y={600} t0={k.start + 0.9} t1={k.start + 1.5} />
        ))}
        {answerTurns.map((k, i) => (
          <Bulle key={`a${i}`} x={HOME} y={575} texte={`${k.ans} ✓`} t0={k.backEnd + 0.05} t1={k.backEnd + 1.1} fond={C.carte} bord={V.corail} />
        ))}
        {t >= 38.5 && t < 41.3 && <Bulle x={rb.x - 40} y={FLOOR - 310} texte="Je reprends !" t0={37.2} t1={39.6} fond={C.carte} bord={V.corail} />}
        {t >= 40.9 && <Bulle x={rb.x} y={575} texte="Terminé ✓" t0={40.95} t1={41.4} fond={V.vertClair} couleurTexte="#0d2a0d" />}

        {/* particles */}
        {Array.from({ length: 26 }).map((_, i) => {
          const land = launch(i) + FLIGHT;
          return !fresh && i % 2 === 0 ? <Burst key={`p${i}`} cx={BOX2} cy={MOUTH_Y} t0={land} count={5} colors={["#fff", C.accent, V.bleuClair]} speed={7} life={16} size={5} angle={-90} spread={150} seed={i} /> : null;
        })}
        {!fresh && <Burst cx={BOX2} cy={MOUTH_Y + 20} t0={28.0} count={34} colors={["#fff", C.accent, V.bleuClair, V.corailClair, V.jaune]} speed={16} life={38} size={9} angle={-90} spread={220} gravity={0.35} seed={99} />}
        {!fresh && t >= 28.0 && t < 28.8 && (
          <div style={{ position: "absolute", left: BOX2 - 220 * prog(f, 28.0, 28.6, DOUX), top: MOUTH_Y + 40 - 220 * prog(f, 28.0, 28.6, DOUX), width: 440 * prog(f, 28.0, 28.6, DOUX), height: 440 * prog(f, 28.0, 28.6, DOUX), borderRadius: "50%", border: `8px solid ${V.bleuClair}`, opacity: 1 - prog(f, 28.1, 28.7) }} />
        )}
        {fresh && <Burst cx={BOX3} cy={MOUTH_Y} t0={34.0} count={30} colors={["#fff", C.accent, V.bleuClair, V.jaune]} speed={15} life={36} size={8} angle={-90} spread={160} gravity={0.3} seed={7} />}
        {fresh && <Burst cx={rb.x} cy={FLOOR - 400} t0={40.9} count={40} colors={[V.vertClair, V.jaune, "#fff", V.corailClair, C.accent]} speed={16} life={44} size={9} angle={-90} spread={300} gravity={0.4} seed={21} />}
        {fresh && <Burst cx={1500} cy={640} t0={40.75} count={26} colors={[V.vertClair, "#fff", V.jaune]} speed={13} life={34} size={7} angle={-90} spread={200} gravity={0.35} seed={5} />}
      </div>

      {TURNS.map((k, i) => (
        <Message key={`m${i}`} texte={k.msg} t0={k.start + 0.2} t1={i < 2 ? k.backEnd + 0.6 : 23.9} />
      ))}

      {/* red stress vignette */}
      {stress > 0.01 && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at center, transparent 45%, rgba(208,59,59,${stress * (0.55 + 0.25 * Math.sin(f / 4))}) 100%)`, pointerEvents: "none" }} />}

      {/* HUD */}
      {t >= 5.6 && <Hud kilo={kilo} avec={fresh} relais={!fresh && t >= 24.3} bump={bump} t0={5.8} opacity={1 - prog(f, 41.2, 41.6)} />}
      <Chaine opacity={1 - prog(f, 41.2, 41.6)} />

      {/* title / logo */}
      <div style={{ position: "absolute", left: logoX, top: logoY, translate: "-50% -50%", scale: logoS, fontSize: 230, fontWeight: 800, letterSpacing: -6, display: "flex", whiteSpace: "nowrap", opacity: 1 }}>
        {"relais.".split("").map((ch, i) => {
          const p = pop(f, 0.25 + i * 0.07, { damping: 9, stiffness: 190, mass: 0.7 });
          return (
            <span key={i} style={{ display: "inline-block", color: i === 6 ? C.accent : "#fff", translate: `0 ${(1 - p) * 120}px`, opacity: clamp(p * 3), rotate: `${(1 - p) * (i % 2 ? 12 : -12)}deg`, scale: 0.6 + 0.4 * p }}>
              {ch}
            </span>
          );
        })}
      </div>
      {barW > 1 && <div style={{ position: "absolute", left: 960 - barW / 2, top: 540, width: barW, height: 12, borderRadius: 6, background: C.accent }} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: 220, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <Kinetic mots={parseMots("À chaque réponse,", V.corail)} t0={2.7} t1={5.5} size={76} weight={600} couleur="#cfcfc6" />
        <Kinetic mots={parseMots("Claude relit", V.corail)} t0={3.4} t1={5.5} size={124} weight={800} />
        <Kinetic mots={[{ w: "TOUTE", c: V.corail }, { w: "la" }, { w: "conversation." }]} t0={4.0} t1={5.5} size={124} weight={800} />
      </div>

      {/* comparison overlay */}
      {t >= 41.2 && <Comparaison />}

      {/* captions */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 170, background: "linear-gradient(to top, rgba(14,14,13,0.92), transparent)" }} />
      {LEGENDES.map((l, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: 42, display: "flex", justifyContent: "center" }}>
          <Kinetic mots={parseMots(l.texte, V.corailClair).map((w) => ({ ...w, w: w.w.replace(/_/g, " ") }))} t0={l.t0} t1={l.t1} size={58} weight={700} />
        </div>
      ))}

      {/* /clear curtain */}
      {f > 30.9 * FPS && curtainX < 1940 && (
        <div style={{ position: "absolute", top: -100, left: curtainX, width: 3600, height: 1300, transform: "skewX(-14deg)", background: `linear-gradient(90deg, ${C.fond} 0%, ${C.fond} 96%, ${C.accent} 96.5%, ${V.bleuClair} 100%)` }}>
          <div style={{ position: "absolute", right: 320, top: 480, fontFamily: MONO, fontSize: 170, fontWeight: 700, color: "#2a2a27" }}>/clear</div>
          {[0, 1, 2, 3, 4].map((j) => (
            <div key={j} style={{ position: "absolute", right: 380 + j * 90, top: 160 + j * 220 + rnd(j) * 40, width: 700 + rnd(j + 4) * 500, height: 8, borderRadius: 4, background: `rgba(57,135,229,${0.35 - j * 0.05})` }} />
          ))}
        </div>
      )}

    </AbsoluteFill>
  );
};

