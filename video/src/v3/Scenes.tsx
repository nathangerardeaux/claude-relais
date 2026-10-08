// The eight scenes of the v3 video. Each scene runs inside its own <Sequence>: times are LOCAL seconds
// from the instant the curtain uncovers it (src/v3/temps.json). The robot and the drawing language come from v2.
import React from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { C, MONO, POLICE } from "../theme";
import { Bang, Bulle, Burst, Kinetic, Message, parseMots } from "../v2/Parts";
import { Robot } from "../v2/Robot";
import type { Mood } from "../v2/Robot";
import { DOUX, FPS, clamp, couleurCompteur, keys, lerp, pop, prog, rnd, V } from "../v2/util";
import {
  Avocat,
  Banane,
  Caisse,
  Carnet,
  Crayon,
  Decor,
  FLOOR,
  Icone,
  Interrupteur,
  LOUPE_D,
  Loupe,
  OUTILS,
  Piece,
  Pinceau,
  Poussiere,
  VIOLET,
  boutPinceau,
  main,
  marche,
  sauts,
  slot,
  tape,
  viser,
} from "./Objets";

const idle = (f: number, tired = 0) => 10 - tired * 6 + Math.sin(f / 18) * 4;
const brasHaut = (f: number) => [150 + Math.sin(f * 0.5) * 12, 150 - Math.sin(f * 0.5) * 12] as const;

// ================================================================== 1. intro: the relais toolbox opens
const BX = 1180; // toolbox
const FAN_Y = 470;
const fanX = (i: number) => 1020 + (i - 2) * 150;
export const sortieIcone = (i: number) => 3.0 + i * 0.16; // leaves the box
export const envolIcone = (i: number) => 4.4 + i * 0.12; // flies to the top bar
export const VOL = 0.55;
export const arriveeIcone = (i: number) => envolIcone(i) + VOL;

export const SceneIntro: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const pas = marche(t, 640, [{ t0: 1.9, t1: 2.5, x0: 640, x1: 910, speed: 0.55 }]);
  const jf = sauts(t, [
    { t: 0.3, h: 90, d: 0.7 },
    { t: 5.0, h: 70, d: 0.6 },
  ]);
  let armL = idle(f);
  let armR = idle(f) + Math.sin(f / 18 + 1) * 2;
  let mood: Mood = "normal";
  let look: [number, number] = [0.25, 0];
  if (pas.walking) {
    armL = 18 + Math.sin(f * pas.speed) * 24;
    armR = 18 - Math.sin(f * pas.speed) * 24;
    look = [0.6, 0];
  }
  if (t >= 0.9 && t < 1.85) {
    armR = 135 + Math.sin(f * 0.55) * 25;
    mood = "happy";
  }
  if (t >= 2.5) {
    armR = keys(f, [[2.5, 40], [2.7, 118], [2.85, 118], [3.2, 160], [3.6, 150]]);
    armL = 20;
    look = [0.7, -0.2];
  }
  if (t >= 2.85 && t < 3.25) mood = "surprised";
  if (t >= 3.25) {
    mood = "happy";
    look = [0.5, -0.7];
  }
  if (jf.lift > 2) [armL, armR] = brasHaut(f);
  const open = t >= 2.85 ? pop(f, 2.85, { damping: 9, stiffness: 160, mass: 0.7 }) * 0.68 : 0;
  const caisseS = pop(f, 1.0, { damping: 8, stiffness: 160, mass: 0.8 });

  const icones = OUTILS.map((o, i) => {
    const t0 = sortieIcone(i);
    const t1 = envolIcone(i);
    if (t < t0 || t > t1 + VOL) return null;
    let x: number;
    let y: number;
    let size = 110;
    let label = 0;
    if (t < t1) {
      const q = Easing.out(Easing.cubic)(clamp((t - t0) / 0.5));
      x = lerp(BX - 40, fanX(i), q);
      y = lerp(700, FAN_Y, q) - Math.sin(q * Math.PI) * 120;
      size = lerp(40, 110, q);
      label = pop(f, t0 + 0.35, { damping: 10, stiffness: 200, mass: 0.6 }) * (1 - prog(f, t1 - 0.15, t1));
    } else {
      const q = Easing.inOut(Easing.cubic)(clamp((t - t1) / VOL));
      const s = slot(i);
      x = lerp(fanX(i), s.x, q);
      y = lerp(FAN_Y, s.y, q) - Math.sin(q * Math.PI) * 60;
      size = lerp(110, 46, q);
    }
    return (
      <React.Fragment key={o.id}>
        <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, filter: `drop-shadow(0 0 18px ${o.couleur}aa)` }}>
          <Icone id={o.id} size={size} />
        </div>
        {label > 0.01 && (
          <div style={{ position: "absolute", left: x, top: y + 66, translate: "-50% 0", scale: label, opacity: clamp(label * 2), fontSize: 34, fontWeight: 700, color: o.couleur, whiteSpace: "nowrap" }}>{o.nom}</div>
        )}
      </React.Fragment>
    );
  });

  return (
    <AbsoluteFill>
      <Decor>
        <Caisse x={BX} y={FLOOR} open={open} glow={open > 0 ? 0.6 + 0.2 * Math.sin(f / 7) : 0} scale={caisseS} />
        <Poussiere t0={1.9} t1={2.5} xAt={(tt) => marche(tt, 640, [{ t0: 1.9, t1: 2.5, x0: 640, x1: 910 }]).x} dir={1} />
        <Robot x={pas.x} y={FLOOR} scale={pop(f, 0.3, { damping: 9, stiffness: 150, mass: 0.8 })} dir={pas.dir} walk={pas.walking} speed={pas.speed} look={look} mood={mood} armL={armL} armR={armR} squash={jf.sq} lift={jf.lift} />
        <Burst cx={BX - 30} cy={700} t0={2.85} count={34} colors={["#fff", C.accent, V.bleuClair, V.corailClair, V.jaune]} speed={16} life={38} size={9} angle={-90} spread={200} gravity={0.35} seed={4} />
        {icones}
      </Decor>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <Kinetic mots={parseMots("Voici toute la", V.corail)} t0={2.4} t1={4.9} size={76} weight={600} couleur="#cfcfc6" />
        <Kinetic mots={[{ w: "boîte", c: V.corail }, { w: "à", c: V.corail }, { w: "outils." }]} t0={2.8} t1={4.9} size={124} weight={800} />
      </div>
    </AbsoluteFill>
  );
};

// ================================================================== 2 + 3. the Relais app: tokens per conversation, then where they go
const CONVS = [
  { nom: "Page de connexion", k: 612 },
  { nom: "Bug du panier", k: 348 },
  { nom: "Tests de l'API", k: 187 },
  { nom: "Refonte du CSS", k: 96 },
  { nom: "Doc du README", k: 41 },
];
const PARTS = [
  { nom: "relectures", part: 0.8, couleur: V.corail },
  { nom: "outils", part: 0.13, couleur: C.accent },
  { nom: "sous-agents", part: 0.07, couleur: V.jaune },
];
const milliers = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const SceneAppli: React.FC<{ bascule: number; grand: [number, number, number] }> = ({ bascule, grand }) => {
  // bascule = local second where the window switches to "where they go"; grand = growth start of each part
  const f = useCurrentFrame();
  const t = f / FPS;
  const RX = 330;
  const W = { x: 620, y: 160, w: 1220, h: 660 };
  const jf = sauts(t, [{ t: 0.3, h: 80, d: 0.65 }]);
  const winS = pop(f, 0.15, { damping: 13, stiffness: 140, mass: 0.8 });
  const B = t < bascule + 0.4;
  const sortie = prog(f, bascule, bascule + 0.35, DOUX);
  const total = 1284000 * prog(f, 1.2, 3.4, Easing.out(Easing.cubic));

  let armL = idle(f);
  let armR = viser({ x: RX, y: FLOOR }, W.x + 40, 420);
  let mood: Mood = "happy";
  const look: [number, number] = [0.8, -0.3];
  if (t < 0.8) armR = idle(f);
  const choc = grand[0] + 0.9;
  if (t >= choc && t < choc + 0.8) {
    mood = "surprised";
    armL = 40;
    armR = 60;
  }
  if (jf.lift > 2) [armL, armR] = brasHaut(f);
  if (t >= bascule && t < choc) mood = "normal";

  const ligne = (c: (typeof CONVS)[number], i: number) => {
    const t0 = 3.6 + i * 0.22;
    const p = pop(f, t0, { damping: 12, stiffness: 170, mass: 0.7 });
    if (p <= 0.001) return null;
    const k = c.k * prog(f, t0, t0 + 1.2, Easing.out(Easing.cubic));
    const sel = i === 0 ? prog(f, 5.5, 5.8) : 0;
    const col = couleurCompteur(c.k);
    return (
      <div
        key={c.nom}
        style={{
          display: "flex",
          alignItems: "center",
          height: 68,
          marginBottom: 9,
          padding: "0 24px",
          borderRadius: 16,
          background: sel > 0.01 ? `rgba(28,58,94,${sel})` : "#202020",
          border: `3px solid ${sel > 0.5 ? C.accent : "transparent"}`,
          opacity: clamp(p * 2),
          translate: `${(1 - p) * 60}px 0`,
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 8, background: col, marginRight: 20 }} />
        <div style={{ width: 400, fontSize: 34, fontWeight: 600 }}>{c.nom}</div>
        <div style={{ flex: 1, height: 20, borderRadius: 10, background: "#0e0e0d", overflow: "hidden", margin: "0 30px" }}>
          <div style={{ width: `${(k / 640) * 100}%`, height: "100%", background: col, borderRadius: 10 }} />
        </div>
        <div style={{ width: 130, textAlign: "right", fontSize: 38, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: col }}>{Math.round(k)}k</div>
      </div>
    );
  };

  // "where they go"
  const tc = t - bascule;
  const parts = PARTS.map((p, i) => ({ ...p, w: p.part * prog(f, grand[i], grand[i] + (i === 0 ? 0.9 : 0.4), Easing.out(Easing.cubic)) }));
  const pulse = t > grand[0] + 0.9 ? 0.5 + 0.5 * Math.sin(f / 4) : 0;

  return (
    <AbsoluteFill>
      <Decor>
        <Robot x={RX} y={FLOOR} scale={pop(f, 0.3, { damping: 9, stiffness: 150, mass: 0.8 })} dir={1} look={look} mood={mood} armL={armL} armR={armR} squash={jf.sq} lift={jf.lift} />
        <Bang x={RX} y={FLOOR - 300} t0={choc} t1={choc + 0.9} />
        <div
          style={{
            position: "absolute",
            left: W.x,
            top: W.y,
            width: W.w,
            height: W.h,
            borderRadius: 26,
            background: C.carte,
            border: `3px solid ${C.bord}`,
            overflow: "hidden",
            transformOrigin: "0px 100%",
            scale: winS,
            opacity: clamp(winS * 2),
            boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
            fontFamily: POLICE,
          }}
        >
          <div style={{ height: 64, background: "#252522", display: "flex", alignItems: "center", gap: 10, padding: "0 24px" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
            ))}
            <div style={{ marginLeft: 18, fontSize: 30, fontWeight: 800 }}>
              Relais<span style={{ color: C.accent }}>.</span>
            </div>
            <div style={{ marginLeft: 40, display: "flex", gap: 10 }}>
              {["Vue d'ensemble", "Conversations", "Skills", "Mémoire"].map((o, i) => (
                <div key={o} style={{ fontSize: 24, padding: "6px 16px", borderRadius: 10, color: i === 1 ? "#fff" : C.muet, background: i === 1 ? C.accentDoux : "transparent" }}>
                  {o}
                </div>
              ))}
            </div>
          </div>
          {B && (
            <div style={{ position: "absolute", left: 40, right: 40, top: 96, opacity: 1 - sortie, translate: `${-sortie * 120}px 0` }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
                <div>
                  <div style={{ fontSize: 28, color: C.muet }}>tokens aujourd'hui</div>
                  <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{milliers(total)}</div>
                </div>
                <div style={{ fontSize: 30, color: C.muet, marginBottom: 14 }}>
                  <span style={{ color: "#fff", fontWeight: 800 }}>{Math.min(5, Math.floor(prog(f, 3.6, 4.6) * 5.01))}</span> conversations
                </div>
              </div>
              {CONVS.map(ligne)}
            </div>
          )}
          {tc > 0 && (
            <div style={{ position: "absolute", left: 50, right: 50, top: 100 }}>
              <div style={{ opacity: clamp(pop(f, bascule + 0.2) * 2), translate: `0 ${(1 - pop(f, bascule + 0.2)) * 30}px` }}>
                <div style={{ fontSize: 30, color: C.muet }}>Page de connexion</div>
                <div style={{ fontSize: 60, fontWeight: 800 }}>Où partent les tokens ?</div>
              </div>
              <div style={{ marginTop: 34, height: 130, borderRadius: 22, background: "#0e0e0d", border: `3px solid ${C.bord}`, display: "flex", overflow: "hidden" }}>
                {parts.map((p, i) => (
                  <div
                    key={p.nom}
                    style={{
                      width: `${p.w * 100}%`,
                      height: "100%",
                      background: p.couleur,
                      boxShadow: i === 0 && pulse > 0 ? `inset 0 0 ${30 * pulse}px rgba(255,255,255,0.45)` : "none",
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: i === 0 ? 34 : 0,
                      fontSize: 52,
                      fontWeight: 800,
                      color: "#2a1208",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {i === 0 && p.w > 0.45 ? "relectures" : ""}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 14 }}>
                {parts.map((p, i) => {
                  const q = pop(f, grand[i], { damping: 11, stiffness: 190, mass: 0.6 });
                  if (q <= 0.001) return null;
                  return (
                    <div key={p.nom} style={{ display: "flex", alignItems: "center", gap: 22, opacity: clamp(q * 2), translate: `${(1 - q) * 50}px 0` }}>
                      <div style={{ width: i === 0 ? 50 : 36, height: i === 0 ? 50 : 36, borderRadius: 10, background: p.couleur }} />
                      <div style={{ fontSize: i === 0 ? 64 : 42, fontWeight: i === 0 ? 800 : 700, color: i === 0 ? V.corailClair : "#e8e8e0" }}>{p.nom}</div>
                      {i === 0 && <div style={{ fontSize: 40, fontWeight: 700, color: C.muet }}>: la plus grosse part</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Decor>
    </AbsoluteFill>
  );
};

// ================================================================== 4. the rules registry: slip once, write it down
const BANANE_X = 960;
export const SceneRegles: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const pas = marche(t, 200, [{ t0: 0.2, t1: 1.4, x0: 200, x1: 900, speed: 0.5 }]);
  const chute = keys(f, [[1.4, 0], [1.8, -88], [2.5, -88], [2.9, 0]]);
  const rx = pas.x + keys(f, [[1.4, 0], [1.8, 40]]);
  const liftChute = t >= 1.4 && t < 1.8 ? Math.sin(((t - 1.4) / 0.4) * Math.PI) * 60 : 0;
  const allonge = t >= 1.8 && t < 2.6;
  const bananeX = BANANE_X + keys(f, [[1.4, 0], [1.9, 130]], Easing.out(Easing.cubic));
  const bananeRot = keys(f, [[1.4, 0], [1.9, 360]], Easing.out(Easing.cubic));

  const NB = { x: 1440, y: 440 };
  const nbS = pop(f, 2.9, { damping: 11, stiffness: 150, mass: 0.8 });
  const lignes = [
    { texte: "Piège : la peau de banane", t0: 3.3, duree: 0.8, gras: true },
    { texte: "→ sauter par-dessus", t0: 4.2, duree: 0.6, couleur: "#1f8a3a" },
  ];
  const curseur = (() => {
    const l = t < 4.2 ? 0 : 1;
    const n = tape(lignes[l].texte, f, lignes[l].t0, lignes[l].duree).length;
    return { x: NB.x - 290 + 34 + n * 18.5, y: NB.y - 180 + 88 + l * 62 + 46 };
  })();
  const crayon = prog(f, 3.0, 3.25) * (1 - prog(f, 5.0, 5.3));
  const note = pop(f, 5.0, { damping: 8, stiffness: 220, mass: 0.6 });

  let armL = idle(f);
  let armR = idle(f) + 2;
  let mood: Mood = "normal";
  let look: [number, number] = [0.25, 0];
  let tired = 0;
  if (pas.walking) {
    armL = 18 + Math.sin(f * pas.speed) * 24;
    armR = 18 - Math.sin(f * pas.speed) * 24;
    look = [0.6, 0];
  }
  if (t >= 1.4 && t < 2.9) {
    mood = "surprised";
    armL = 150;
    armR = 150;
  }
  if (allonge) {
    tired = 0.7;
    mood = "normal";
  }
  if (t >= 2.9) {
    armR = viser({ x: rx, y: FLOOR }, curseur.x, curseur.y) + Math.sin(f * 0.9) * 5;
    armL = 20;
    look = [0.8, -0.8];
  }
  if (t >= 5.0) {
    mood = "happy";
    armR = 140;
  }

  return (
    <AbsoluteFill>
      <Decor>
        <Banane x={bananeX} y={FLOOR} s={1.1} rot={bananeRot} opacity={pop(f, 0.1)} />
        <Poussiere t0={0.2} t1={1.4} xAt={(tt) => marche(tt, 200, [{ t0: 0.2, t1: 1.4, x0: 200, x1: 900 }]).x} dir={1} />
        <div style={{ position: "absolute", left: rx, top: FLOOR, width: 1, height: 1, rotate: `${chute}deg`, transformOrigin: "0 0", translate: `0 ${-liftChute}px` }}>
          <Robot x={0} y={0} dir={1} walk={pas.walking} speed={pas.speed} look={look} mood={mood} armL={armL} armR={armR} tired={tired} />
        </div>
        {allonge &&
          [0, 1, 2].map((j) => {
            const a = f / 6 + (j * Math.PI * 2) / 3;
            return (
              <div key={j} style={{ position: "absolute", left: rx - 200 + Math.cos(a) * 70, top: FLOOR - 120 + Math.sin(a) * 22, fontSize: 44, color: V.jaune, translate: "-50% -50%" }}>
                ★
              </div>
            );
          })}
        <Bang x={rx + 20} y={FLOOR - 300} t0={1.45} t1={2.0} />
        {t >= 2.9 && (
          <>
            <Carnet x={NB.x} y={NB.y} scale={nbS} lignes={lignes} opacity={clamp(nbS * 2)} rot={(1 - nbS) * -8} />
            <Crayon x={curseur.x + Math.sin(f * 1.3) * 4} y={curseur.y + Math.cos(f * 1.7) * 3} rot={-50} opacity={crayon} />
            {note > 0.01 && (
              <div
                style={{
                  position: "absolute",
                  left: NB.x + 150,
                  top: NB.y + 80,
                  rotate: "-12deg",
                  scale: 1 + (1 - note) * 1.2,
                  opacity: clamp(note * 2),
                  border: `6px solid ${V.vertClair}`,
                  color: V.vertClair,
                  background: "rgba(13,42,13,0.85)",
                  borderRadius: 16,
                  padding: "4px 22px",
                  fontSize: 46,
                  fontWeight: 900,
                  letterSpacing: 2,
                  whiteSpace: "nowrap",
                }}
              >
                NOTÉ ✓
              </div>
            )}
            <Burst cx={NB.x + 240} cy={NB.y + 110} t0={5.0} count={26} colors={[V.vertClair, V.jaune, "#fff"]} speed={13} life={34} size={7} angle={-90} spread={260} gravity={0.3} seed={8} />
          </>
        )}
      </Decor>
    </AbsoluteFill>
  );
};

// ================================================================== 5. next session: the notebook is read, the trap is jumped
export const SceneSession: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const X0 = 330;
  const pas = marche(t, X0, [{ t0: 2.4, t1: 3.1, x0: X0, x1: 800, speed: 0.55 }]);
  const sautT = 3.1;
  const sautD = 0.8;
  const dansSaut = t >= sautT;
  const rx = dansSaut ? lerp(800, 1190, Easing.inOut(Easing.quad)(clamp((t - sautT) / sautD))) : pas.x;
  const jf = sauts(t, [
    { t: 0.3, h: 80, d: 0.65 },
    { t: sautT, h: 150, d: sautD },
    { t: 4.3, h: 50, d: 0.5 },
  ]);

  // the notebook comes back, opens, and goes into the robot's head
  const arrive = pop(f, 0.5, { damping: 12, stiffness: 120, mass: 0.9 });
  const ouvre = pop(f, 0.8, { damping: 10, stiffness: 160, mass: 0.7 });
  const range = prog(f, 2.0, 2.4, DOUX);
  const nbX = lerp(720, X0 + 10, range);
  const nbY = lerp(lerp(-200, 380, arrive), FLOOR - 200, range);
  const nbS = 0.78 * lerp(1, 0.08, range);
  const bulb = keys(f, [[1.6, 0], [1.7, 1], [2.5, 1], [2.8, 0]], (x) => x);

  let armL = idle(f);
  let armR = idle(f) + 2;
  let mood: Mood = "normal";
  let look: [number, number] = [0.25, 0];
  if (t >= 0.6 && t < 2.4) {
    look = [0.7, -0.8];
    armR = 60;
  }
  if (t >= 1.7) mood = "happy";
  if (pas.walking) {
    armL = 18 + Math.sin(f * pas.speed) * 24;
    armR = 18 - Math.sin(f * pas.speed) * 24;
    look = [0.6, 0];
  }
  if (jf.lift > 2) [armL, armR] = brasHaut(f);
  if (t >= 4.0) [armL, armR] = brasHaut(f);

  return (
    <AbsoluteFill>
      <Decor fresh>
        <Banane x={1000} y={FLOOR} s={1.1} />
        <Poussiere t0={2.4} t1={3.1} xAt={(tt) => marche(tt, X0, [{ t0: 2.4, t1: 3.1, x0: X0, x1: 800 }]).x} dir={1} />
        <Robot x={rx} y={FLOOR} scale={pop(f, 0.25, { damping: 9, stiffness: 150, mass: 0.8 })} dir={1} walk={pas.walking} speed={pas.speed} look={look} mood={mood} armL={armL} armR={armR} squash={jf.sq} lift={jf.lift} bulb={bulb} />
        {t >= 0.5 && t < 2.4 && (
          <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: `${nbX}px ${nbY}px`, scale: `1 ${clamp(ouvre, 0, 1.2)}` }}>
            <Carnet
              x={nbX}
              y={nbY}
              scale={nbS}
              glow={1}
              opacity={1 - prog(f, 2.3, 2.4)}
              lignes={[
                { texte: "Piège : la peau de banane", t0: 0, duree: 0.01, gras: true },
                { texte: "→ sauter par-dessus", t0: 0, duree: 0.01, couleur: "#1f8a3a" },
              ]}
            />
          </div>
        )}
        <Burst cx={720} cy={380} t0={0.85} count={28} colors={[V.jaune, "#fff", V.vertClair]} speed={14} life={34} size={8} angle={-90} spread={300} gravity={0.25} seed={12} />
        <Burst cx={1000} cy={FLOOR - 60} t0={sautT + 0.4} count={16} colors={[V.vertClair, "#fff"]} speed={9} life={26} size={6} angle={-90} spread={160} gravity={0.3} seed={14} />
        <Piece x={1190} y={370} t0={4.1} />
        <Burst cx={1190} cy={370} t0={4.15} count={34} colors={[V.jaune, "#fff", V.vertClair, "#ffe98a"]} speed={16} life={40} size={9} angle={-90} spread={360} gravity={0.3} seed={15} />
      </Decor>
    </AbsoluteFill>
  );
};

// ================================================================== 6. the devil's advocate checks the answer
const CARTE = { x: 910, y: 470, w: 860, h: 400 };
const LIGNE_Y = (i: number) => CARTE.y - CARTE.h / 2 + 150 + i * 82;
export const SceneAvocat: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const RX = 290;
  const carteS = pop(f, 0.4, { damping: 12, stiffness: 150, mass: 0.8 });
  const gauche = CARTE.x - CARTE.w / 2;

  // lens path (world)
  const lx = keys(f, [
    [1.0, 2300],
    [1.7, gauche + 140],
    [2.5, gauche + 720],
    [2.65, gauche + 140],
    [3.2, gauche + 560],
    [4.5, gauche + 560],
    [4.6, gauche + 140],
    [5.1, gauche + 600],
    [5.4, gauche + 700],
    [6.2, 1500],
    [7.4, 2400],
  ]);
  const ly = keys(f, [
    [1.0, 260],
    [1.7, LIGNE_Y(0)],
    [2.5, LIGNE_Y(0)],
    [2.65, LIGNE_Y(1)],
    [4.5, LIGNE_Y(1)],
    [4.6, LIGNE_Y(2)],
    [5.4, LIGNE_Y(2)],
    [6.2, 330],
    [7.4, 300],
  ]);
  const S = 0.85;
  const bras = 82;
  const m0 = main({ x: 0, y: 0, f, bras, s: S, dir: -1 });
  const l0 = { x: m0.x + m0.ux * LOUPE_D * S, y: m0.y + m0.uy * LOUPE_D * S };
  const ax = lx - l0.x;
  const lift = (FLOOR + l0.y - ly) / S + Math.sin(f / 9) * 4;
  const hand = main({ x: ax, y: FLOOR, f, bras, s: S, dir: -1, lift });

  const statut = [t >= 2.5 ? 1 : 0, t >= 3.3 ? (t >= 4.5 ? 1 : -1) : 0, t >= 5.1 ? 1 : 0];
  const barre = prog(f, 3.3, 3.55);
  const corrige = t >= 4.0;
  const tampon = pop(f, 5.5, { damping: 8, stiffness: 220, mass: 0.6 });

  let armR = viser({ x: RX, y: FLOOR }, gauche + 20, CARTE.y + 60);
  let armL = idle(f);
  let mood: Mood = "happy";
  const look: [number, number] = [0.7, -0.4];
  if (t < 0.5) armR = idle(f);
  if (t >= 1.6 && t < 3.3) mood = "normal";
  if (t >= 3.3 && t < 4.0) {
    mood = "surprised";
    armL = 40;
  }
  if (t >= 4.0 && t < 4.5) armR += Math.sin(f * 1.4) * 14;
  if (t >= 5.5) [armL, armR] = brasHaut(f);

  const ligne = (texte: string, i: number, extra?: React.ReactNode) => {
    const st = statut[i];
    return (
      <div key={i} style={{ position: "absolute", left: 40, top: 150 + i * 82 - 32, height: 64, display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            border: `4px solid ${st === 1 ? V.vertClair : st === -1 ? V.rougeClair : C.bord}`,
            background: st === 1 ? V.vertClair : st === -1 ? V.rougeClair : "transparent",
            color: "#102010",
            fontSize: 30,
            fontWeight: 900,
            textAlign: "center",
            lineHeight: "40px",
            flexShrink: 0,
          }}
        >
          {st === 1 ? "✓" : st === -1 ? "✗" : ""}
        </div>
        <div style={{ position: "relative", fontSize: 38, fontWeight: 600, whiteSpace: "nowrap", color: "#e8e8e0" }}>
          {texte}
          {extra}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <Decor>
        <Robot x={RX} y={FLOOR} scale={pop(f, 0.2, { damping: 9, stiffness: 150, mass: 0.8 })} dir={1} look={look} mood={mood} armL={armL} armR={armR} />
        <div
          style={{
            position: "absolute",
            left: gauche,
            top: CARTE.y - CARTE.h / 2,
            width: CARTE.w,
            height: CARTE.h,
            borderRadius: 28,
            background: C.carte,
            border: `4px solid ${tampon > 0.5 ? V.vertClair : V.corail}`,
            boxShadow: tampon > 0.5 ? "0 0 60px rgba(61,220,90,0.3)" : "0 30px 60px rgba(0,0,0,0.45)",
            scale: carteS,
            opacity: clamp(carteS * 2),
            fontFamily: POLICE,
          }}
        >
          <div style={{ position: "absolute", left: 40, top: 30, display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ fontSize: 46, fontWeight: 800 }}>Réponse</div>
            <div style={{ fontSize: 30, color: C.muet }}>de Claude, avant envoi</div>
          </div>
          {ligne("Cause : le cache du navigateur", 0)}
          {corrige
            ? ligne(tape("Correctif : vider seulement le cache", f, 4.0, 0.5) || " ", 1)
            : ligne(
                "Correctif : supprimer tout le dossier",
                1,
                barre > 0 && <div style={{ position: "absolute", left: 0, top: "50%", width: `${barre * 100}%`, height: 7, marginTop: -2, borderRadius: 4, background: V.rougeClair }} />,
              )}
          {ligne("Tests : 12 / 12 passent", 2)}
          {tampon > 0.01 && (
            <div
              style={{
                position: "absolute",
                right: 40,
                bottom: 26,
                rotate: "-12deg",
                scale: 1 + (1 - tampon) * 1.4,
                opacity: clamp(tampon * 2),
                border: `7px solid ${V.vertClair}`,
                color: V.vertClair,
                background: "rgba(13,42,13,0.9)",
                borderRadius: 18,
                padding: "4px 26px",
                fontSize: 58,
                fontWeight: 900,
                letterSpacing: 3,
              }}
            >
              VÉRIFIÉ
            </div>
          )}
        </div>
        {t >= 1.0 && (
          <>
            <Avocat x={ax} y={FLOOR} scale={S} dir={-1} lift={lift} armR={bras} armL={25} mood={t >= 5.5 ? "happy" : t >= 3.3 && t < 4.0 ? "surprised" : "normal"} look={[0.9, 0.3]} />
            <Loupe hx={hand.x} hy={hand.y} ux={hand.ux} uy={hand.uy} s={S} />
            <Bang x={ax} y={FLOOR - lift * S - 290 * S} t0={3.3} t1={4.0} />
          </>
        )}
        <Burst cx={CARTE.x + 260} cy={CARTE.y + 120} t0={5.5} count={34} colors={[V.vertClair, "#fff", V.jaune, VIOLET]} speed={16} life={40} size={9} angle={-90} spread={300} gravity={0.3} seed={31} />
      </Decor>
    </AbsoluteFill>
  );
};

// ================================================================== 7. skills only where needed: per-project switches, lighter backpack
const SKILLS = [
  { nom: "remotion", couleur: C.accent },
  { nom: "frontend-design", couleur: V.corailClair },
  { nom: "pdf", couleur: V.rougeClair },
  { nom: "xlsx", couleur: "#2fbf71" },
  { nom: "dataviz", couleur: VIOLET },
];
export const SceneSkills: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const RX = 420;
  const COUPE = [99, 1.5, 1.8, 2.1, 2.4]; // switch-off times in the "video" project
  const ONGLET = 3.2; // the "site-web" project is selected
  const on = (i: number) => {
    if (t < ONGLET) return 1 - prog(f, COUPE[i], COUPE[i] + 0.15);
    if (i === 0) return 1 - prog(f, ONGLET + 0.25, ONGLET + 0.4);
    if (i === 1) return prog(f, ONGLET + 0.25, ONGLET + 0.4);
    return 0;
  };
  const charge = SKILLS.reduce((a, _, i) => a + on(i), 0);
  const tired = clamp((charge - 1) / 4) * 0.7;
  const jf = sauts(t, [
    { t: 0.25, h: 40, d: 0.5 },
    { t: 4.4, h: 80, d: 0.6 },
  ]);
  let armL = idle(f, tired);
  let armR = idle(f, tired) + 2;
  let mood: Mood = "normal";
  const look: [number, number] = [0.9, -0.3];
  if (t >= 4.3) mood = "happy";
  if (jf.lift > 2) [armL, armR] = brasHaut(f);
  const panelS = pop(f, 0.35, { damping: 13, stiffness: 140, mass: 0.8 });
  const onglet = t >= ONGLET ? 0 : 2;
  const bob = Math.sin(f / 14) * 2.2 * (1 - tired * 0.6) - tired * 2.8;

  // backpack (behind the robot, it faces right): blocks piled on top of the bag
  let pile = 0;
  const blocs = SKILLS.map((s, i) => {
    const v = on(i);
    const yBas = FLOOR - 170 - pile * 36 - jf.lift + bob;
    pile += Math.min(1, v * 1.4);
    const parti = 1 - v;
    const dx = -parti * 160;
    const dy = -Math.sin(parti * Math.PI) * 120 - parti * 40;
    if (v <= 0.01) return null;
    return (
      <div
        key={s.nom}
        style={{
          position: "absolute",
          left: RX - 176 + dx,
          top: yBas - 34 + dy,
          width: 108,
          height: 32,
          borderRadius: 8,
          background: s.couleur,
          border: "3px solid rgba(0,0,0,0.25)",
          rotate: `${(rnd(i) - 0.5) * 8 + parti * -120}deg`,
          opacity: clamp(v * 2),
        }}
      />
    );
  });

  return (
    <AbsoluteFill>
      <Decor>
        <div style={{ position: "absolute", left: RX - 186, top: FLOOR - 180 - jf.lift + bob, width: 124, height: 132, borderRadius: "34px 34px 18px 18px", background: "#7a5233", border: "4px solid #5a3a22" }}>
          <div style={{ position: "absolute", left: 12, right: 12, top: 34, height: 40, borderRadius: 12, background: "#8e6340", border: "3px solid #5a3a22" }} />
        </div>
        {blocs}
        <Robot x={RX} y={FLOOR} dir={1} look={look} mood={mood} armL={armL} armR={armR} squash={jf.sq * (1 - tired * 0.06)} lift={jf.lift} tired={tired} />
        <Bulle x={RX} y={FLOOR - 320} texte="Léger !" t0={4.4} t1={5.6} fond={V.vertClair} couleurTexte="#0d2a0d" />
        <div
          style={{
            position: "absolute",
            left: 820,
            top: 150,
            width: 980,
            height: 680,
            borderRadius: 26,
            background: C.carte,
            border: `3px solid ${C.bord}`,
            overflow: "hidden",
            scale: panelS,
            opacity: clamp(panelS * 2),
            transformOrigin: "0 100%",
            boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
            fontFamily: POLICE,
          }}
        >
          <div style={{ height: 86, background: "#252522", display: "flex", alignItems: "flex-end", gap: 8, padding: "0 24px" }}>
            {["site-web", "api", "video"].map((n, i) => {
              const actif = i === onglet;
              return (
                <div
                  key={n}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    height: 66,
                    padding: "0 26px",
                    borderRadius: "16px 16px 0 0",
                    background: actif ? C.carte : "transparent",
                    color: actif ? "#fff" : C.muet,
                    fontSize: 34,
                    fontWeight: 700,
                  }}
                >
                  <svg width={38} height={30} viewBox="0 0 38 30">
                    <path d="M2 6 a4 4 0 0 1 4 -4 H14 l4 4 H32 a4 4 0 0 1 4 4 V25 a4 4 0 0 1 -4 4 H6 a4 4 0 0 1 -4 -4 Z" fill={actif ? V.jaune : "#5a5a52"} />
                  </svg>
                  {n}
                </div>
              );
            })}
          </div>
          <div style={{ padding: "22px 44px 0", fontSize: 28, color: C.muet }}>skills actifs dans ce projet</div>
          <div style={{ padding: "10px 44px" }}>
            {SKILLS.map((s, i) => {
              const v = on(i);
              return (
                <div key={s.nom} style={{ display: "flex", alignItems: "center", height: 94, borderBottom: i < 4 ? `2px solid ${C.bord}` : "none" }}>
                  <div style={{ width: 14, height: 46, borderRadius: 7, background: s.couleur, marginRight: 26, opacity: 0.4 + 0.6 * v }} />
                  <div style={{ flex: 1, fontFamily: MONO, fontSize: 42, color: v > 0.5 ? "#fff" : C.muet }}>{s.nom}</div>
                  <Interrupteur on={v} />
                </div>
              );
            })}
          </div>
        </div>
      </Decor>
    </AbsoluteFill>
  );
};

// ================================================================== 8. the images plugin: draw, look, redo
const TOILE = { x: 1000, y: 380, w: 500, h: 370 };
const Fusee: React.FC<{ p: number; remplir: number; trait: string; strokeW: number }> = ({ p, remplir, trait, strokeW }) => {
  const d = (k: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - clamp(p * 5 - k) });
  return (
    <g stroke={trait} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M250 50 C298 98 302 196 286 262 L214 262 C198 196 202 98 250 50 Z" fill={V.papier} fillOpacity={remplir} {...d(0)} />
      <circle cx={250} cy={142} r={24} fill={C.accent} fillOpacity={remplir} {...d(1)} />
      <path d="M214 214 L176 284 L216 268 Z" fill={V.corail} fillOpacity={remplir} {...d(2)} />
      <path d="M286 214 L324 284 L284 268 Z" fill={V.corail} fillOpacity={remplir} {...d(3)} />
      <path d="M222 270 Q250 350 278 270 Z" fill={V.jaune} fillOpacity={remplir} {...d(4)} />
    </g>
  );
};
export const SceneImages: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const RX = 840;
  const essai1 = prog(f, 2.2, 3.2, (x) => x);
  const efface = prog(f, 4.4, 4.9, Easing.inOut(Easing.quad));
  const essai2 = prog(f, 5.0, 6.1, (x) => x);
  const remplir = prog(f, 6.0, 6.4);
  const peint = (t >= 2.2 && t < 3.2) || (t >= 5.0 && t < 6.1);
  const jf = sauts(t, [
    { t: 0.25, h: 70, d: 0.6 },
    { t: 6.5, h: 70, d: 0.6 },
  ]);
  let armR = peint ? 128 + Math.sin(f * 0.9) * 16 : t >= 4.4 && t < 4.9 ? 120 + Math.sin(f * 1.3) * 25 : 95;
  let armL = idle(f);
  let mood: Mood = "normal";
  let tired = 0;
  let look: [number, number] = [0.9, -0.3];
  if (t < 0.9) armR = idle(f);
  if (t >= 3.3 && t < 4.35) {
    tired = 0.6;
    look = [1, -0.4];
  }
  if (t >= 6.4) {
    mood = "happy";
    [armL, armR] = brasHaut(f);
  }
  if (jf.lift > 2) [armL] = brasHaut(f);
  const h = main({ x: RX, y: FLOOR, f, bras: armR, lift: jf.lift, tired });
  const ok = pop(f, 6.4, { damping: 8, stiffness: 220, mass: 0.6 });
  const tableauS = pop(f, 0.3, { damping: 12, stiffness: 150, mass: 0.8 });
  const bout = boutPinceau(h.x, h.y, h.ux, h.uy);

  return (
    <AbsoluteFill>
      <Decor>
        {/* easel */}
        <div style={{ position: "absolute", left: 0, top: 0, scale: tableauS, transformOrigin: `${TOILE.x + TOILE.w / 2}px ${FLOOR}px`, opacity: clamp(tableauS * 2) }}>
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
            <line x1={TOILE.x + 80} y1={TOILE.y + 200} x2={TOILE.x + 10} y2={FLOOR} stroke="#8a5a32" strokeWidth={18} strokeLinecap="round" />
            <line x1={TOILE.x + TOILE.w - 80} y1={TOILE.y + 200} x2={TOILE.x + TOILE.w - 10} y2={FLOOR} stroke="#8a5a32" strokeWidth={18} strokeLinecap="round" />
            <line x1={TOILE.x + TOILE.w / 2} y1={TOILE.y - 40} x2={TOILE.x + TOILE.w / 2} y2={FLOOR} stroke="#6e4527" strokeWidth={16} strokeLinecap="round" />
            <rect x={TOILE.x - 20} y={TOILE.y + TOILE.h} width={TOILE.w + 40} height={22} rx={8} fill="#8a5a32" />
          </svg>
          <div style={{ position: "absolute", left: TOILE.x, top: TOILE.y, width: TOILE.w, height: TOILE.h, borderRadius: 10, background: "#f7f3ea", border: "8px solid #c9a27a", boxSizing: "border-box", overflow: "hidden" }}>
            <svg width={TOILE.w - 16} height={TOILE.h - 16} viewBox="0 0 500 380" style={{ position: "absolute", left: 0, top: 0 }}>
              {t < 4.9 && (
                <g transform="translate(250 180) rotate(38) scale(1.15 0.72) translate(-250 -180)">
                  <Fusee p={essai1} remplir={0} trait="#8d8c84" strokeW={8} />
                </g>
              )}
              {t >= 5.0 && <Fusee p={essai2} remplir={remplir} trait="#2a2620" strokeW={7} />}
              {t >= 5.0 &&
                [
                  [90, 80],
                  [410, 110],
                  [380, 300],
                  [110, 290],
                ].map(([x, y], i) => <text key={i} x={x} y={y} fontSize={40} fill={V.jaune} opacity={remplir} textAnchor="middle">✦</text>)}
            </svg>
            {t >= 4.4 && t < 5.0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${efface * 100}%`, background: "#f7f3ea", boxShadow: "6px 0 0 #e4dccb" }} />}
          </div>
          <div style={{ position: "absolute", left: TOILE.x - 30, top: TOILE.y - 34, rotate: "-6deg", background: C.carte, border: `3px solid ${V.corailClair}`, borderRadius: 14, padding: "4px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: 34, fontWeight: 800 }}>
            <Icone id="images" size={38} />
            images
          </div>
          {ok > 0.01 && (
            <div style={{ position: "absolute", left: TOILE.x + TOILE.w - 60, top: TOILE.y - 30, width: 96, height: 96, borderRadius: 48, background: V.vertClair, color: "#0d2a0d", fontSize: 60, fontWeight: 900, textAlign: "center", lineHeight: "96px", scale: ok, rotate: `${(1 - ok) * -40}deg` }}>
              ✓
            </div>
          )}
        </div>
        <Robot x={RX} y={FLOOR} scale={pop(f, 0.25, { damping: 9, stiffness: 150, mass: 0.8 })} dir={1} look={look} mood={mood} armL={armL} armR={armR} squash={jf.sq} lift={jf.lift} tired={tired} />
        {t >= 0.9 && t < 6.4 && <Pinceau hx={h.x} hy={h.y} ux={h.ux} uy={h.uy} couleur={t < 5.0 ? "#8d8c84" : V.corail} />}
        {peint && <Burst cx={bout.x} cy={bout.y} t0={Math.floor(t * 4) / 4} count={4} colors={[t < 5.0 ? "#8d8c84" : V.corail, V.jaune]} speed={5} life={12} size={4} angle={0} spread={360} gravity={0.2} seed={Math.floor(t * 4)} />}
        <Bulle x={RX - 60} y={FLOOR - 320} texte="Hmm… penchée." t0={3.35} t1={4.3} fond={C.carte} bord={V.corail} />
        <Burst cx={TOILE.x + TOILE.w / 2} cy={TOILE.y + 120} t0={6.4} count={40} colors={[V.jaune, "#fff", V.corailClair, C.accent, V.vertClair]} speed={17} life={42} size={9} angle={-90} spread={320} gravity={0.35} seed={41} />
      </Decor>
      <Message texte="Dessine une fusée" t0={0.35} t1={7.6} x={80} y={190} />
    </AbsoluteFill>
  );
};
