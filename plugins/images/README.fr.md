# images : générer des images sans quitter Claude Code

*[English version](README.md)*

Demande une image à Claude. Il écrit lui-même le prompt, génère, **regarde le résultat** et recommence
(3 essais au maximum) si ça ne correspond pas à ta demande. L'image est enregistrée dans ton projet et
n'écrase jamais un fichier existant.

Tu choisis **un seul moteur** à la configuration :

| | Gratuit : Stable Diffusion en local | Codex : gpt-image d'OpenAI |
|---|---|---|
| Coût | 0 (ton propre PC) | demande un **forfait ChatGPT payant (Plus ou Pro)**. Un compte gratuit se connecte mais ne peut pas générer. |
| Prérequis | Windows, **carte NVIDIA avec 6 Go de VRAM ou plus** (AMD et Mac ne sont pas gérés par ce plugin pour le moment), environ **15 Go de disque libre** | Node.js, environ 450 Mo, un navigateur pour te connecter une fois |
| Qualité | dépend du modèle (SDXL par défaut), faible pour écrire du texte | comprend bien les consignes, bon texte dans les images |
| Vitesse | 10 à 40 s par image sur une carte de 8 Go | 1 à 3 minutes |
| Confidentialité | tout reste sur ton PC | le prompt part chez OpenAI |

## Installer le plugin

```
/plugin marketplace add nathangerardeaux/claude-relais
/plugin install images@claude-relais
```

Redémarre Claude Code, puis tape **`/images:configurer`** et laisse Claude te guider : il te demande quel moteur
tu veux, vérifie ton PC (carte graphique, disque, Git, Python...), puis installe chaque pièce manquante **une
étape à la fois, en te demandant ton accord avant chaque téléchargement ou installation** (avec la taille et la
destination). Rien n'est installé dans ton dos.

Ensuite, demande simplement : « génère une image de renard rouge à l'aquarelle ». `/images:images` marche aussi.

## Ce que fait l'installation guidée

Moteur gratuit, dans cet ordre : Git (winget), Python 3.10 (winget ou uv), WebUI (`git clone` d'AUTOMATIC1111
dans le dossier que tu choisis), un venv Python 3.10, le premier lancement (torch et dépendances, 5 à 6 Go, 10 à
30 minutes), puis le modèle SDXL 1.0 base (6,9 Go, téléchargement reprenable, SHA-256 vérifié). Les caches
restent dans le dossier de WebUI.

Moteur Codex : Node.js s'il manque, `npm install --prefix <dossier> @openai/codex`, puis `codex login` (une page
de navigateur s'ouvre et tu te connectes toi-même).

## Étapes à la main (si tu préfères)

Le script derrière tout ça est `scripts/images.mjs` (Node 18+, aucune dépendance). Chaque commande affiche du JSON.

```
node scripts/images.mjs verifier --moteur gratuit --texte      # rapport des prérequis, ne change rien
node scripts/images.mjs installer --etape git                  # montre seulement le plan
node scripts/images.mjs installer --etape git --oui            # le fait vraiment
node scripts/images.mjs configurer --moteur gratuit --sd-dossier "D:\stable-diffusion-webui"
node scripts/images.mjs configurer --moteur codex --codex-exe "D:\outils\codex\node_modules\.bin\codex.cmd" --codex-home "D:\outils\codex\home"
node scripts/images.mjs etat                                   # moteur, chemins, API active ?, modèles, Codex connecté ?
node scripts/images.mjs generer --prompt "a red fox, watercolor" --sortie renard.png
```

Étapes de `installer --etape` : `git`, `python`, `webui`, `venv`, `premier-demarrage`, `modele` (moteur gratuit) ;
`node`, `codex`, `connexion` (moteur Codex). Sans `--oui`, une étape affiche seulement son plan.
Les réglages sont dans `~/.claude/images/config.json`. Si tu as déjà WebUI ou Codex, indique-les simplement avec
`configurer`. Le moteur gratuit démarre WebUI tout seul en mode API (`--api --nowebui`, port 7861, fenêtre
cachée) quand il ne tourne pas ; il ne modifie jamais ton `webui-user.bat`.

## Dépannage

- **« Forfait ChatGPT Plus/Pro requis »** : l'outil d'images de Codex n'est pas disponible avec un compte ChatGPT
  gratuit (Codex répond « The built-in image generation tool isn't available in this session »). Passe à un
  forfait payant ou change de moteur avec `/images:configurer`.
- **Le venv est en Python 3.13 (le premier démarrage échoue à installer torch)** : WebUI sous Windows demande
  Python 3.10. Lance `installer --etape venv --recreer` (l'ancien venv est renommé `venv.ancien-...`, pas
  supprimé), puis `premier-demarrage`.
- **« Aucun checkpoint installé »** : WebUI ne peut rien générer sans modèle. Lance `installer --etape modele` ou
  mets un modèle `.safetensors` dans `<WebUI>\models\Stable-diffusion`.
- **Port occupé / l'API ne répond pas** : le plugin cherche l'API sur 7861 puis 7860. Un autre programme sur le
  port ? Choisis-en un autre avec `configurer --moteur gratuit --sd-port 7870`. Le journal de WebUI est
  `<WebUI>\tmp\images-plugin.log`.
- **Git « detected dubious ownership » (erreur 128) quand WebUI clone ses dépôts** : cela arrive quand le dossier de
  WebUI est sur un disque exFAT ou FAT32, ou un disque réseau, où git ne peut pas enregistrer le propriétaire des
  fichiers. Le plugin le gère seul : il donne `safe.directory` à git par l'environnement du processus WebUI
  uniquement (jamais `git config --global`). Si tu lances WebUI à la main, règle `safe.directory` toi-même ou
  déplace le dossier sur un disque NTFS.
- **Mémoire vidéo insuffisante** : demande une image plus petite (768x768 ou 1024x768), ou utilise
  `--sd-args "--medvram"`.
- **Rien ne se génère et aucun message** : lance `etat` : `problemes` liste ce qui manque.

## Tests

`node scripts/tester.mjs` (moteurs, avec des faux uniquement) et `node scripts/tester-installation.mjs`
(installation guidée, avec des faux uniquement : rien n'est installé ni téléchargé pour de vrai).
