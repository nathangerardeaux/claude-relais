# Vidéo de présentation de relais (Remotion)

Source de `docs/relais.mp4` (50 s, 1920×1080, 30 i/s, avec musique) et de `docs/relais-video.png`.
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
├── outils/musique.mjs    compose la musique de fond (synthèse, 120 BPM, 50 s)
├── public/musique.mp3    la musique (le .wav brut est ignoré par git)
└── remotion.config.ts
```

Commandes (depuis ce dossier) :

```bash
npm i                                   # dépendances + Chrome headless dans node_modules
node outils/musique.mjs                 # recompose public/musique.wav
npx remotion ffmpeg -y -i public/musique.wav -codec:a libmp3lame -b:a 160k public/musique.mp3
npx remotion studio                     # aperçu interactif dans le navigateur
npx remotion render Relais brut.mp4 --codec=h264 --crf=16 --muted   # 62,5 s, sans son
# accéléré x1,25 (50 s) + musique ; -itsscale plutôt que setpts : Git Bash réécrit « PTS/1.25 » comme un chemin
node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe -y -itsscale 0.8 -i brut.mp4 -i public/musique.mp3 \
  -r 30 -map 0:v -map 1:a -c:v libx264 -crf 26 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ../docs/relais.mp4
npx remotion still Relais ../docs/relais-video.png --frame=1560
```

Les scènes sont réglées pour 62,5 s puis accélérées de 1,25× : 37,5 s était trop rapide à lire, 62,5 s trop lent.
La musique à 120 BPM (96 × 1,25) garde les changements de scène sur le temps.

Les chiffres affichés viennent du README du relais (section 3) et de `docs/delegation.md`.
Remotion est gratuit pour les particuliers et les équipes de 3 personnes au plus
(https://www.remotion.dev/license).
