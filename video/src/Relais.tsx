import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Audio } from "@remotion/media";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { Delegation } from "./scenes/Delegation";
import { Economies } from "./scenes/Economies";
import { Fonctionnement } from "./scenes/Fonctionnement";
import { Installation } from "./scenes/Installation";
import { Ouverture } from "./scenes/Ouverture";
import { Probleme } from "./scenes/Probleme";

// 1950 frames of scenes - 5 fades of 15 frames = 1875 frames (62.5 s at 30 fps) = the music length.
export const DUREE_RELAIS = 1875;

export const Relais: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    {/* Synthesized by outils/musique.mjs, exactly as long as the video (fades are in the file). */}
    <Audio src={staticFile("musique.mp3")} volume={0.7} />
    <TransitionSeries>
      <TransitionSeries.Sequence name="Ouverture" durationInFrames={180} premountFor={fps}>
        <Ouverture />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Problème" durationInFrames={330} premountFor={fps}>
        <Probleme />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Fonctionnement" durationInFrames={420} premountFor={fps}>
        <Fonctionnement />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Économies" durationInFrames={270} premountFor={fps}>
        <Economies />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Délégation" durationInFrames={450} premountFor={fps}>
        <Delegation />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Installation" durationInFrames={300} premountFor={fps}>
        <Installation />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    </AbsoluteFill>
  );
};
