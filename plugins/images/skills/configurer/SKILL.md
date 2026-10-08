---
name: configurer
description: Chooses, installs and switches the image engine of the images plugin (free local Stable Diffusion, or Codex with a paid ChatGPT plan), step by step, asking before every download or install. Use when the user types /images:configurer, wants to set up or change how images are generated, asks to install Stable Diffusion or Codex, asks to switch engine, or when the images skill finds no engine chosen or a missing piece.
---

# Choose and install the image engine

Speak to the user **in their language**. The script is two folders above this skill's base directory:
`IMG` = `node "<skill base directory>/../../scripts/images.mjs"`. Every command prints JSON.

## Golden rule

**Nothing is downloaded, installed or launched without the user's explicit "yes" to THAT step.**
`IMG installer --etape X` WITHOUT `--oui` only prints a plan and runs nothing. You show the plan to the user
(what, size, destination, duration), wait for a clear yes in the conversation, and only then run the same
command with `--oui`. One yes covers one step: ask again for the next. Never add `--oui` on your own, and
never chain steps behind a single yes. Never edit, delete or move anything on the PC yourself.

## 1. Choose the engine

Run `IMG etat` (what is already set up), then ask the user, one question, with the facts:
- **Free: Stable Diffusion WebUI on this PC.** No cost, offline, but it needs a Windows PC with an
  **NVIDIA** graphics card (6 GB of VRAM or more; AMD and Mac are not supported by this plugin for now),
  about **15 GB of free disk space** (WebUI, Python packages, one SDXL model of 6.9 GB) and a long first
  installation (10 to 30 minutes).
- **Codex: OpenAI gpt-image through the Codex CLI.** Needs a **PAID ChatGPT plan (Plus or Pro)**: a free
  account can sign in but cannot generate images. About 450 MB to install, nothing heavy on the PC. Best
  text rendering and prompt understanding.

Then run `IMG configurer --moteur gratuit` or `IMG configurer --moteur codex`.

## 2. Check the prerequisites

Run `IMG verifier --moteur <engine> [--dossier "<folder>"] --texte` and show the user the readable report.
Each line is `OK`, `MISSING`, `REDO`, `PARTIAL`, `RUNNING`, `WARNING` or `BLOCKING`.
- **BLOCKING** (no NVIDIA card, not enough disk, not Windows): stop, explain, and offer the other engine.
  Install nothing.
- **WARNING** (under 6 GB of VRAM, plan reminder): say it clearly and let the user decide.
- Ask where to install: propose the folder in the report (a non-system drive when there is one). The user
  may choose another; pass it as `--dossier "<absolute folder>"` to every step that needs it
  (`webui`, `venv`, `premier-demarrage`, `modele`, and `codex`).

## 3. Install each missing piece, in order

Follow `prochaineEtape` of the report. For each step: run it WITHOUT `--oui`, show `plan` (title, command,
size, destination, `avertissement` if any), ask "do you want me to do this?", wait for the yes, run it WITH
`--oui`, read the result, then run `verifier` again for the next step.

Engine **gratuit**, in this order:
1. `git`: `winget install --id Git.Git -e` (about 350 MB; Windows may ask for permission).
2. `python`: Python 3.10 (WebUI needs 3.10, NOT 3.13), through winget or uv (`--methode winget|uv`; `--dossier` to
   choose where).
3. `webui`: `git clone` of AUTOMATIC1111 into the chosen folder (about 1 GB).
4. `venv`: the Python 3.10 environment. If the report says the existing venv uses another Python or is broken,
   explain, and only with a yes use `--recreer` (the old folder is renamed `venv.ancien-...`, not deleted; tell
   the user they can delete it to free space).
5. `premier-demarrage`: installs torch and the dependencies (5 to 6 GB, 10 to 30 minutes). It waits up to 9
   minutes; if the answer is `installation-en-cours`, tell the user it continues in the background (log path
   given), and run `verifier` or the same command again a bit later.
6. `modele`: SDXL 1.0 base from Hugging Face (6.9 GB, resumable, SHA-256 checked, saved in
   `models\Stable-diffusion`). If the answer is `dl-partiel` (cut or time over) run the same command again: it
   resumes. On `dl-hash` the file is NOT used: report it and offer `--repartir` (download again).
   Another model: `--url`, `--sha256`, `--taille`, `--nom` (only with the user's own choice and link).

Engine **codex**, in this order. Say first, again: **image generation needs a paid ChatGPT plan (Plus or Pro)**.
1. `node`: only if Node.js is missing (`winget install OpenJS.NodeJS.LTS`).
2. `codex`: `npm install --prefix <folder> @openai/codex` (about 450 MB, folder chosen by the user; the login
   folder `<folder>\home` is created and saved in the configuration).
3. `connexion`: `codex login`. A browser page opens and the USER signs in; the command waits up to 5 minutes.
   Tell the user before running it. If it answers `connexion-incomplete`, give them the URL it prints, or let them
   run `codex login` themselves in a terminal.

## 4. Finish

When `verifier` says everything is ready, run `IMG etat`, tell the user which engine is active and that they can
now ask for images ("generate an image of ..."). Mention the first generation may be slower while WebUI loads
the model.

## Switching later

Same command with the other engine: `IMG configurer --moteur codex` or `--moteur gratuit`. The settings of the
first one are kept. Paths can be set by hand: `--sd-dossier`, `--sd-port`, `--sd-args`, `--sd-python`,
`--codex-exe`, `--codex-home`.
