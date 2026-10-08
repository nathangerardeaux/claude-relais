// Iris and ending of the v3 video (same look as src/v2/Fin.tsx). Times are LOCAL seconds from the iris start.
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { Burst, Kinetic, parseMots } from "../v2/Parts";
import { Robot } from "../v2/Robot";
import { CL, DOUX, FPS, clamp, pop, V } from "../v2/util";
import { Caisse, Icone, OUTILS } from "./Objets";

export const IrisV3: React.FC = () => {
  const f = useCurrentFrame();
  const r = interpolate(f, [0, 0.7 * FPS], [0, 1700], { ...CL, easing: Easing.in(Easing.cubic) });
  if (r <= 0 || f > 1.2 * FPS) return null;
  return <div style={{ position: "absolute", inset: 0, background: C.accent, clipPath: `circle(${r}px at 960px 540px)` }} />;
};

const Ligne: React.FC<{ texte: string; t0: number; duree: number; y: number }> = ({ texte, t0, duree, y }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 14, stiffness: 160, mass: 0.8 });
  if (p <= 0.001) return null;
  const typed = texte.slice(0, Math.floor(clamp((f - (t0 + 0.2) * FPS) / (duree * FPS)) * texte.length));
  const fini = typed.length >= texte.length;
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: y,
        fontFamily: MONO,
        fontSize: 40,
        background: C.carte,
        border: `3px solid ${fini ? C.accent : C.bord}`,
        borderRadius: 18,
        padding: "18px 38px",
        opacity: clamp(p * 2),
        translate: `0 ${(1 - p) * 40}px`,
        whiteSpace: "nowrap",
        boxShadow: fini ? "0 0 30px rgba(57,135,229,0.35)" : "none",
      }}
    >
      <span style={{ color: C.muet }}>&gt; </span>
      {typed}
      {!fini && <span style={{ display: "inline-block", width: 18, height: 38, background: C.accent, verticalAlign: "middle", marginLeft: 2 }} />}
    </div>
  );
};

export const EndingV3: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = interpolate(f, [0.45 * FPS, 1.15 * FPS], [0, 1700], { ...CL, easing: Easing.out(Easing.cubic) });
  if (reveal <= 0) return null;
  const barW = interpolate(f, [1.2 * FPS, 1.9 * FPS], [0, 520], { ...CL, easing: DOUX });
  const bob = Math.sin(f / 16) * 10;
  const url = pop(f, 3.9, { damping: 12, stiffness: 160, mass: 0.8 });
  return (
    <div style={{ position: "absolute", inset: 0, background: C.fond, clipPath: `circle(${reveal}px at 960px 540px)`, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 1000, top: -100, width: 1200, height: 1100, background: "radial-gradient(ellipse at center, rgba(57,135,229,0.22), transparent 65%)" }} />
      {/* logo */}
      <div style={{ position: "absolute", left: 140, top: 90, display: "flex", fontSize: 200, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>
        {"relais.".split("").map((ch, i) => {
          const p = pop(f, 0.8 + i * 0.07, { damping: 9, stiffness: 190, mass: 0.7 });
          return (
            <span key={i} style={{ display: "inline-block", color: i === 6 ? C.accent : "#fff", translate: `0 ${(1 - p) * 120}px`, opacity: clamp(p * 3), rotate: `${(1 - p) * (i % 2 ? 12 : -12)}deg`, scale: 0.6 + 0.4 * p }}>
              {ch}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, top: 305, width: barW, height: 12, borderRadius: 6, background: C.accent }} />
      <div style={{ position: "absolute", left: 140, top: 350, width: 1150 }}>
        <Kinetic mots={parseMots("Toute la *boîte_à_outils* pour Claude Code.", V.corailClair)} t0={1.4} t1={99} size={56} weight={700} align="flex-start" stagger={0.07} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 440, width: 1150 }}>
        <Kinetic mots={parseMots("Gratuit, open source, sans compte.", V.corailClair)} t0={2.0} t1={99} size={42} weight={500} align="flex-start" stagger={0.08} couleur={C.muet} />
      </div>
      {/* the five tools */}
      <div style={{ position: "absolute", left: 140, top: 535, display: "flex", gap: 14 }}>
        {OUTILS.map((o, i) => {
          const p = pop(f, 2.8 + i * 0.12, { damping: 9, stiffness: 220, mass: 0.6 });
          return (
            <div
              key={o.id}
              style={{
                width: 210,
                height: 72,
                boxSizing: "border-box",
                borderRadius: 18,
                background: C.carte,
                border: `3px solid ${o.couleur}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 16px",
                scale: p,
                opacity: clamp(p * 2),
              }}
            >
              <Icone id={o.id} size={46} />
              <div style={{ fontSize: 34, fontWeight: 700 }}>{o.nom}</div>
            </div>
          );
        })}
      </div>
      {/* where to get it */}
      <div style={{ position: "absolute", left: 140, top: 672, fontSize: 64, fontWeight: 700, color: C.muet, opacity: clamp(url * 2), translate: `0 ${(1 - url) * 30}px`, whiteSpace: "nowrap" }}>
        github.com/<span style={{ color: "#fff", fontWeight: 800 }}>nathangerardeaux/claude-relais</span>
      </div>
      <Ligne texte="/plugin marketplace add nathangerardeaux/claude-relais" t0={4.9} duree={1.5} y={808} />
      {/* mascot and the open toolbox */}
      <Robot x={1665} y={610} scale={1.35} dir={-1} mood="happy" armL={150 + Math.sin(f * 0.35) * 18} armR={20} lift={Math.max(0, Math.sin(f / 10)) * 14} look={[0.5, 0]} opacity={clamp(pop(f, 0.9) * 2)} />
      <div style={{ position: "absolute", left: 0, top: bob }}>
        <Caisse x={1345} y={520} open={0.68} glow={0.5} scale={0.62 * pop(f, 1.2, { damping: 9, stiffness: 150, mass: 0.8 })} rot={Math.sin(f / 22) * 4} />
        {OUTILS.map((o, i) => {
          const p = pop(f, 1.5 + i * 0.1, { damping: 10, stiffness: 180, mass: 0.6 });
          const a = -Math.PI * (0.15 + 0.175 * i);
          return (
            <div key={o.id} style={{ position: "absolute", left: 1325 + Math.cos(a) * 170 * p - 32, top: 390 + Math.sin(a) * 120 * p - 32 + Math.sin(f / 11 + i) * 6, scale: p, opacity: clamp(p * 2) }}>
              <Icone id={o.id} size={64} />
            </div>
          );
        })}
      </div>
      <Burst cx={1345} cy={380} t0={1.2} count={34} colors={["#fff", C.accent, V.bleuClair, V.corailClair, V.jaune]} speed={15} life={40} size={9} angle={-90} spread={300} gravity={0.3} seed={3} />
      <Burst cx={560} cy={180} t0={1.0} count={26} colors={[C.accent, "#fff", V.corailClair]} speed={14} life={36} size={7} angle={-90} spread={300} gravity={0.25} seed={11} />
      <Burst cx={700} cy={705} t0={3.95} count={22} colors={[C.accent, "#fff", V.vertClair]} speed={12} life={32} size={7} angle={-90} spread={300} gravity={0.25} seed={17} />
    </div>
  );
};
