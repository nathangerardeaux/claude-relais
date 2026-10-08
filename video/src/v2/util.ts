// Helpers shared by the v2 story (everything is driven by the global frame, times are in seconds).
import { Easing, interpolate, spring } from "remotion";
import { C } from "../theme";

export const FPS = 30;
export const sec = (x: number) => Math.round(x * FPS);
export const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const DOUX = Easing.bezier(0.16, 1, 0.3, 1);
export const INOUT = Easing.inOut(Easing.cubic);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// 0..1 progress between two instants (seconds).
export const prog = (f: number, t0: number, t1: number, easing?: (x: number) => number) =>
  interpolate(f, [t0 * FPS, t1 * FPS], [0, 1], { ...CL, easing });

// Spring starting at t0 seconds (overshoots a little: squash and stretch feeling).
export const pop = (f: number, t0: number, config?: { damping?: number; stiffness?: number; mass?: number }) =>
  spring({ frame: f - t0 * FPS, fps: FPS, config: config ?? { damping: 11, stiffness: 170, mass: 0.7 } });

// Piecewise keyframes [seconds, value].
export const keys = (f: number, pts: [number, number][], easing: (x: number) => number = INOUT) =>
  interpolate(f, pts.map((p) => p[0] * FPS), pts.map((p) => p[1]), { ...CL, easing });

// Deterministic pseudo random in [0, 1).
export const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const V = {
  corail: "#e8744c",
  corailClair: "#f59471",
  corailFonce: "#b95535",
  fer: "#3b2a24",
  papier: "#ece6d8",
  papierLigne: "#b9b19c",
  sol: "#191917",
  solFrais: "#142019",
  vertClair: "#3ddc5a",
  rougeClair: "#ff6b5e",
  jaune: "#ffd84d",
  bleuClair: "#7db4f5",
};

export const couleurCompteur = (kilo: number) => (kilo < 40 ? V.vertClair : kilo < 120 ? C.alerte : V.rougeClair);
