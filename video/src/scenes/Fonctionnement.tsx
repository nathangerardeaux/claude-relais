import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Entree, Scene, Surtitre, Titre } from "../elements";
import { BORNE, C, DOUX, MONO } from "../theme";

const Etape: React.FC<{ debut: number; numero: string; titre: React.ReactNode; detail: string }> = ({ debut, numero, titre, detail }) => (
  <Entree debut={debut} style={{ flex: 1 }}>
    <div style={{ backgroundColor: C.carte, border: `2px solid ${C.bord}`, borderRadius: 20, padding: "40px 44px", height: 360 }}>
      <div style={{ fontSize: 44, fontWeight: 700, color: C.accent }}>{numero}</div>
      <div style={{ fontSize: 56, fontWeight: 700, margin: "16px 0 20px" }}>{titre}</div>
      <div style={{ fontSize: 40, color: C.muet, lineHeight: 1.3 }}>{detail}</div>
    </div>
  </Entree>
);

const Cmd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontFamily: MONO, color: C.accent }}>{children}</span>
);

// Gauge -> /relais -> /clear, then the re-read size falls back.
export const Fonctionnement: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const taille = interpolate(frame, [9 * fps, 10.5 * fps], [520, 41], { ...BORNE, easing: DOUX });
  return (
    <Scene>
      <Entree>
        <Surtitre>Ce que fait relais</Surtitre>
        <Titre taille={88}>Un résumé court, et on repart léger.</Titre>
      </Entree>
      <div style={{ display: "flex", gap: 40, marginTop: 64 }}>
        <Etape debut={1.2} numero="1" titre="La jauge" detail="Vous prévient au-delà de 150k." />
        <Etape debut={3.2} numero="2" titre={<Cmd>/relais</Cmd>} detail="Résumé de 60 lignes max." />
        <Etape debut={5.2} numero="3" titre={<Cmd>/clear</Cmd>} detail="Session neuve, résumé rechargé." />
      </div>
      <Entree debut={8}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 56 }}>
          <div style={{ fontSize: 44, color: C.muet }}>Relu à chaque action :</div>
          <div style={{ fontSize: 96, fontWeight: 800, color: taille < 150 ? C.bon : C.critique, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(taille)}k
          </div>
        </div>
      </Entree>
    </Scene>
  );
};
