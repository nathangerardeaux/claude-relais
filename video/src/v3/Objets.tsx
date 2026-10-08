// Props of the v3 video ("Relais, toute la boîte à outils"): set, curtain, tool icons and their top bar,
// toolbox, notebook, banana peel, coin, the devil's advocate robot, held tools, captions.
// Same drawing language as src/v2 (flat SVG shapes, dark dashboard colours, springy entrances).
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { Kinetic, parseMots } from "../v2/Parts";
import { Robot } from "../v2/Robot";
import type { RobotProps } from "../v2/Robot";
import { CL, FPS, clamp, pop, rnd, V } from "../v2/util";

export const FLOOR = 880;
export const VIOLET = "#a07cf0";

// ------------------------------------------------------------------ the five tools
export type Outil = "appli" | "regles" | "avocat" | "skills" | "images";
export const OUTILS: { id: Outil; nom: string; couleur: string }[] = [
  { id: "appli", nom: "appli", couleur: C.accent },
  { id: "regles", nom: "règles", couleur: V.jaune },
  { id: "avocat", nom: "avocat", couleur: VIOLET },
  { id: "skills", nom: "skills", couleur: V.vertClair },
  { id: "images", nom: "images", couleur: V.corailClair },
];

// ------------------------------------------------------------------ set: dotted wall + floor, with a camera
export const Decor: React.FC<{ fresh?: boolean; cx?: number; cy?: number; z?: number; children?: React.ReactNode }> = ({ fresh = false, cx = 960, cy = 540, z = 1, children }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: fresh ? "#0f1613" : C.fond, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
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
        {children}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene change: the v2 "/clear" curtain, faster
// `t` = instant (global seconds) when the curtain covers the whole screen and the next scene starts.
export const Rideau: React.FC<{ t: number; texte?: string }> = ({ t, texte }) => {
  const f = useCurrentFrame();
  if (f < (t - 0.75) * FPS || f > (t + 0.75) * FPS) return null;
  const x = interpolate(f, [(t - 0.75) * FPS, (t + 0.75) * FPS], [-3900, 2100], { ...CL, easing: Easing.inOut(Easing.sin) });
  return (
    <div style={{ position: "absolute", top: -100, left: x, width: 3600, height: 1300, transform: "skewX(-14deg)", background: `linear-gradient(90deg, ${C.fond} 0%, ${C.fond} 96%, ${C.accent} 96.5%, ${V.bleuClair} 100%)` }}>
      {texte && <div style={{ position: "absolute", right: 320, top: 480, fontFamily: MONO, fontSize: 170, fontWeight: 700, color: "#2a2a27", whiteSpace: "nowrap" }}>{texte}</div>}
      {[0, 1, 2, 3, 4].map((j) => (
        <div key={j} style={{ position: "absolute", right: 380 + j * 90, top: 160 + j * 220 + rnd(j) * 40, width: 700 + rnd(j + 4) * 500, height: 8, borderRadius: 4, background: `rgba(57,135,229,${0.35 - j * 0.05})` }} />
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ tool icons (100 x 100 drawing)
export const Icone: React.FC<{ id: Outil; size: number }> = ({ id, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible", display: "block" }}>
    {id === "appli" && (
      <>
        <rect x={6} y={12} width={88} height={76} rx={14} fill="#16273d" stroke={C.accent} strokeWidth={6} />
        <rect x={6} y={12} width={88} height={20} rx={10} fill={C.accent} />
        <rect x={22} y={62} width={13} height={16} rx={3} fill={V.vertClair} />
        <rect x={44} y={50} width={13} height={28} rx={3} fill={C.alerte} />
        <rect x={66} y={40} width={13} height={38} rx={3} fill={V.rougeClair} />
      </>
    )}
    {id === "regles" && (
      <>
        <rect x={18} y={6} width={68} height={88} rx={9} fill={V.jaune} />
        <rect x={18} y={6} width={16} height={88} rx={6} fill="#d9a400" />
        {[22, 42, 62, 82].map((y) => (
          <circle key={y} cx={18} cy={y} r={5} fill={V.fer} />
        ))}
        {[30, 46, 62].map((y, i) => (
          <rect key={y} x={42} y={y} width={i === 2 ? 22 : 34} height={6} rx={3} fill="#8a6d10" />
        ))}
      </>
    )}
    {id === "avocat" && (
      <>
        <path d="M26 22 Q22 6 34 0 Q32 12 38 20 Z" fill={C.critique} />
        <path d="M58 22 Q62 6 50 0 Q52 12 46 20 Z" fill={C.critique} />
        <line x1={62} y1={62} x2={90} y2={90} stroke={V.fer} strokeWidth={14} strokeLinecap="round" />
        <circle cx={42} cy={42} r={27} fill="rgba(160,124,240,0.25)" stroke={VIOLET} strokeWidth={10} />
        <path d="M30 34 Q34 26 42 25" stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.7} />
      </>
    )}
    {id === "skills" && (
      <>
        <rect x={4} y={28} width={92} height={46} rx={23} fill={V.vertClair} />
        <circle cx={72} cy={51} r={18} fill="#fff" />
      </>
    )}
    {id === "images" && (
      <>
        <path d="M50 18 C80 18 96 36 92 56 C89 70 76 66 70 74 C64 84 70 92 54 92 C24 92 6 74 8 52 C10 32 26 18 50 18 Z" fill="#e9c79c" />
        <circle cx={30} cy={46} r={8} fill={V.rougeClair} />
        <circle cx={50} cy={34} r={8} fill={C.accent} />
        <circle cx={72} cy={42} r={8} fill={V.jaune} />
        <circle cx={28} cy={68} r={8} fill={V.vertClair} />
        <g transform="rotate(35 70 40)">
          <rect x={64} y={-14} width={11} height={46} rx={5} fill={V.fer} />
          <rect x={62} y={30} width={15} height={12} rx={3} fill="#c9c9c9" />
          <path d="M62 42 Q69 62 77 42 Z" fill={V.corail} />
        </g>
      </>
    )}
  </svg>
);

// ------------------------------------------------------------------ top bar: the tools collected so far, current one lit
export const CHIP_W = 210;
const CHIP_GAP = 14;
const CHIP_X0 = 70;
const CHIP_Y = 40;
export const slot = (i: number) => ({ x: CHIP_X0 + i * (CHIP_W + CHIP_GAP) + 18 + 23, y: CHIP_Y + 36 });

export const Inventaire: React.FC<{ arrivee: (i: number) => number; actif: (i: number) => number; opacity?: number }> = ({ arrivee, actif, opacity = 1 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
      {OUTILS.map((o, i) => {
        const p = pop(f, arrivee(i), { damping: 9, stiffness: 220, mass: 0.6 });
        if (p <= 0.001) return null;
        const a = actif(i);
        return (
          <div
            key={o.id}
            style={{
              position: "absolute",
              left: CHIP_X0 + i * (CHIP_W + CHIP_GAP),
              top: CHIP_Y,
              width: CHIP_W,
              height: 72,
              boxSizing: "border-box",
              borderRadius: 18,
              background: C.carte,
              border: `3px solid ${a > 0.5 ? o.couleur : C.bord}`,
              boxShadow: a > 0.01 ? `0 0 ${34 * a}px ${o.couleur}88` : "none",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 16px",
              scale: p * (1 + a * 0.08),
              opacity: clamp(p * 2),
              fontFamily: POLICE,
            }}
          >
            <Icone id={o.id} size={46} />
            <div style={{ fontSize: 34, fontWeight: 700, color: a > 0.5 ? "#fff" : C.muet }}>{o.nom}</div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ the relais toolbox (feet at x, y)
export const Caisse: React.FC<{ x: number; y: number; open?: number; glow?: number; scale?: number; rot?: number }> = ({ x, y, open = 0, glow = 0, scale = 1, rot = 0 }) => {
  const th = Math.min(open, 1.25) * 118;
  const ouverte = open > 0.05;
  return (
    <div style={{ position: "absolute", left: x - 220, top: y - 300, width: 440, height: 340, transformOrigin: "220px 300px", scale, rotate: `${rot}deg` }}>
      <svg width={440} height={340} viewBox="0 0 440 340" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="lueurCaisse">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.55} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </radialGradient>
        </defs>
        {glow > 0.01 && <circle cx={220} cy={170} r={200 + glow * 70} fill="url(#lueurCaisse)" opacity={clamp(0.3 + glow * 0.8)} />}
        <ellipse cx={220} cy={303} rx={182} ry={12} fill="#000" opacity={0.4} />
        {ouverte && <rect x={56} y={138} width={328} height={22} rx={8} fill="#0d1b2c" />}
        {ouverte && <rect x={66} y={142} width={308} height={8} rx={4} fill="#9fd0ff" opacity={clamp(open) * 0.9} />}
        <rect x={50} y={150} width={340} height={150} rx={18} fill={C.accent} />
        <path d="M50 262 H390 V282 a18 18 0 0 1 -18 18 H68 a18 18 0 0 1 -18 -18 Z" fill="#2c6dbb" />
        <rect x={64} y={164} width={10} height={86} rx={5} fill="#9cc6f6" opacity={0.45} />
        <rect x={80} y={150} width={18} height={30} rx={5} fill="#c9d6e6" />
        <rect x={342} y={150} width={18} height={30} rx={5} fill="#c9d6e6" />
        <rect x={145} y={188} width={150} height={58} rx={11} fill="#fff" />
        <text x={220} y={229} textAnchor="middle" fontFamily={POLICE} fontWeight={800} fontSize={38} fill="#1b1b19">
          relais<tspan fill={C.accent}>.</tspan>
        </text>
        {/* lid, hinged on the right: the left end goes up */}
        <g transform={`rotate(${th} 392 152)`}>
          <rect x={44} y={118} width={352} height={38} rx={13} fill={th > 90 ? "#2c6dbb" : "#5da3f2"} />
          {th < 90 && <rect x={58} y={125} width={90} height={8} rx={4} fill="#fff" opacity={0.3} />}
          <path d="M178 118 V100 a14 14 0 0 1 14 -14 H248 a14 14 0 0 1 14 14 V118" stroke={V.fer} strokeWidth={13} fill="none" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};

// ------------------------------------------------------------------ captions (bottom lane, global seconds)
export type Legende = { t0: number; t1: number; texte: string };
export const Legendes: React.FC<{ items: Legende[] }> = ({ items }) => (
  <>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 170, background: "linear-gradient(to top, rgba(14,14,13,0.92), transparent)" }} />
    {items.map((l, i) => (
      <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: 42, display: "flex", justifyContent: "center" }}>
        <Kinetic mots={parseMots(l.texte, V.corailClair).map((w) => ({ ...w, w: w.w.replace(/_/g, " ") }))} t0={l.t0} t1={l.t1} size={58} weight={700} />
      </div>
    ))}
  </>
);

// ------------------------------------------------------------------ robot hand position (to put a tool in it)
// Mirrors the geometry of src/v2/Robot.tsx (arm pivots at (58,166) and (162,166), 56 px long, feet at (110,280)).
// Valid when the robot is not walking. Returns the hand in world coordinates and the arm direction (unit vector).
export const main = (o: { x: number; y: number; f: number; bras: number; cote?: "D" | "G"; s?: number; dir?: number; lift?: number; tired?: number }) => {
  const s = o.s ?? 1;
  const dir = o.dir ?? 1;
  const tired = o.tired ?? 0;
  const bob = Math.sin(o.f / 14) * 2.2 * (1 - tired * 0.6) - tired * 7 * 0.4;
  const a = (o.bras * Math.PI) / 180;
  const droite = (o.cote ?? "D") === "D";
  let lx = droite ? 162 + 56 * Math.sin(a) : 58 - 56 * Math.sin(a);
  let ux = droite ? Math.sin(a) : -Math.sin(a);
  const ly = 166 + 56 * Math.cos(a);
  const uy = Math.cos(a);
  if (dir < 0) {
    lx = 220 - lx;
    ux = -ux;
  }
  return { x: o.x + (lx - 110) * s, y: o.y + (ly - bob - 280) * s - (o.lift ?? 0) * s, ux, uy };
};

// Arm angle (degrees, as RobotProps.armR / armL) that points the arm at a world target.
export const viser = (o: { x: number; y: number; s?: number; dir?: number; lift?: number; cote?: "D" | "G" }, tx: number, ty: number) => {
  const s = o.s ?? 1;
  const dir = o.dir ?? 1;
  const droite = (o.cote ?? "D") === "D";
  const sx = o.x + ((dir > 0) === droite ? 52 : -52) * s;
  const sy = o.y - (114 + (o.lift ?? 0)) * s;
  const dx = (tx - sx) * dir * (droite ? 1 : -1);
  return (Math.atan2(dx, ty - sy) * 180) / Math.PI;
};

// ------------------------------------------------------------------ jumps and walks (local seconds)
export type Saut = { t: number; h: number; d: number };
export const sauts = (t: number, liste: Saut[]) => {
  let lift = 0;
  let sq = 1;
  for (const j of liste) {
    const q = (t - j.t) / j.d;
    if (q >= 0 && q <= 1) {
      lift += j.h * 4 * q * (1 - q);
      sq = Math.min(sq, 1.07);
    } else if (t >= j.t - 0.12 && t < j.t) sq = Math.min(sq, 1 - 0.14 * ((t - (j.t - 0.12)) / 0.12));
    else if (q > 1 && t < j.t + j.d + 0.2) sq = Math.min(sq, 0.86 + 0.14 * ((t - j.t - j.d) / 0.2));
  }
  return { lift, sq };
};

export type Pas = { t0: number; t1: number; x0: number; x1: number; speed?: number };
export const marche = (t: number, x0: number, segs: Pas[]) => {
  let x = x0;
  let dir = 1;
  let walking = false;
  let speed = 0.5;
  for (const s of segs) {
    if (t < s.t0) break;
    dir = s.x1 >= s.x0 ? 1 : -1;
    if (t >= s.t1) x = s.x1;
    else {
      x = s.x0 + (s.x1 - s.x0) * Easing.inOut(Easing.quad)((t - s.t0) / (s.t1 - s.t0));
      walking = true;
      speed = s.speed ?? 0.5;
    }
  }
  return { x, dir, walking, speed };
};

// Dust puffs under running feet (same as v2).
export const Poussiere: React.FC<{ t0: number; t1: number; xAt: (t: number) => number; dir: number }> = ({ t0, t1, xAt, dir }) => {
  const f = useCurrentFrame();
  const out: React.ReactNode[] = [];
  for (let j = 0; j < 7; j++) {
    const ts = Math.floor(f / 3) * 3 - j * 3;
    const age = f - ts;
    const tt = ts / FPS;
    if (tt < t0 || tt >= t1 || age > 20) continue;
    const r = 10 + age * 1.3;
    out.push(
      <div
        key={j}
        style={{ position: "absolute", left: xAt(tt) - dir * 26 - r, top: FLOOR - 8 - age * 1.2 - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: "rgba(210,205,190,0.28)", opacity: 1 - age / 20 }}
      />,
    );
  }
  return <>{out}</>;
};

// ------------------------------------------------------------------ held tools (world coordinates, from the hand along the arm)
const Svg: React.FC<{ children: React.ReactNode; opacity?: number }> = ({ children, opacity = 1 }) => (
  <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", opacity }} width={1} height={1}>
    {children}
  </svg>
);

// Long-handled magnifier: the lens centre is LOUPE_D px (unscaled) from the hand, along the arm.
export const LOUPE_D = 150;
export const Loupe: React.FC<{ hx: number; hy: number; ux: number; uy: number; s?: number; opacity?: number }> = ({ hx, hy, ux, uy, s = 1, opacity = 1 }) => {
  const cx = hx + ux * LOUPE_D * s;
  const cy = hy + uy * LOUPE_D * s;
  const r = 46 * s;
  return (
    <Svg opacity={opacity}>
      <line x1={hx - ux * 10 * s} y1={hy - uy * 10 * s} x2={hx + ux * (LOUPE_D - 44) * s} y2={hy + uy * (LOUPE_D - 44) * s} stroke={V.fer} strokeWidth={15 * s} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="rgba(190,225,255,0.22)" stroke={VIOLET} strokeWidth={11 * s} />
      <path d={`M ${cx - r * 0.55} ${cy - r * 0.2} Q ${cx - r * 0.45} ${cy - r * 0.6} ${cx - r * 0.05} ${cy - r * 0.62}`} stroke="#fff" strokeWidth={6 * s} strokeLinecap="round" fill="none" opacity={0.75} />
    </Svg>
  );
};

export const Pinceau: React.FC<{ hx: number; hy: number; ux: number; uy: number; couleur: string; s?: number; opacity?: number }> = ({ hx, hy, ux, uy, couleur, s = 1, opacity = 1 }) => {
  const p = (d: number) => ({ x: hx + ux * d * s, y: hy + uy * d * s });
  const a = p(-14);
  const b = p(60);
  const c = p(76);
  const tip = p(104);
  const nx = -uy;
  const ny = ux;
  return (
    <Svg opacity={opacity}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a5a32" strokeWidth={11 * s} strokeLinecap="round" />
      <line x1={b.x} y1={b.y} x2={c.x} y2={c.y} stroke="#c9c9c9" strokeWidth={14 * s} />
      <path d={`M ${c.x + nx * 8 * s} ${c.y + ny * 8 * s} Q ${tip.x + nx * 5 * s} ${tip.y + ny * 5 * s} ${tip.x} ${tip.y} Q ${tip.x - nx * 5 * s} ${tip.y - ny * 5 * s} ${c.x - nx * 8 * s} ${c.y - ny * 8 * s} Z`} fill={couleur} />
    </Svg>
  );
};
export const boutPinceau = (hx: number, hy: number, ux: number, uy: number, s = 1) => ({ x: hx + ux * 104 * s, y: hy + uy * 104 * s });

export const Crayon: React.FC<{ x: number; y: number; rot: number; s?: number; opacity?: number }> = ({ x, y, rot, s = 1, opacity = 1 }) => (
  // tip at (x, y), body going up-right at `rot` degrees
  <div style={{ position: "absolute", left: x, top: y, width: 1, height: 1, rotate: `${rot}deg`, scale: s, opacity, transformOrigin: "0 0" }}>
    <svg width={1} height={1} style={{ overflow: "visible" }}>
      <path d="M0 0 L22 -9 L22 9 Z" fill="#f2d3a6" />
      <path d="M0 0 L8 -3.3 L8 3.3 Z" fill={V.fer} />
      <rect x={22} y={-11} width={110} height={22} fill={V.jaune} />
      <rect x={22} y={-11} width={110} height={7} fill="#ffe98a" />
      <rect x={132} y={-11} width={14} height={22} fill="#c9c9c9" />
      <rect x={146} y={-11} width={18} height={22} rx={6} fill={V.rougeClair} />
    </svg>
  </div>
);

// ------------------------------------------------------------------ the rules notebook
export type LigneCarnet = { texte: string; t0: number; duree: number; couleur?: string; gras?: boolean };
export const tape = (texte: string, f: number, t0: number, duree: number) => texte.slice(0, Math.floor(clamp((f - t0 * FPS) / (duree * FPS)) * texte.length));

export const Carnet: React.FC<{ x: number; y: number; scale?: number; lignes: LigneCarnet[]; opacity?: number; glow?: number; rot?: number }> = ({ x, y, scale = 1, lignes, opacity = 1, glow = 0, rot = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: x - 290,
        top: y - 180,
        width: 580,
        height: 360,
        borderRadius: 20,
        background: V.papier,
        scale,
        rotate: `${rot}deg`,
        opacity,
        boxShadow: glow > 0.01 ? `0 0 ${40 + 20 * glow + 8 * Math.sin(f / 6)}px rgba(255,216,77,${0.35 + 0.4 * glow})` : "0 24px 50px rgba(0,0,0,0.45)",
        fontFamily: POLICE,
        overflow: "visible",
      }}
    >
      <div style={{ height: 70, borderRadius: "20px 20px 0 0", background: V.jaune, display: "flex", alignItems: "center", padding: "0 30px", gap: 14 }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#3a2a00" }}>règles</div>
        <div style={{ fontSize: 26, fontWeight: 600, color: "#7a5f00" }}>registre du projet</div>
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((j) => (
        <div key={j} style={{ position: "absolute", left: 200 + j * 52, top: -16, width: 20, height: 34, borderRadius: 11, border: `6px solid ${V.fer}`, background: "transparent" }} />
      ))}
      {[0, 1, 2, 3].map((j) => (
        <div key={j} style={{ position: "absolute", left: 26, right: 26, top: 140 + j * 62, height: 3, background: V.papierLigne, opacity: 0.6 }} />
      ))}
      <div style={{ position: "absolute", left: 34, top: 88, right: 30 }}>
        {lignes.map((l, i) => {
          const txt = tape(l.texte, f, l.t0, l.duree);
          return (
            <div key={i} style={{ height: 62, fontSize: 36, lineHeight: "62px", fontWeight: l.gras ? 800 : 600, color: l.couleur ?? "#2a2620", whiteSpace: "nowrap" }}>
              {txt}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ banana peel (bottom centre at x, y)
export const Banane: React.FC<{ x: number; y: number; s?: number; rot?: number; opacity?: number }> = ({ x, y, s = 1, rot = 0, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 1, height: 1, scale: s, rotate: `${rot}deg`, opacity, transformOrigin: "0 0" }}>
    <svg width={1} height={1} style={{ overflow: "visible" }}>
      <ellipse cx={0} cy={2} rx={70} ry={9} fill="#000" opacity={0.35} />
      <path d="M-8 -6 Q-48 -8 -70 -30 Q-58 -6 -30 2 Q-14 4 -6 2 Z" fill={V.jaune} stroke="#c99a00" strokeWidth={3} />
      <path d="M8 -6 Q48 -6 72 -24 Q62 -2 32 3 Q14 4 6 2 Z" fill={V.jaune} stroke="#c99a00" strokeWidth={3} />
      <path d="M-14 -2 Q-18 -40 -4 -62 Q8 -44 14 -2 Z" fill="#ffe27a" stroke="#c99a00" strokeWidth={3} />
      <ellipse cx={0} cy={-4} rx={22} ry={9} fill="#e8c63a" />
      <rect x={-5} y={-74} width={10} height={14} rx={3} fill="#5a4520" />
    </svg>
  </div>
);

// ------------------------------------------------------------------ token coin "économisé"
export const Piece: React.FC<{ x: number; y: number; t0: number }> = ({ x, y, t0 }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 8, stiffness: 170, mass: 0.7 });
  if (p <= 0.001) return null;
  const spin = Math.cos((f - t0 * FPS) / 7);
  const label = pop(f, t0 + 0.35, { damping: 10, stiffness: 200, mass: 0.6 });
  const flotte = Math.sin(f / 12) * 8;
  return (
    <div style={{ position: "absolute", left: x, top: y + flotte, width: 1, height: 1 }}>
      <div
        style={{
          position: "absolute",
          left: -78,
          top: -78 - (1 - p) * 80,
          width: 156,
          height: 156,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #fff6b8, #ffd84d 45%, #d9a400)",
          border: "8px solid #b88a00",
          boxSizing: "border-box",
          transform: `scaleX(${0.25 + 0.75 * Math.abs(spin)})`,
          scale: p,
          boxShadow: "0 0 50px rgba(255,216,77,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: POLICE,
          fontWeight: 900,
          fontSize: 50,
          color: "#6a4b00",
        }}
      >
        {Math.abs(spin) > 0.35 ? "tok" : ""}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 98,
          translate: "-50% 0",
          scale: label,
          opacity: clamp(label * 2),
          background: V.vertClair,
          color: "#0d2a0d",
          fontFamily: POLICE,
          fontWeight: 800,
          fontSize: 40,
          borderRadius: 20,
          padding: "6px 24px",
          whiteSpace: "nowrap",
        }}
      >
        économisé ✓
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ the devil's advocate: the same robot, violet, with horns and bat wings
export const Avocat: React.FC<RobotProps> = (props) => {
  const f = useCurrentFrame();
  const { x, y, scale = 1, lift = 0, opacity = 1 } = props;
  const bob = Math.sin(f / 14) * 2.2;
  const flap = 0.45 + 0.55 * Math.abs(Math.sin(f * 0.45));
  const boite = (children: React.ReactNode) => (
    <div style={{ position: "absolute", left: x - 110, top: y - 280, width: 220, height: 300, transformOrigin: "110px 280px", scale, opacity, pointerEvents: "none" }}>
      <svg width={220} height={300} viewBox="0 0 220 300" style={{ overflow: "visible" }}>
        <g transform={`translate(0 ${-lift - bob})`}>{children}</g>
      </svg>
    </div>
  );
  return (
    <>
      {boite(
        [-1, 1].map((side) => (
          <g key={side} transform={`translate(110 165) scale(${side} ${flap}) translate(-110 -165)`}>
            <path d="M140 150 Q196 92 268 108 Q250 128 258 150 Q234 144 228 170 Q208 158 196 184 Q178 168 150 188 Z" fill="#3d2560" stroke="#7a56b8" strokeWidth={4} strokeLinejoin="round" />
          </g>
        )),
      )}
      <div style={{ position: "absolute", left: 0, top: 0, filter: "hue-rotate(245deg) saturate(1.1)" }}>
        <Robot {...props} />
      </div>
      {boite(
        <>
          <path d="M54 48 Q44 18 64 2 Q62 26 76 40 Z" fill={C.critique} stroke="#8e1f1f" strokeWidth={3} strokeLinejoin="round" />
          <path d="M166 48 Q176 18 156 2 Q158 26 144 40 Z" fill={C.critique} stroke="#8e1f1f" strokeWidth={3} strokeLinejoin="round" />
        </>,
      )}
    </>
  );
};

// ------------------------------------------------------------------ on/off switch
export const Interrupteur: React.FC<{ on: number; s?: number }> = ({ on, s = 1 }) => {
  const c = clamp(on);
  return (
    <div style={{ position: "relative", width: 104 * s, height: 56 * s, borderRadius: 28 * s, background: c > 0.5 ? V.vertClair : "#3a3a36", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 7 * s, left: (7 + c * 48) * s, width: 42 * s, height: 42 * s, borderRadius: 21 * s, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }} />
    </div>
  );
};

export const Avatar: React.FC<{ size?: number }> = ({ size = 72 }) => (
  <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: C.accent, flexShrink: 0 }}>
    <div style={{ position: "absolute", left: size / 3, top: size / 6, width: size / 3, height: size / 3, borderRadius: "50%", background: "#fff" }} />
    <div style={{ position: "absolute", left: size * 0.2, top: size * 0.56, width: size * 0.6, height: size * 0.55, borderRadius: `${size * 0.3}px ${size * 0.3}px 0 0`, background: "#fff", clipPath: "inset(0 0 40% 0)" }} />
  </div>
);

