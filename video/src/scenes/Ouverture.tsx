import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Entree, Scene } from "../elements";
import { BORNE, C, DOUX } from "../theme";

export const Ouverture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            fontSize: 220,
            fontWeight: 800,
            letterSpacing: -6,
            opacity: interpolate(frame, [0, 0.8 * fps], [0, 1], BORNE),
            scale: interpolate(frame, [0, 0.8 * fps], [0.92, 1], { ...BORNE, easing: DOUX }),
            transformOrigin: "left center",
          }}
        >
          relais<span style={{ color: C.accent }}>.</span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 5,
            backgroundColor: C.accent,
            width: interpolate(frame, [0.4 * fps, 1.4 * fps], [0, 520], { ...BORNE, easing: DOUX }),
            margin: "20px 0 48px",
          }}
        />
        <Entree debut={1.2}>
          <div style={{ fontSize: 64, fontWeight: 600, maxWidth: 1400, lineHeight: 1.2 }}>
            Arrêtez de payer la relecture de vos conversations Claude Code.
          </div>
        </Entree>
        <Entree debut={2.6}>
          <div style={{ fontSize: 44, color: C.muet, marginTop: 32 }}>Un plugin gratuit, local, sans compte.</div>
        </Entree>
      </div>
    </Scene>
  );
};
