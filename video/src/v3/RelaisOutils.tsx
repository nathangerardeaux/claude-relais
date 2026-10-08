import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import narration from "../../narration/texte-v3.json";
import { C } from "../theme";
import { Filigrane } from "../v2/RelaisV2";
import { clamp, DOUX, FPS, keys, lerp, pop, prog } from "../v2/util";
import { EndingV3, IrisV3 } from "./Fin";
import { Inventaire, Legendes, Rideau } from "./Objets";
import type { Legende } from "./Objets";
import { SceneAppli, SceneAvocat, SceneImages, SceneIntro, SceneRegles, SceneSession, SceneSkills, arriveeIcone } from "./Scenes";
import T from "./temps.json";

// "Relais, toute la boîte à outils": the second video, after RelaisV2. Same world, same robot.
// Scene changes are in temps.json (shared with outils/musique.mjs --v3, which composes public/musique-v3.mp3).
export const DUREE_V3 = Math.round(T.duree * FPS);

export type PropsV3 = { voix: "" | "femme" };
const PHRASES = narration.phrases;
const MUSIQUE = 0.7;
const SOUS_VOIX = 0.22;
const volumeMusique = (frame: number) => {
  const t = frame / FPS;
  const g = Math.max(0, ...PHRASES.map((p) => Math.min(
    interpolate(t, [p.debut - 0.35, p.debut], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(t, [p.fin, p.fin + 0.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))));
  return MUSIQUE - (MUSIQUE - SOUS_VOIX) * g;
};

// local timings of the app scene (switch to "where they go", growth of each part)
const BASCULE = T.repart - T.appli;
const GRAND: [number, number, number] = [BASCULE + 1.8, BASCULE + 2.75, BASCULE + 3.15];

const SCENES: { de: number; a: number; C: React.FC }[] = [
  { de: 0, a: T.appli, C: SceneIntro },
  { de: T.appli, a: T.regles, C: () => <SceneAppli bascule={BASCULE} grand={GRAND} /> },
  { de: T.regles, a: T.clear, C: SceneRegles },
  { de: T.clear, a: T.avocat, C: SceneSession },
  { de: T.avocat, a: T.skills, C: SceneAvocat },
  { de: T.skills, a: T.images, C: SceneSkills },
  { de: T.images, a: T.iris + 0.8, C: SceneImages },
];

const LEGENDES: Legende[] = [
  { t0: T.appli + 2.6, t1: T.repart - 0.4, texte: "Tes tokens, *conversation_par_conversation*." },
  { t0: T.repart + 0.3, t1: T.regles - 0.4, texte: "Tu vois enfin *où_ils_partent*." },
  { t0: T.regles + 0.3, t1: T.regles + 2.5, texte: "Le *registre_de_règles*." },
  { t0: T.regles + 2.6, t1: T.clear - 0.4, texte: "Chaque piège est *noté_une_fois*." },
  { t0: T.clear + 0.4, t1: T.clear + 2.4, texte: "Session suivante : *il_s'en_souvient*." },
  { t0: T.clear + 2.5, t1: T.avocat - 0.4, texte: "La même erreur, *jamais_payée_deux_fois*." },
  { t0: T.avocat + 0.4, t1: T.avocat + 2.2, texte: "*L'avocat_du_diable*." },
  { t0: T.avocat + 2.3, t1: T.avocat + 4.6, texte: "Il essaie de *démonter* chaque réponse." },
  { t0: T.avocat + 4.8, t1: T.skills - 0.4, texte: "*Vérifiée* avant de t'arriver." },
  { t0: T.skills + 0.4, t1: T.skills + 2.6, texte: "Les *skills*, seulement là où il faut." },
  { t0: T.skills + 2.7, t1: T.skills + 4.1, texte: "Activés *par_projet*." },
  { t0: T.skills + 4.2, t1: T.images - 0.4, texte: "Le contexte reste *léger*." },
  { t0: T.images + 0.4, t1: T.images + 2.2, texte: "Des *plugins_maison*, comme *images*." },
  { t0: T.images + 2.3, t1: T.iris - 0.2, texte: "Il dessine, *regarde*, et *recommence*." },
];

// current tool lit in the top bar
const PLAGES: [number, number][] = [
  [T.appli, T.regles],
  [T.regles, T.avocat],
  [T.avocat, T.skills],
  [T.skills, T.images],
  [T.images, T.iris + 1],
];

export const RelaisOutils: React.FC<PropsV3> = ({ voix }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const actif = (i: number) => clamp(prog(f, PLAGES[i][0] - 0.1, PLAGES[i][0] + 0.25) - prog(f, PLAGES[i][1] - 0.1, PLAGES[i][1] + 0.2));

  // logo: big title first (callback to the first video), then in the corner
  const logoP = keys(f, [[1.9, 0], [2.6, 1]], DOUX);
  const logoX = lerp(960, 1745, logoP);
  const logoY = lerp(400, 78, logoP);
  const logoS = lerp(1, 0.25, logoP);
  const barW = interpolate(f, [0.7 * FPS, 1.6 * FPS], [0, 560], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: DOUX }) * (1 - prog(f, 1.8, 2.2));
  const avantFin = t < T.iris + 0.7;

  return (
    <AbsoluteFill style={{ backgroundColor: C.fond }}>
      <Audio src={staticFile("musique-v3.mp3")} volume={voix ? volumeMusique : MUSIQUE} />
      {voix && PHRASES.map((p) => (
        <Sequence key={p.id} from={Math.round(p.debut * FPS)} layout="none">
          <Audio src={staticFile(`voix-v3/${voix}/${p.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      {SCENES.map((s, i) => (
        <Sequence key={i} from={Math.round(s.de * FPS)} durationInFrames={Math.round((s.a - s.de) * FPS)}>
          <s.C />
        </Sequence>
      ))}

      {avantFin && (
        <>
          <Inventaire arrivee={arriveeIcone} actif={actif} />
          <div style={{ position: "absolute", left: logoX, top: logoY, translate: "-50% -50%", scale: logoS, fontSize: 230, fontWeight: 800, letterSpacing: -6, display: "flex", whiteSpace: "nowrap", fontFamily: '"Segoe UI", system-ui, sans-serif', color: "#fff" }}>
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
          <Legendes items={LEGENDES} />
        </>
      )}

      <Rideau t={T.appli} texte="l'appli" />
      <Rideau t={T.regles} texte="/regles" />
      <Rideau t={T.clear} texte="/clear" />
      <Rideau t={T.avocat} texte="/avocat" />
      <Rideau t={T.skills} texte="skills" />
      <Rideau t={T.images} texte="images" />

      <Sequence from={Math.round(T.iris * FPS)} layout="none">
        <IrisV3 />
        <EndingV3 />
      </Sequence>
      <Filigrane />
    </AbsoluteFill>
  );
};

