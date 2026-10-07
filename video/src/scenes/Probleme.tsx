import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Entree, Scene, Surtitre, Titre } from "../elements";
import { BORNE, C, DOUX } from "../theme";

// The conversation grows, and every action re-reads all of it.
export const Probleme: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relu = interpolate(frame, [1.5 * fps, 7 * fps], [40, 520], { ...BORNE, easing: DOUX });
  const couleur = relu < 150 ? C.bon : relu < 300 ? C.alerte : C.critique;
  return (
    <Scene>
      <Entree>
        <Surtitre couleur={C.critique}>Le problème</Surtitre>
        <Titre>À chaque action, Claude relit toute la conversation.</Titre>
      </Entree>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Entree debut={1}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 32 }}>
            <div style={{ fontSize: 200, fontWeight: 800, color: couleur, fontVariantNumeric: "tabular-nums", minWidth: 560 }}>
              {Math.round(relu)}k
            </div>
            <div style={{ fontSize: 52, color: C.muet }}>tokens relus à chaque action</div>
          </div>
          <div style={{ height: 36, borderRadius: 18, backgroundColor: C.carte, border: `2px solid ${C.bord}`, overflow: "hidden", marginTop: 24 }}>
            <div style={{ height: "100%", width: `${(relu / 560) * 100}%`, backgroundColor: couleur, borderRadius: 18 }} />
          </div>
        </Entree>
        <Entree debut={7.5}>
          <div style={{ fontSize: 46, color: C.muet, marginTop: 48 }}>
            Une vraie conversation : <span style={{ color: C.texte, fontWeight: 600 }}>28 308 actions × 521k</span> relus en moyenne.
          </div>
        </Entree>
      </div>
    </Scene>
  );
};
