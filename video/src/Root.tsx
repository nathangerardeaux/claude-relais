import { Composition, Folder } from "remotion";
import { DUREE_RELAIS, Relais } from "./Relais";
import { Delegation } from "./scenes/Delegation";
import { Economies } from "./scenes/Economies";
import { Fonctionnement } from "./scenes/Fonctionnement";
import { Installation } from "./scenes/Installation";
import { Ouverture } from "./scenes/Ouverture";
import { Probleme } from "./scenes/Probleme";
import { DUREE_V2, RelaisV2 } from "./v2/RelaisV2";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Scenes">
        <Composition id="Ouverture" component={Ouverture} durationInFrames={180} fps={30} width={1920} height={1080} />
        <Composition id="Probleme" component={Probleme} durationInFrames={330} fps={30} width={1920} height={1080} />
        <Composition id="Fonctionnement" component={Fonctionnement} durationInFrames={420} fps={30} width={1920} height={1080} />
        <Composition id="Economies" component={Economies} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="Delegation" component={Delegation} durationInFrames={450} fps={30} width={1920} height={1080} />
        <Composition id="Installation" component={Installation} durationInFrames={300} fps={30} width={1920} height={1080} />
      </Folder>
      <Composition id="Relais" component={Relais} durationInFrames={DUREE_RELAIS} fps={30} width={1920} height={1080} />
      <Composition id="RelaisV2" component={RelaisV2} durationInFrames={DUREE_V2} fps={30} width={1920} height={1080} defaultProps={{ voix: "" as const }} />
    </>
  );
};
