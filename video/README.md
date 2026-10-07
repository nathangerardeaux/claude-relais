# Vidéo de présentation de relais (Remotion)

Source de `docs/relais.mp4` (62,5 s, 1920×1080, 30 i/s, avec musique) et de `docs/relais-video.png`.
Faite avec les skills Remotion pour Claude Code (`remotion-create`, `remotion-markup`,
`remotion-render`, `remotion-best-practices`), installés dans le projet par `npx skills add
remotion-dev/skills` (liste dans `skills-lock.json` à la racine).

```tree
video/
├── src/
│   ├── Root.tsx          compositions : la vidéo « Relais » + chaque scène seule
│   ├── Relais.tsx        enchaînement des 6 scènes (fondus de 15 images) + musique
│   ├── theme.ts          couleurs et polices du tableau
│   ├── elements.tsx      fond, entrées animées, titres
│   └── scenes/           Ouverture, Probleme, Fonctionnement, Economies, Delegation, Installation
├── outils/musique.mjs    compose la musique de fond (synthèse, 96 BPM, 62,5 s)
├── public/musique.mp3    la musique (le .wav brut est ignoré par git)
└── remotion.config.ts
```

Commandes (depuis ce dossier) :

```bash
npm i                                   # dépendances + Chrome headless dans node_modules
node outils/musique.mjs                 # recompose public/musique.wav
npx remotion ffmpeg -y -i public/musique.wav -codec:a libmp3lame -b:a 160k public/musique.mp3
npx remotion studio                     # aperçu interactif dans le navigateur
npx remotion render Relais ../docs/relais.mp4 --codec=h264 --crf=26
npx remotion still Relais ../docs/relais-video.png --frame=1560
```

Les chiffres affichés viennent du README du relais (section 3) et de `docs/delegation.md`.
Remotion est gratuit pour les particuliers et les équipes de 3 personnes au plus
(https://www.remotion.dev/license).
