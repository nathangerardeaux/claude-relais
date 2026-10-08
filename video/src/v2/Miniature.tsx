import React from "react";
import { C, MONO, POLICE } from "../theme";
import { Comparaison } from "./Fin";
import { V } from "./util";

// LinkedIn thumbnail of the relais video (still, rendered at frame MINIATURE_FRAME so the comparison is settled).
export const MINIATURE_FRAME = 1500;
const FOND = "rgb(16,16,15)"; // same as the comparison scene, so its edges do not show

export const Miniature: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, background: FOND, fontFamily: POLICE, color: "#fff", overflow: "hidden" }}>
    {/* comparison scene of the video, scaled down on the right */}
    <div style={{ position: "absolute", left: 930, top: 300, width: 1920, height: 1080, scale: 0.5, transformOrigin: "0 0" }}>
      <Comparaison />
    </div>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 900px 700px at 1400px 520px, rgba(57,135,229,0.13), transparent 70%)" }} />
    {/* logo */}
    <div style={{ position: "absolute", left: 110, top: 70, fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
      relais<span style={{ color: C.accent }}>.</span>
    </div>
    <div style={{ position: "absolute", left: 112, top: 205, width: 300, height: 10, borderRadius: 5, background: C.accent }} />
    {/* hook */}
    <div style={{ position: "absolute", left: 110, top: 310, fontSize: 78, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1, whiteSpace: "nowrap" }}>
      <div>Claude Code relit</div>
      <div style={{ color: V.corailClair }}>TOUTE ta conversation</div>
      <div>à chaque réponse.</div>
    </div>
    <div style={{ position: "absolute", left: 110, top: 610, width: 800, fontSize: 44, fontWeight: 500, color: C.muet, lineHeight: 1.3 }}>
      Jusqu'à <span style={{ color: V.vertClair, fontWeight: 800 }}>-75 % de tokens</span>
      <br />
      avec un plugin gratuit.
    </div>
    <div style={{ position: "absolute", left: 110, top: 820, fontFamily: MONO, fontSize: 44, background: C.carte, border: `3px solid ${C.accent}`, borderRadius: 18, padding: "18px 36px", boxShadow: "0 0 30px rgba(57,135,229,0.35)" }}>
      <span style={{ color: C.muet }}>&gt; </span>/relais
    </div>
  </div>
);
