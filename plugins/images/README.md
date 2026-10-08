# images: generate images without leaving Claude Code

*[Version française](README.fr.md)*

Ask Claude for an image. Claude writes the image prompt itself, generates, **looks at the result** and
retries (at most 3 times) if it does not match what you asked. The picture is saved in your project and
never overwrites an existing file.

You pick **one engine** when you set the plugin up:

| | Free: local Stable Diffusion | Codex: OpenAI gpt-image |
|---|---|---|
| Cost | 0 (your own PC) | needs a **paid ChatGPT plan (Plus or Pro)**. A free account can sign in but cannot generate. |
| Needs | Windows, **NVIDIA GPU with 6 GB VRAM or more** (AMD and Mac are not supported by this plugin for now), about **15 GB of free disk** | Node.js, about 450 MB, a browser to sign in once |
| Quality | depends on the model (SDXL by default), weak at drawing text | strong prompt understanding, good text in images |
| Speed | 10 to 40 s per image on an 8 GB card | 1 to 3 minutes |
| Privacy | everything stays on your PC | the prompt goes to OpenAI |

## Install the plugin

```
/plugin marketplace add nathangerardeaux/claude-relais
/plugin install images@claude-relais
```

Restart Claude Code, then type **`/images:configurer`** and let Claude guide you: it asks which engine you
want, checks your PC (graphics card, disk, Git, Python...), then installs each missing piece **one step at a
time, asking for your yes before every download or install** (with the size and the destination). Nothing is
installed behind your back.

After that, just ask: "generate an image of a red fox in watercolor". `/images:images` also works.

## What the guided install does

Free engine, in this order: Git (winget), Python 3.10 (winget or uv), WebUI (`git clone` of AUTOMATIC1111 into
the folder you choose), a Python 3.10 venv, the first launch (torch and dependencies, 5 to 6 GB, 10 to 30
minutes), then the SDXL 1.0 base model (6.9 GB, resumable download, SHA-256 verified). Caches stay in the
WebUI folder.

Codex engine: Node.js if missing, `npm install --prefix <folder> @openai/codex`, then `codex login` (a browser
page opens and you sign in yourself).

## Manual steps (if you prefer)

The script behind it is `scripts/images.mjs` (Node 18+, no dependency). Every command prints JSON.

```
node scripts/images.mjs verifier --moteur gratuit --texte      # prerequisites report, changes nothing
node scripts/images.mjs installer --etape git                  # shows the plan only
node scripts/images.mjs installer --etape git --oui            # actually does it
node scripts/images.mjs configurer --moteur gratuit --sd-dossier "D:\stable-diffusion-webui"
node scripts/images.mjs configurer --moteur codex --codex-exe "D:\tools\codex\node_modules\.bin\codex.cmd" --codex-home "D:\tools\codex\home"
node scripts/images.mjs etat                                   # engine, paths, API up?, models, Codex signed in?
node scripts/images.mjs generer --prompt "a red fox, watercolor" --sortie fox.png
```

Steps of `installer --etape`: `git`, `python`, `webui`, `venv`, `premier-demarrage`, `modele` (free engine);
`node`, `codex`, `connexion` (Codex engine). Without `--oui` a step only prints its plan.
Settings live in `~/.claude/images/config.json`. If you already have WebUI or Codex, just point to them with
`configurer`. The free engine starts WebUI by itself in API mode (`--api --nowebui`, port 7861, hidden window)
when it is not running; it never edits your `webui-user.bat`.

## Troubleshooting

- **"ChatGPT Plus/Pro plan required"**: the Codex image tool is not available on a free ChatGPT account (Codex
  answers "The built-in image generation tool isn't available in this session"). Upgrade the plan or switch
  engine with `/images:configurer`.
- **The venv uses Python 3.13 (first start fails installing torch)**: WebUI on Windows needs Python 3.10.
  Run `installer --etape venv --recreer` (the old venv is renamed `venv.ancien-...`, not deleted), then
  `premier-demarrage`.
- **"No checkpoint installed"**: WebUI cannot generate without a model. Run `installer --etape modele` or put
  any `.safetensors` model in `<WebUI>\models\Stable-diffusion`.
- **Port busy / API does not answer**: the plugin looks for the API on 7861 then 7860. Another program on the
  port? Choose another with `configurer --moteur gratuit --sd-port 7870`. The WebUI log is
  `<WebUI>\tmp\images-plugin.log`.
- **Git "detected dubious ownership" (error 128) when WebUI clones its repositories**: this happens when the
  WebUI folder is on an exFAT or FAT32 drive or on a network drive, where git cannot record who owns files.
  The plugin handles it by itself: it gives git `safe.directory` through the environment of the WebUI process
  only (never `git config --global`). If you start WebUI by hand instead, set `safe.directory` yourself or move
  the folder to an NTFS drive.
- **Out of video memory**: ask for a smaller image (768x768 or 1024x768), or use `--sd-args "--medvram"`.
- **Nothing is generated and no message**: run `etat`: it lists what is missing in `problemes`.

## Tests

`node scripts/tester.mjs` (engines, fakes only) and `node scripts/tester-installation.mjs` (guided install,
fakes only: nothing is installed or downloaded for real).
