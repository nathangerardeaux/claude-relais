import React from "react";
import { useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { clamp, couleurCompteur, FPS, pop, prog, rnd, V } from "./util";

// ---------------------------------------------------------------- one page of the conversation, seen from the side

export const SLAB_W = 260;
export const SLAB_H = 20;
const TAGS = [C.accent, V.corail, "#8d8c84"];

export const Slab: React.FC<{
  i: number;
  x: number;
  y: number;
  s?: number;
  rot?: number;
  opacity?: number;
  glow?: number;
  tint?: number;
}> = ({ i, x, y, s = 1, rot = 0, opacity = 1, glow = 0, tint = 0 }) => {
  const w1 = 90 + rnd(i * 3.1) * 90;
  const w2 = 40 + rnd(i * 5.7) * 60;
  const mix = clamp(tint);
  return (
    <div
      style={{
        position: "absolute",
        left: x - SLAB_W / 2,
        top: y - SLAB_H / 2,
        width: SLAB_W,
        height: SLAB_H,
        borderRadius: 6,
        background: mix > 0.01 ? `rgb(${236 + 19 * mix}, ${230 - 20 * mix}, ${216 - 90 * mix})` : V.papier,
        boxShadow: glow > 0.02 ? `0 0 ${10 + glow * 36}px rgba(255, 150, 90, ${0.35 + glow * 0.55})` : "0 2px 0 rgba(0,0,0,0.35)",
        opacity,
        rotate: `${rot}deg`,
        scale: s,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: 16, height: "100%", background: TAGS[i % 3] }} />
      <div style={{ marginLeft: 12, width: w1, height: 5, borderRadius: 3, background: V.papierLigne }} />
      <div style={{ marginLeft: 10, width: w2, height: 5, borderRadius: 3, background: V.papierLigne, opacity: 0.7 }} />
    </div>
  );
};

// ---------------------------------------------------------------- flying page (a read page going into the robot's head)

export const Bit: React.FC<{ x: number; y: number; rot: number; s?: number; opacity?: number; color?: string }> = ({ x, y, rot, s = 1, opacity = 1, color = V.papier }) => (
  <div
    style={{
      position: "absolute",
      left: x - 11,
      top: y - 14,
      width: 22,
      height: 28,
      borderRadius: 4,
      background: color,
      rotate: `${rot}deg`,
      scale: s,
      opacity,
      boxShadow: "0 0 14px rgba(255,170,110,0.8)",
    }}
  >
    <div style={{ margin: "7px 4px 0", height: 3, borderRadius: 2, background: V.papierLigne }} />
    <div style={{ margin: "5px 4px 0", height: 3, width: 9, borderRadius: 2, background: V.papierLigne }} />
  </div>
);

// ---------------------------------------------------------------- the relais box

export const BoxRelais: React.FC<{
  x: number; // centre of the bottom edge
  y: number;
  open?: number; // 0 closed, 1 open (can overshoot)
  squash?: number;
  glow?: number;
  label?: number; // scale of the label (stamp)
  scale?: number;
  rot?: number;
}> = ({ x, y, open = 0, squash = 1, glow = 0, label = 1, scale = 1, rot = 0 }) => {
  const th = Math.min(open, 1.3) * 112;
  const rad = (th * Math.PI) / 180;
  const lidScaleY = Math.max(0.12, Math.abs(Math.cos(rad)));
  const lidUp = Math.sin(rad) * 46;
  const under = th > 90;
  return (
    <div style={{ position: "absolute", left: x - 120, top: y - 200, width: 240, height: 230, transformOrigin: "120px 200px", scale, rotate: `${rot}deg` }}>
      <svg width={240} height={230} viewBox="0 0 240 230" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="lueurBoite">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.55} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </radialGradient>
        </defs>
        {glow > 0.01 && <circle cx={120} cy={110} r={150 + glow * 60} fill="url(#lueurBoite)" opacity={clamp(0.3 + glow * 0.8)} />}
        <ellipse cx={120} cy={203} rx={96} ry={10} fill="#000" opacity={0.4} />
        <g transform={`translate(120 200) scale(${1 + (1 - squash) * 0.7} ${squash}) translate(-120 -200)`}>
          <rect x={35} y={70} width={170} height={130} rx={14} fill={C.accent} />
          <path d="M35 160 H205 V186 a14 14 0 0 1 -14 14 H49 a14 14 0 0 1 -14 -14 Z" fill="#2c6dbb" />
          <rect x={108} y={70} width={24} height={64} fill="#9cc6f6" opacity={0.5} />
          <rect x={40} y={64} width={160} height={16} rx={8} fill={C.accentDoux} />
          {open > 0.2 && <rect x={46} y={66} width={148} height={8} rx={4} fill="#9fd0ff" opacity={clamp(open) * 0.9} />}
          <g transform={`translate(120 132) scale(${label}) translate(-120 -132)`}>
            <rect x={55} y={110} width={130} height={54} rx={10} fill="#fff" />
            <text x={120} y={148} textAnchor="middle" fontFamily={POLICE} fontWeight={800} fontSize={36} fill="#1b1b19">
              relais<tspan fill={C.accent}>.</tspan>
            </text>
          </g>
          <g transform={`translate(0 ${70 - lidUp}) scale(1 ${lidScaleY})`}>
            <rect x={28} y={-30} width={184} height={34} rx={11} fill={under ? "#2c6dbb" : "#5da3f2"} />
            {!under && <rect x={38} y={-24} width={60} height={7} rx={3.5} fill="#fff" opacity={0.3} />}
          </g>
        </g>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------- the handoff card read in the new session

const LIGNES = ["Objectif", "Où on en est", "Prochaine étape", "Pièges"];

export const Carte: React.FC<{ x: number; y: number; scale?: number; checks?: number; opacity?: number }> = ({ x, y, scale = 1, checks = 0, opacity = 1 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: x - 200,
        top: y - 150,
        width: 400,
        height: 300,
        borderRadius: 24,
        background: C.carte,
        border: `3px solid ${C.accent}`,
        boxShadow: `0 0 ${40 + 10 * Math.sin(f / 6)}px rgba(57,135,229,0.55)`,
        padding: "22px 28px",
        scale,
        opacity,
        fontFamily: POLICE,
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, color: C.accent, marginBottom: 10 }}>
        relais<span style={{ color: "#fff" }}>.</span>
      </div>
      {LIGNES.map((l, i) => {
        const on = checks > i;
        return (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 16, height: 52 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: on ? V.vertClair : "transparent",
                border: `3px solid ${on ? V.vertClair : C.bord}`,
                color: "#102010",
                fontSize: 22,
                fontWeight: 900,
                textAlign: "center",
                lineHeight: "28px",
              }}
            >
              {on ? "✓" : ""}
            </div>
            <div style={{ fontSize: 31, fontWeight: 600, color: on ? "#fff" : C.muet }}>{l}</div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- terminal window of the task

export const LIGNES_TESTS = ["connexion", "panier", "paiement", "profil", "recherche", "api"];

export const Terminal: React.FC<{ x: number; y: number; shown: number; scale?: number; fini?: number }> = ({ x, y, shown, scale = 1, fini = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 600,
        height: 440,
        borderRadius: 22,
        background: C.carte,
        border: `3px solid ${C.bord}`,
        overflow: "hidden",
        transformOrigin: "0px 100%",
        scale,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        fontFamily: MONO,
      }}
    >
      <div style={{ height: 56, background: "#252522", display: "flex", alignItems: "center", gap: 10, padding: "0 20px" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
        ))}
        <div style={{ marginLeft: 16, fontFamily: POLICE, fontSize: 26, color: C.muet }}>Écris les tests</div>
      </div>
      <div style={{ padding: "18px 26px", fontSize: 31, lineHeight: "50px" }}>
        {LIGNES_TESTS.map((l, i) => {
          const p = clamp(shown - i);
          if (p <= 0) return null;
          return (
            <div key={l} style={{ opacity: p, translate: `${(1 - p) * 30}px 0`, color: "#e8e8e0" }}>
              <span style={{ color: V.vertClair, fontWeight: 900 }}>✓</span> {l}.test
            </div>
          );
        })}
        {shown < LIGNES_TESTS.length && <span style={{ display: "inline-block", width: 16, height: 30, background: C.accent, opacity: f % 16 < 9 ? 1 : 0.15, verticalAlign: "middle" }} />}
        {fini > 0 && (
          <div style={{ marginTop: 6, color: V.vertClair, fontWeight: 800, scale: 0.8 + 0.2 * fini, transformOrigin: "left center", opacity: fini }}>
            6 / 6 tests passent
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- HUD: tokens re-read for the current call

// `relais`: between /relais and the fresh session the counter already drops, so the label says so (blue).
export const Hud: React.FC<{ kilo: number; avec: boolean; relais?: boolean; bump?: number; t0: number; opacity?: number }> = ({ kilo, avec, relais = false, bump = 0, t0, opacity = 1 }) => {
  const f = useCurrentFrame();
  const col = couleurCompteur(kilo);
  const shake = kilo > 150 ? 1 : 0;
  const p = pop(f, t0, { damping: 14, stiffness: 140, mass: 0.8 });
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        top: 40,
        width: 500,
        padding: "22px 30px 26px",
        borderRadius: 28,
        background: "rgba(27,27,25,0.94)",
        border: `3px solid ${avec ? "rgba(12,163,12,0.55)" : relais ? "rgba(57,135,229,0.7)" : kilo > 100 ? "rgba(208,59,59,0.7)" : C.bord}`,
        scale: p,
        opacity: opacity * clamp(p * 2),
        transformOrigin: "0 0",
        translate: shake ? `${Math.sin(f * 2.1) * 3}px ${Math.cos(f * 2.7) * 2}px` : undefined,
        boxShadow: kilo > 100 && !avec && !relais ? `0 0 ${20 + 20 * Math.sin(f / 4)}px rgba(208,59,59,0.45)` : "none",
        fontFamily: POLICE,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: avec ? "#0d2a0d" : "#fff",
            background: avec ? V.vertClair : relais ? C.accent : C.critique,
            borderRadius: 12,
            padding: "4px 16px",
          }}
        >
          {avec ? "Avec relais" : relais ? "Relais en cours" : "Sans relais"}
        </div>
      </div>
      <div style={{ fontSize: 28, color: C.muet, marginTop: 14 }}>tokens relus à cet appel</div>
      <div style={{ fontSize: 124, fontWeight: 800, lineHeight: 1.05, color: col, fontVariantNumeric: "tabular-nums", scale: 1 + bump * 0.1, transformOrigin: "left center" }}>
        {Math.round(kilo)}k
      </div>
      <div style={{ height: 22, borderRadius: 11, background: "#0e0e0d", border: `2px solid ${C.bord}`, overflow: "hidden", marginTop: 8 }}>
        <div style={{ height: "100%", width: `${clamp(kilo / 200) * 100}%`, background: col, borderRadius: 11, minWidth: kilo > 0.5 ? 8 : 0 }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- chain of commands at the top: /relais -> /clear -> auto

export const Chaine: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const f = useCurrentFrame();
  const items: { t0: number; texte: string; actif: [number, number]; mono: boolean; couleur: string }[] = [
    { t0: 24.1, texte: "/relais", actif: [24.1, 28.4], mono: true, couleur: C.accent },
    { t0: 30.2, texte: "/clear", actif: [30.2, 32.8], mono: true, couleur: C.alerte },
    { t0: 36.0, texte: "reprise auto", actif: [36.0, 41.2], mono: false, couleur: V.vertClair },
  ];
  return (
    <div style={{ position: "absolute", left: 610, top: 46, display: "flex", alignItems: "center", gap: 16, opacity }}>
      {items.map((it, i) => {
        const p = pop(f, it.t0);
        if (p <= 0.001) return null;
        const nbCar = it.mono ? Math.min(it.texte.length, Math.floor((f - it.t0 * FPS) / 2.6) + 1) : it.texte.length;
        const act = clamp(prog(f, it.actif[0], it.actif[0] + 0.25) - prog(f, it.actif[1], it.actif[1] + 0.3));
        return (
          <React.Fragment key={it.texte}>
            {i > 0 && <div style={{ fontSize: 40, color: C.muet, opacity: clamp(p * 2), fontFamily: POLICE }}>→</div>}
            <div
              style={{
                scale: p * (1 + act * 0.1),
                opacity: clamp(p * 2),
                fontFamily: it.mono ? MONO : POLICE,
                fontSize: it.mono ? 40 : 36,
                fontWeight: 700,
                color: act > 0.5 ? "#fff" : C.muet,
                background: C.carte,
                border: `3px solid ${act > 0.5 ? it.couleur : C.bord}`,
                borderRadius: 16,
                padding: "10px 24px",
                boxShadow: act > 0.01 ? `0 0 ${30 * act}px ${it.couleur}88` : "none",
                whiteSpace: "nowrap",
              }}
            >
              {it.mono && <span style={{ color: C.muet }}>&gt; </span>}
              {it.texte.slice(0, nbCar)}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- speech bubble (world coordinates, centred on x)

export const Bulle: React.FC<{ x: number; y: number; texte: string; t0: number; t1: number; fond: string; couleurTexte?: string; bord?: string; left?: boolean }> = ({
  x,
  y,
  texte,
  t0,
  t1,
  fond,
  couleurTexte = "#fff",
  bord = "transparent",
  left = false,
}) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 10, stiffness: 200, mass: 0.6 }) * (1 - prog(f, t1, t1 + 0.25));
  if (p <= 0.01) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        translate: left ? "0 -100%" : "-50% -100%",
        transformOrigin: left ? "0 100%" : "50% 100%",
        scale: p,
        opacity: clamp(p * 2),
        background: fond,
        border: `3px solid ${bord}`,
        color: couleurTexte,
        fontFamily: POLICE,
        fontSize: 40,
        fontWeight: 700,
        borderRadius: 26,
        padding: "12px 28px",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      {texte}
      <div style={{ position: "absolute", bottom: -14, left: left ? 40 : "50%", marginLeft: -12, width: 24, height: 24, background: fond, borderRight: `3px solid ${bord}`, borderBottom: `3px solid ${bord}`, rotate: "45deg" }} />
    </div>
  );
};

// ---------------------------------------------------------------- user avatar + message that flies in from the left

export const Message: React.FC<{ texte: string; t0: number; t1: number; x?: number; y?: number }> = ({ texte, t0, t1, x = 80, y = 410 }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 12, stiffness: 150, mass: 0.8 });
  const out = prog(f, t1, t1 + 0.3);
  if (p <= 0.001 || out >= 1) return null;
  const ring = prog(f, t0 + 0.2, t0 + 0.8);
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 18, translate: `${(1 - p) * -420 - out * 200}px 0`, opacity: (1 - out) * clamp(p * 3), fontFamily: POLICE }}>
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <div style={{ position: "absolute", inset: -ring * 30, borderRadius: "50%", border: `4px solid ${C.accent}`, opacity: (1 - ring) * 0.7 * (ring > 0 ? 1 : 0) }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.accent }}>
          <div style={{ position: "absolute", left: 24, top: 12, width: 24, height: 24, borderRadius: "50%", background: "#fff" }} />
          <div style={{ position: "absolute", left: 14, top: 40, width: 44, height: 40, borderRadius: "22px 22px 0 0", background: "#fff", clipPath: "inset(0 0 40% 0)" }} />
        </div>
      </div>
      <div style={{ background: C.accentDoux, border: `3px solid ${C.accent}`, borderRadius: "28px 28px 28px 8px", padding: "14px 30px", fontSize: 40, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{texte}</div>
    </div>
  );
};

// ---------------------------------------------------------------- kinetic words

export type Mot = { w: string; c?: string };

export const parseMots = (texte: string, couleur: string): Mot[] =>
  texte.split(" ").map((w) => (w.startsWith("*") ? { w: w.replace(/\*/g, "").replace(/_/g, " "), c: couleur } : { w }));

export const Kinetic: React.FC<{
  mots: Mot[];
  t0: number;
  t1: number; // exit starts
  size: number;
  weight?: number;
  align?: "center" | "flex-start";
  stagger?: number;
  couleur?: string;
}> = ({ mots, t0, t1, size, weight = 700, align = "center", stagger = 0.08, couleur = "#fff" }) => {
  const f = useCurrentFrame();
  const out = prog(f, t1, t1 + 0.35);
  if (f < t0 * FPS - 1 || out >= 1) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align, gap: `0 ${size * 0.28}px`, fontFamily: POLICE, fontSize: size, fontWeight: weight, lineHeight: 1.12, color: couleur }}>
      {mots.map((m, i) => {
        const p = pop(f, t0 + i * stagger, { damping: 10, stiffness: 190, mass: 0.7 });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: m.c ?? couleur,
              opacity: clamp(p * 2.5) * (1 - out),
              translate: `0 ${(1 - p) * 50 - out * 40}px`,
              scale: 0.55 + 0.45 * p,
              rotate: `${(1 - p) * (rnd(i + 1.3) - 0.5) * 16}deg`,
              filter: out > 0 ? `blur(${out * 8}px)` : undefined,
              textShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            {m.w}
          </span>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- particles (deterministic, world coordinates)

export const Burst: React.FC<{
  cx: number;
  cy: number;
  t0: number;
  count: number;
  colors: string[];
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  angle?: number; // degrees, 0 = right
  spread?: number; // degrees
  seed?: number;
}> = ({ cx, cy, t0, count, colors, speed = 14, life = 30, size = 7, gravity = 0.25, angle = 0, spread = 360, seed = 1 }) => {
  const f = useCurrentFrame();
  const a = f - t0 * FPS;
  if (a < 0 || a > life) return null;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width={1} height={1}>
      {Array.from({ length: count }).map((_, j) => {
        const ang = ((angle + (rnd(j * 3 + seed) - 0.5) * spread) * Math.PI) / 180;
        const v = speed * (0.35 + rnd(j * 7 + seed) * 0.9);
        const dist = v * 7 * (1 - Math.exp(-a / 7));
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist + gravity * a * a * 0.5;
        const q = a / life;
        const r = size * (0.5 + rnd(j * 11 + seed)) * (1 - q * 0.6);
        return rnd(j * 13 + seed) > 0.6 ? (
          <rect key={j} x={px - r} y={py - r * 0.6} width={r * 2} height={r * 1.2} fill={colors[j % colors.length]} opacity={1 - q} transform={`rotate(${q * 400 * (rnd(j) - 0.5)} ${px} ${py})`} />
        ) : (
          <circle key={j} cx={px} cy={py} r={r} fill={colors[j % colors.length]} opacity={1 - q} />
        );
      })}
    </svg>
  );
};

export const Bang: React.FC<{ x: number; y: number; t0: number; t1: number; texte?: string }> = ({ x, y, t0, t1, texte = "!" }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 8, stiffness: 240, mass: 0.5 }) * (1 - prog(f, t1, t1 + 0.15));
  if (p <= 0.01) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 26,
        top: y - 70,
        width: 52,
        height: 64,
        borderRadius: 18,
        background: V.jaune,
        color: "#3a2a00",
        fontFamily: POLICE,
        fontWeight: 900,
        fontSize: 52,
        textAlign: "center",
        lineHeight: "64px",
        scale: p,
        rotate: `${Math.sin(f * 0.8) * 6}deg`,
        transformOrigin: "50% 100%",
      }}
    >
      {texte}
    </div>
  );
};
