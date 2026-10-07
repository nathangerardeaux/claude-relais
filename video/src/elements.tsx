import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BORNE, C, DOUX, POLICE } from "./theme";

// Full-frame scene background with the safe area (100px top/bottom, 140px sides).
export const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: C.fond, fontFamily: POLICE, color: C.texte, padding: "100px 140px" }}>
    {children}
  </AbsoluteFill>
);

// Fades and slides in, starting at `debut` seconds.
export const Entree: React.FC<{ debut?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ debut = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        opacity: interpolate(frame, [debut * fps, (debut + 0.6) * fps], [0, 1], BORNE),
        translate: interpolate(frame, [debut * fps, (debut + 0.6) * fps], ["0px 40px", "0px 0px"], { ...BORNE, easing: DOUX }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Surtitre: React.FC<{ children: React.ReactNode; couleur?: string }> = ({ children, couleur = C.accent }) => (
  <div style={{ fontSize: 40, fontWeight: 600, color: couleur, letterSpacing: 2, textTransform: "uppercase", marginBottom: 24 }}>{children}</div>
);

export const Titre: React.FC<{ children: React.ReactNode; taille?: number }> = ({ children, taille = 96 }) => (
  <div style={{ fontSize: taille, fontWeight: 700, lineHeight: 1.1 }}>{children}</div>
);
