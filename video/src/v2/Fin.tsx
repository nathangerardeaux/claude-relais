import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { Burst, BoxRelais, Kinetic, parseMots } from "./Parts";
import { Robot } from "./Robot";
import { CL, DOUX, FPS, clamp, couleurCompteur, pop, prog, V } from "./util";

// ------------------------------------------------------------------ side by side: without / with relais (41.2 s to 46 s)
const Carte: React.FC<{ x: number; titre: string; avec: boolean; kilo: number; max: number; t0: number }> = ({ x, titre, avec, kilo, max, t0 }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 12, stiffness: 140, mass: 0.9 });
  const col = couleurCompteur(kilo);
  const bar = 560 * clamp(kilo / max);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 90,
        width: 660,
        height: 740,
        borderRadius: 36,
        background: C.carte,
        border: `4px solid ${avec ? "rgba(61,220,90,0.7)" : "rgba(208,59,59,0.7)"}`,
        scale: p,
        opacity: clamp(p * 2),
        boxShadow: `0 0 60px ${avec ? "rgba(61,220,90,0.25)" : "rgba(208,59,59,0.3)"}`,
        fontFamily: POLICE,
      }}
    >
      <div style={{ position: "absolute", left: 40, top: 32, fontSize: 38, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: avec ? "#0d2a0d" : "#fff", background: avec ? V.vertClair : C.critique, borderRadius: 14, padding: "6px 22px" }}>
        {titre}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, height: 330 }}>
        <Robot x={330} y={310} scale={1.05} dir={1} tired={avec ? 0 : 1} heat={avec ? 0 : 0.6} mood={avec ? "happy" : "normal"} armL={avec ? 150 + Math.sin(f * 0.5) * 12 : 8} armR={avec ? 150 - Math.sin(f * 0.5) * 12 : 8} look={[0.2, 0]} />
      </div>
      <div style={{ position: "absolute", left: 40, top: 480, fontSize: 30, color: C.muet }}>tokens relus à chaque appel</div>
      <div style={{ position: "absolute", left: 40, top: 508, fontSize: 150, fontWeight: 800, lineHeight: 1.1, color: avec ? V.vertClair : col, fontVariantNumeric: "tabular-nums" }}>
        {avec ? "~" : ""}
        {Math.round(kilo)}k
      </div>
      <div style={{ position: "absolute", left: 40, top: 690, width: 580, height: 28, borderRadius: 14, background: "#0e0e0d", border: `2px solid ${C.bord}`, overflow: "hidden" }}>
        <div style={{ width: Math.max(bar, kilo > 0.2 ? 9 : 0), height: "100%", background: avec ? V.vertClair : col, borderRadius: 14 }} />
      </div>
    </div>
  );
};

export const Comparaison: React.FC = () => {
  const f = useCurrentFrame();
  const fond = prog(f, 41.2, 41.7);
  const gauche = 191 * prog(f, 42.2, 43.5, Easing.out(Easing.cubic));
  const droite = 3 * prog(f, 42.5, 43.3, Easing.out(Easing.cubic));
  const badge = pop(f, 43.8, { damping: 8, stiffness: 200, mass: 0.7 });
  return (
    <div style={{ position: "absolute", inset: 0, background: `rgba(16,16,15,${0.985 * fond})` }}>
      <Carte x={200} titre="Sans relais" avec={false} kilo={gauche} max={200} t0={41.5} />
      <Carte x={1060} titre="Avec relais" avec kilo={droite} max={200} t0={41.9} />
      <div
        style={{
          position: "absolute",
          left: 960 - 105,
          top: 470,
          width: 210,
          height: 210,
          borderRadius: "50%",
          background: C.accent,
          color: "#fff",
          fontFamily: POLICE,
          fontWeight: 800,
          fontSize: 76,
          textAlign: "center",
          lineHeight: "210px",
          scale: badge,
          rotate: `${(1 - badge) * -40}deg`,
          opacity: clamp(badge * 2),
          boxShadow: "0 0 70px rgba(57,135,229,0.7)",
        }}
      >
        ÷60
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ ending: what it is, how to get it (46 s to 56 s)
const TAPE = (texte: string, t0: number, duree: number, f: number) => texte.slice(0, Math.floor(clamp((f - t0 * FPS) / (duree * FPS)) * texte.length));

const Ligne: React.FC<{ texte: string; t0: number; duree: number; y: number }> = ({ texte, t0, duree, y }) => {
  const f = useCurrentFrame();
  const p = pop(f, t0, { damping: 14, stiffness: 160, mass: 0.8 });
  if (p <= 0.001) return null;
  const typed = TAPE(texte, t0 + 0.2, duree, f);
  const fini = typed.length >= texte.length;
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: y,
        fontFamily: MONO,
        fontSize: 42,
        background: C.carte,
        border: `3px solid ${fini ? C.accent : C.bord}`,
        borderRadius: 18,
        padding: "20px 40px",
        opacity: clamp(p * 2),
        translate: `0 ${(1 - p) * 40}px`,
        whiteSpace: "nowrap",
        boxShadow: fini ? "0 0 30px rgba(57,135,229,0.35)" : "none",
      }}
    >
      <span style={{ color: C.muet }}>&gt; </span>
      {typed}
      {!fini && <span style={{ display: "inline-block", width: 18, height: 40, background: C.accent, verticalAlign: "middle", marginLeft: 2 }} />}
    </div>
  );
};

export const Ending: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = interpolate(f, [45.95 * FPS, 46.65 * FPS], [0, 1700], { ...CL, easing: Easing.out(Easing.cubic) });
  if (reveal <= 0) return null;
  const barW = interpolate(f, [46.9 * FPS, 47.6 * FPS], [0, 520], { ...CL, easing: DOUX });
  const bob = Math.sin(f / 16) * 10;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.fond, clipPath: `circle(${reveal}px at 960px 540px)`, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 1000, top: -100, width: 1200, height: 1100, background: "radial-gradient(ellipse at center, rgba(57,135,229,0.22), transparent 65%)" }} />
      {/* logo */}
      <div style={{ position: "absolute", left: 140, top: 70, display: "flex", fontSize: 200, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>
        {"relais.".split("").map((ch, i) => {
          const p = pop(f, 46.5 + i * 0.07, { damping: 9, stiffness: 190, mass: 0.7 });
          return (
            <span key={i} style={{ display: "inline-block", color: i === 6 ? C.accent : "#fff", translate: `0 ${(1 - p) * 120}px`, opacity: clamp(p * 3), rotate: `${(1 - p) * (i % 2 ? 12 : -12)}deg`, scale: 0.6 + 0.4 * p }}>
              {ch}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, top: 285, width: barW, height: 12, borderRadius: 6, background: C.accent }} />
      <div style={{ position: "absolute", left: 140, top: 335, width: 1120 }}>
        <Kinetic mots={parseMots("Arrêtez de payer la *relecture* de vos conversations Claude Code.", V.corailClair)} t0={47.5} t1={99} size={54} weight={600} align="flex-start" stagger={0.07} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 520, width: 1120 }}>
        <Kinetic mots={parseMots("Un plugin gratuit, local, sans compte.", V.corailClair)} t0={49.0} t1={99} size={42} weight={500} align="flex-start" stagger={0.08} couleur={C.muet} />
      </div>
      <Ligne texte="/plugin marketplace add nathangerardeaux/claude-relais" t0={50.2} duree={1.5} y={640} />
      <Ligne texte="/plugin install relais@claude-relais" t0={52.0} duree={1.0} y={770} />
      <div style={{ position: "absolute", left: 140, top: 930, fontSize: 48, color: C.muet, opacity: pop(f, 53.4), translate: `0 ${(1 - pop(f, 53.4)) * 30}px` }}>
        github.com/<span style={{ color: "#fff", fontWeight: 600 }}>nathangerardeaux/claude-relais</span>
      </div>
      {/* mascot */}
      <Robot x={1610} y={560} scale={1.35} dir={-1} mood="happy" armL={150 + Math.sin(f * 0.35) * 18} armR={20} lift={Math.max(0, Math.sin(f / 10)) * 14} look={[0.5, 0]} opacity={clamp(pop(f, 46.7) * 2)} />
      <div style={{ position: "absolute", left: 0, top: bob }}>
        <BoxRelais x={1360} y={420} open={0} glow={0.5} scale={0.9 * pop(f, 47.0, { damping: 9, stiffness: 150, mass: 0.8 })} rot={Math.sin(f / 22) * 5} />
      </div>
      <Burst cx={1360} cy={330} t0={47.0} count={34} colors={["#fff", C.accent, V.bleuClair, V.corailClair, V.jaune]} speed={15} life={40} size={9} angle={-90} spread={300} gravity={0.3} seed={3} />
      {[49.2, 51.4, 53.6].map((tt) => (
        <Burst key={tt} cx={1360} cy={330} t0={tt} count={14} colors={["#fff", C.accent, V.bleuClair]} speed={11} life={32} size={6} angle={-90} spread={300} gravity={0.25} seed={tt} />
      ))}
      <Burst cx={560} cy={190} t0={46.7} count={26} colors={[C.accent, "#fff", V.corailClair]} speed={14} life={36} size={7} angle={-90} spread={300} gravity={0.25} seed={11} />
    </div>
  );
};

export const Iris: React.FC = () => {
  const f = useCurrentFrame();
  const r = interpolate(f, [45.5 * FPS, 46.2 * FPS], [0, 1700], { ...CL, easing: Easing.in(Easing.cubic) });
  if (r <= 0 || f > 46.7 * FPS) return null;
  return <div style={{ position: "absolute", inset: 0, background: C.accent, clipPath: `circle(${r}px at 960px 540px)` }} />;
};

