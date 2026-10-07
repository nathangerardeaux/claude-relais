import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Entree, Scene, Surtitre, Titre } from "../elements";
import { BORNE, C, DOUX } from "../theme";

const Boite: React.FC<{ titre: string; sous: string; couleur: string }> = ({ titre, sous, couleur }) => (
  <div style={{ backgroundColor: C.carte, border: `3px solid ${couleur}`, borderRadius: 20, padding: "32px 40px", width: 520 }}>
    <div style={{ fontSize: 52, fontWeight: 700 }}>{titre}</div>
    <div style={{ fontSize: 38, color: C.muet, marginTop: 10 }}>{sous}</div>
  </div>
);

const Chiffre: React.FC<{ valeur: string; libelle: string; debut: number }> = ({ valeur, libelle, debut }) => (
  <Entree debut={debut} style={{ flex: 1 }}>
    <div style={{ fontSize: 80, fontWeight: 800, color: C.bon, whiteSpace: "nowrap" }}>{valeur}</div>
    <div style={{ fontSize: 40, color: C.muet, marginTop: 8 }}>{libelle}</div>
  </Entree>
);

// New in 2.1.0: long tasks go to a cheaper subagent (measures: docs/delegation.md).
export const Delegation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fleche = interpolate(frame, [2.5 * fps, 4 * fps], [0, 1], { ...BORNE, easing: DOUX });
  return (
    <Scene>
      <Entree>
        <Surtitre>Nouveau dans la 2.1</Surtitre>
        <Titre taille={84}>Les longues tâches partent chez un sous&#8209;agent moins cher.</Titre>
      </Entree>
      <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 64 }}>
        <Entree debut={1.2}>
          <Boite titre="Votre session" sous="Opus · garde l'historique" couleur={C.bord} />
        </Entree>
        <div style={{ flex: 1, height: 8, backgroundColor: C.carte, borderRadius: 4, position: "relative" }}>
          <div style={{ height: "100%", width: `${fleche * 100}%`, backgroundColor: C.accent, borderRadius: 4 }} />
          <div style={{ position: "absolute", top: -64, left: 0, right: 0, textAlign: "center", fontSize: 36, color: C.muet, opacity: fleche }}>
            consigne autonome
          </div>
        </div>
        <Entree debut={3.8}>
          <Boite titre="Sous-agent" sous="Sonnet · lit les fichiers" couleur={C.accent} />
        </Entree>
      </div>
      <div style={{ display: "flex", gap: 60, marginTop: 80 }}>
        <Chiffre debut={6} valeur="-20 à -39 %" libelle="sur une longue tâche" />
        <Chiffre debut={8} valeur="190k → 132k" libelle="conversation après la tâche" />
        <Chiffre debut={10} valeur="90" libelle="tokens par session, une fois" />
      </div>
    </Scene>
  );
};
