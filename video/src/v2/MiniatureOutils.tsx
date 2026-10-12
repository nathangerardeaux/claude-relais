import React from "react";
import { Img, staticFile } from "remotion";
import { C, POLICE } from "../theme";
import { V } from "./util";

// LinkedIn thumbnail of the 1.0.7 post: the whole toolbox on the left, a real capture of the app on the right
// (day detail, cropped so neither the account panel nor any conversation title shows).
const FOND = "rgb(16,16,15)";
const ECHELLE = 0.88;
const CARTE = { left: 965, top: 455 };
// "Relus (cache) : 254 M (97 %)" legend inside the capture (pixels of miniature-jour.png)
const LEGENDE = { x: 12, y: 418, w: 186, h: 26 };

// Hand-drawn line icons (24x24 grid), never emoji.
const ICONES: Record<string, React.ReactNode> = {
  relais: <><path d="M4 9h13l-3-3M20 15H7l3 3" /></>,
  regles: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  avocat: <><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></>,
  images: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></>,
  tableau: <><path d="M4 20h16" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="6" width="3" height="12" /><rect x="16" y="13" width="3" height="5" /></>,
};
const Icone: React.FC<{ nom: string; couleur: string }> = ({ nom, couleur }) => (
  <svg width={50} height={50} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{ICONES[nom]}</svg>
);

const OUTILS: { icone: string; titre: string; detail: string; couleur: string }[] = [
  { icone: "relais", titre: "Le relais", detail: "jusqu'à -75 % de tokens", couleur: V.vertClair },
  { icone: "regles", titre: "Les règles", detail: "Claude retient ses erreurs", couleur: V.bleuClair },
  { icone: "avocat", titre: "L'avocat du diable", detail: "réfute chaque réponse", couleur: V.corailClair },
  { icone: "images", titre: "Les images", detail: "générées par Claude", couleur: V.jaune },
  { icone: "tableau", titre: "Le tableau de bord", detail: "ta conso, en local", couleur: C.accent },
];

export const MiniatureOutils: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, background: FOND, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 900px 700px at 1420px 500px, rgba(57,135,229,0.16), transparent 70%)" }} />
    {/* logo */}
    <div style={{ position: "absolute", left: 110, top: 64, fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
      relais<span style={{ color: C.accent }}>.</span>
    </div>
    <div style={{ position: "absolute", left: 112, top: 190, width: 280, height: 10, borderRadius: 5, background: C.accent }} />
    {/* title */}
    <div style={{ position: "absolute", left: 110, top: 250, fontSize: 70, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, whiteSpace: "nowrap" }}>
      <div>La boîte à outils</div>
      <div>gratuite pour <span style={{ color: V.corailClair }}>Claude Code</span></div>
    </div>
    {/* toolbox */}
    <div style={{ position: "absolute", left: 110, top: 455, display: "flex", flexDirection: "column", gap: 20 }}>
      {OUTILS.map((o) => (
        <div key={o.titre} style={{ display: "flex", alignItems: "center", gap: 24, background: C.carte, border: `2px solid ${C.bord}`, borderLeft: `8px solid ${o.couleur}`, borderRadius: 16, padding: "12px 28px 12px 20px", width: 800 }}>
          <Icone nom={o.icone} couleur={o.couleur} />
          <span style={{ fontSize: 38, fontWeight: 800, whiteSpace: "nowrap" }}>{o.titre}</span>
          <span style={{ fontSize: 29, color: C.muet, whiteSpace: "nowrap", marginLeft: "auto" }}>{o.detail}</span>
        </div>
      ))}
    </div>
    {/* real capture of the app */}
    <div style={{ position: "absolute", left: CARTE.left, top: CARTE.top, width: 981, height: 482, scale: ECHELLE, transformOrigin: "0 0", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.08)" }}>
      <Img src={staticFile("miniature-jour.png")} style={{ display: "block" }} />
      <div style={{ position: "absolute", left: LEGENDE.x - 8, top: LEGENDE.y - 6, width: LEGENDE.w + 16, height: LEGENDE.h + 12, border: `4px solid ${V.corail}`, borderRadius: 12 }} />
    </div>
    {/* callout under the capture */}
    <div style={{ position: "absolute", left: CARTE.left, top: CARTE.top + 482 * ECHELLE + 34, fontSize: 38, fontWeight: 600, color: C.muet, whiteSpace: "nowrap" }}>
      <span style={{ color: V.corailClair, fontWeight: 800 }}>97 %</span> des tokens d'une journée : de la relecture.
    </div>
    {/* version badge */}
    <div style={{ position: "absolute", right: 70, top: 92, fontSize: 34, fontWeight: 700, padding: "12px 28px", borderRadius: 999, background: C.accentDoux, border: `2px solid ${C.accent}` }}>
      v1.0.7 · open source
    </div>
  </div>
);
