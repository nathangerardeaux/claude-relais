// Colours and fonts of the relais dashboard (tableau/public/style.css, dark theme).
import { Easing } from "remotion";

export const C = {
  fond: "#121211",
  carte: "#1b1b19",
  bord: "#34342f",
  texte: "#ffffff",
  muet: "#8d8c84",
  accent: "#3987e5",
  accentDoux: "#1c3a5e",
  bon: "#0ca30c",
  alerte: "#fab219",
  critique: "#d03b3b",
};

export const POLICE = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const MONO = 'Consolas, "Cascadia Mono", monospace';

// Push without bounce, used for every entrance.
export const DOUX = Easing.bezier(0.16, 1, 0.3, 1);
export const BORNE = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
