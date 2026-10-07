import React from "react";
import { Entree, Scene, Surtitre, Titre } from "../elements";
import { C, MONO } from "../theme";

const Ligne: React.FC<{ children: React.ReactNode; debut: number }> = ({ children, debut }) => (
  <Entree debut={debut}>
    <div style={{ fontFamily: MONO, fontSize: 44, backgroundColor: C.carte, border: `2px solid ${C.bord}`, borderRadius: 16, padding: "28px 40px", marginBottom: 28 }}>
      <span style={{ color: C.muet }}>&gt; </span>
      {children}
    </div>
  </Entree>
);

export const Installation: React.FC = () => (
  <Scene>
    <Entree>
      <Surtitre>Installation</Surtitre>
      <Titre taille={84}>Deux commandes dans Claude Code.</Titre>
    </Entree>
    <div style={{ marginTop: 72 }}>
      <Ligne debut={1.2}>/plugin marketplace add nathangerardeaux/claude-relais</Ligne>
      <Ligne debut={2.6}>/plugin install relais@claude-relais</Ligne>
    </div>
    <Entree debut={4}>
      <div style={{ fontSize: 48, color: C.muet, marginTop: 40 }}>
        github.com/<span style={{ color: C.texte, fontWeight: 600 }}>nathangerardeaux/claude-relais</span>
      </div>
    </Entree>
  </Scene>
);
