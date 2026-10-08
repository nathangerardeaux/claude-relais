import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, V } from "./util";

export type Mood = "normal" | "happy" | "surprised";

export type RobotProps = {
  x: number; // feet position in the world
  y: number;
  scale?: number;
  dir?: number; // 1 faces right, -1 faces left, in between = turning
  walk?: boolean;
  speed?: number; // walk cycle, radians per frame
  tired?: number; // 0..1: half closed eyes, droopy antenna, sweat
  heat?: number; // 0..1: head turns red, steam
  look?: [number, number]; // pupils, -1..1 (x is "forward")
  mood?: Mood;
  armL?: number; // degrees outward from hanging down
  armR?: number;
  squash?: number; // vertical scale of the body (1 = none)
  lift?: number; // jump height in px
  bulb?: number; // 0..1 idea light on the antenna
  opacity?: number;
};

const FACE = "#1a1210";
const CREME = "#ffe9d6";

// A small round robot drawn only with SVG shapes. Feet are at (110, 280) of a 220 x 300 box.
export const Robot: React.FC<RobotProps> = ({
  x,
  y,
  scale = 1,
  dir = 1,
  walk = false,
  speed = 0.4,
  tired = 0,
  heat = 0,
  look = [0.25, 0],
  mood = "normal",
  armL = 10,
  armR = 10,
  squash = 1,
  lift = 0,
  bulb = 0,
  opacity = 1,
}) => {
  const f = useCurrentFrame();
  const phase = f * speed;
  const bob = walk ? Math.abs(Math.sin(phase)) * 7 : Math.sin(f / 14) * 2.2 * (1 - tired * 0.6);
  const legA = walk ? Math.sin(phase) * 30 : 0;
  const slump = tired * 7;
  const tilt = tired * 7 * Math.sin(f / 40) + (walk ? Math.sin(phase) * 2.5 : 0) + tired * 5;
  const ant = tired * 38 + Math.sin(f / 9) * (6 - tired * 4) + (walk ? Math.sin(phase * 2) * 8 : 0);
  const bph = (f + 37) % 110;
  const blink = bph < 5 ? 1 - Math.sin((bph / 5) * Math.PI) * 0.88 : 1;
  const lid = clamp(tired * 0.85);
  const sx = 1 / Math.sqrt(squash);
  const eyes: [number, number][] = [
    [86, 82],
    [134, 82],
  ];
  const ballColor = bulb > 0.05 ? V.jaune : heat > 0.4 ? V.rougeClair : V.corailClair;
  const nbDrops = Math.ceil(tired * 3.2);
  const lights = heat > 0.5 ? [V.rougeClair, V.rougeClair, V.rougeClair] : [C.accent, C.alerte, V.vertClair];

  return (
    <div
      style={{
        position: "absolute",
        left: x - 110,
        top: y - 280,
        width: 220,
        height: 300,
        transformOrigin: "110px 280px",
        scale,
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg width={220} height={300} viewBox="0 0 220 300" style={{ overflow: "visible" }}>
        {/* shadow stays on the floor while the robot jumps */}
        <ellipse cx={110} cy={282} rx={Math.max(20, 62 - lift * 0.35)} ry={9} fill="#000" opacity={Math.max(0.12, 0.4 - lift * 0.004)} />
        <g transform={`translate(110 0) scale(${dir} 1) translate(-110 0)`}>
          <g transform={`translate(0 ${-lift}) translate(110 280) scale(${sx} ${squash}) translate(-110 -280)`}>
            {/* legs */}
            {[84, 136].map((hx, i) => (
              <g key={hx} transform={`translate(${hx} ${222 - bob * 0.2}) rotate(${i === 0 ? legA : -legA})`}>
                <rect x={-8} y={0} width={16} height={50} rx={8} fill={V.fer} />
                <rect x={-15} y={42} width={32} height={17} rx={8.5} fill={V.corailFonce} />
              </g>
            ))}
            <g transform={`translate(0 ${-bob + slump * 0.4})`}>
              {/* body */}
              <rect x={60} y={138} width={100} height={90} rx={28} fill={V.corail} />
              <rect x={68} y={148} width={9} height={58} rx={4.5} fill={V.corailClair} opacity={0.55} />
              <rect x={82} y={166} width={56} height={40} rx={14} fill="#2a1d18" />
              {lights.map((c, i) => (
                <circle key={i} cx={96 + i * 14} cy={186} r={5} fill={c} opacity={0.55 + 0.45 * Math.sin(f / 6 + i * 2)} />
              ))}
              <rect x={98} y={126} width={24} height={16} fill={V.fer} />
              {/* arms (drawn after the body so they stay visible) */}
              <g transform={`translate(58 166) rotate(${armL})`}>
                <rect x={-8} y={-4} width={16} height={58} rx={8} fill={V.corailFonce} />
                <circle cx={0} cy={56} r={11} fill={V.corailClair} />
              </g>
              <g transform={`translate(162 166) rotate(${-armR})`}>
                <rect x={-8} y={-4} width={16} height={58} rx={8} fill={V.corailFonce} />
                <circle cx={0} cy={56} r={11} fill={V.corailClair} />
              </g>
              {/* head */}
              <g transform={`translate(0 ${slump}) translate(110 128) rotate(${tilt}) translate(-110 -128)`}>
                <g transform={`translate(110 38) rotate(${ant})`}>
                  {bulb > 0.05 && <circle cx={0} cy={-34} r={14 + 26 * bulb} fill={V.jaune} opacity={0.4 * bulb} />}
                  {heat > 0.35 &&
                    [0, 1, 2].map((j) => {
                      const q = ((f + j * 11) % 33) / 33;
                      return <circle key={j} cx={Math.sin(q * 6 + j) * 14} cy={-44 - q * 70} r={6 + q * 16} fill="#d8d4cc" opacity={(1 - q) * 0.55 * heat} />;
                    })}
                  <rect x={-2.5} y={-28} width={5} height={30} rx={2.5} fill={V.fer} />
                  <circle cx={0} cy={-32} r={9 + bulb * 3} fill={ballColor} />
                </g>
                <rect x={28} y={66} width={14} height={32} rx={7} fill={V.corailFonce} />
                <rect x={178} y={66} width={14} height={32} rx={7} fill={V.corailFonce} />
                <rect x={38} y={36} width={144} height={94} rx={34} fill={V.corailClair} />
                <rect x={46} y={42} width={60} height={9} rx={4.5} fill="#fff" opacity={0.22} />
                {heat > 0.02 && <rect x={38} y={36} width={144} height={94} rx={34} fill="#ff2d20" opacity={heat * 0.5} />}
                <rect x={52} y={52} width={116} height={64} rx={24} fill={FACE} />
                <ellipse cx={66} cy={102} rx={8} ry={4.5} fill="#ff8f8a" opacity={0.5} />
                <ellipse cx={154} cy={102} rx={8} ry={4.5} fill="#ff8f8a" opacity={0.5} />
                {eyes.map(([ex, ey], i) =>
                  mood === "happy" ? (
                    <path key={i} d={`M ${ex - 11} ${ey + 5} Q ${ex} ${ey - 13} ${ex + 11} ${ey + 5}`} stroke={CREME} strokeWidth={6.5} strokeLinecap="round" fill="none" />
                  ) : (
                    <g key={i} transform={`translate(${ex} ${ey}) scale(1 ${blink}) translate(${-ex} ${-ey})`}>
                      <ellipse cx={ex} cy={ey} rx={mood === "surprised" ? 13 : 11} ry={mood === "surprised" ? 18 : 14} fill={CREME} />
                      <circle cx={ex + look[0] * 4.5} cy={ey + look[1] * 6} r={mood === "surprised" ? 4.5 : 5.8} fill="#2a1a12" />
                      <circle cx={ex + look[0] * 4.5 + 1.8} cy={ey + look[1] * 6 - 2} r={1.7} fill="#fff" />
                      {lid > 0.02 && (
                        <polygon
                          points={
                            i === 0
                              ? `${ex - 14},${ey - 20} ${ex + 14},${ey - 20} ${ex + 14},${ey - 18 + 30 * lid * 0.55} ${ex - 14},${ey - 18 + 30 * lid}`
                              : `${ex - 14},${ey - 20} ${ex + 14},${ey - 20} ${ex + 14},${ey - 18 + 30 * lid} ${ex - 14},${ey - 18 + 30 * lid * 0.55}`
                          }
                          fill={FACE}
                        />
                      )}
                    </g>
                  ),
                )}
                {mood === "happy" ? (
                  <path d="M 98 98 Q 110 110 122 98" stroke={CREME} strokeWidth={4} strokeLinecap="round" fill="none" />
                ) : mood === "surprised" ? (
                  <ellipse cx={110} cy={103} rx={5} ry={6} fill={CREME} />
                ) : tired > 0.5 ? (
                  <path d="M 100 104 Q 105 99 110 104 Q 115 109 120 104" stroke={CREME} strokeWidth={3.5} strokeLinecap="round" fill="none" />
                ) : (
                  <path d="M 101 100 Q 110 106 119 100" stroke={CREME} strokeWidth={3.5} strokeLinecap="round" fill="none" />
                )}
                {Array.from({ length: nbDrops }).map((_, j) => {
                  const q = ((f + j * 9) % 27) / 27;
                  const dx = [32, 188, 50][j] ?? 40;
                  return (
                    <path
                      key={j}
                      transform={`translate(${dx} ${58 + q * 56})`}
                      d="M0 -10 Q8 2 0 8 Q-8 2 0 -10"
                      fill="#8fd3ff"
                      opacity={clamp((1 - q) * 1.6) * 0.95}
                    />
                  );
                })}
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
};
