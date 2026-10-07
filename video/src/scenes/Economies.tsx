import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Entree, Scene, Surtitre } from "../elements";
import { BORNE, C, DOUX } from "../theme";

const Barre: React.FC<{ libelle: string; valeur: string; part: number; couleur: string; debut: number }> = ({ libelle, valeur, part, couleur, debut }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 44, marginBottom: 14 }}>
        <span style={{ color: C.muet }}>{libelle}</span>
        <span style={{ fontWeight: 700 }}>{valeur}</span>
      </div>
      <div style={{ height: 56, borderRadius: 12, backgroundColor: C.carte }}>
        <div
          style={{
            height: "100%",
            borderRadius: 12,
            backgroundColor: couleur,
            width: `${interpolate(frame, [debut * fps, (debut + 1) * fps], [0, part], { ...BORNE, easing: DOUX })}%`,
          }}
        />
      </div>
    </div>
  );
};

// Measured on the author's 5 biggest real conversations (README, section 3).
export const Economies: React.FC = () => (
  <Scene>
    <div style={{ display: "flex", alignItems: "center", gap: 100, flex: 1 }}>
      <Entree style={{ width: 760 }}>
        <Surtitre couleur={C.bon}>5 vraies conversations</Surtitre>
        <div style={{ fontSize: 240, fontWeight: 800, color: C.bon, lineHeight: 1, whiteSpace: "nowrap" }}>-75&nbsp;%</div>
        <div style={{ fontSize: 48, color: C.muet, marginTop: 24 }}>de tokens relus</div>
      </Entree>
      <div style={{ flex: 1 }}>
        <Entree debut={0.6}>
          <Barre libelle="Sans relais" valeur="23 034 M" part={100} couleur={C.critique} debut={1.2} />
          <Barre libelle="Avec relais" valeur="5 723 M" part={24.8} couleur={C.bon} debut={3} />
        </Entree>
      </div>
    </div>
  </Scene>
);
