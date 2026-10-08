---
name: images
description: Generates an image for the user, looks at the result and retries until it matches. Use when the user asks for an image, illustration, logo, icon, picture, visual, mockup or artwork ("génère une image", "fais-moi un logo", "crée une illustration", "draw", "generate an image"), or types /images. Works with the engine chosen at setup (free local Stable Diffusion, or Codex with a paid ChatGPT plan).
---

# Image generation

Speak to the user **in their language**. The script is two folders above this skill's base directory
(shown when the skill loads): `<skill base directory>/../../scripts/images.mjs`. Below, `IMG` stands for
`node "<that path>"`. Every command prints JSON.

## 1. Is an engine chosen?

Run `IMG etat`. If `configure` is false, follow the **configurer** skill (ask which engine, then run
`IMG configurer ...`) before anything else. Read `problemes`: if one blocks the chosen engine (no checkpoint,
Codex not signed in, WebUI missing, ...), tell the user plainly and offer to go through the **configurer** skill,
which installs the missing pieces step by step with their agreement. Never fix their PC on your own.

## 2. Write the prompt yourself

The user describes the idea in a few words; **you** write the real prompt. Ask a question only if the
idea is too vague to start (subject unknown); otherwise make sensible choices and show them in one line.
Keep any text that must appear in the image short: engines draw letters badly (Stable Diffusion almost
never gets them right).

### Engine "gratuit" (Stable Diffusion)

- `--prompt`: English, comma-separated visual tags, most important first:
  subject and action, details (clothes, objects, setting), composition and camera ("close-up", "wide shot",
  "from above"), lighting ("soft morning light", "neon rim light"), style or medium ("watercolor
  illustration", "flat vector logo", "photo, 35mm, shallow depth of field"), then quality tags
  ("highly detailed, sharp focus, masterpiece").
- `--negatif` (always give one): what must not appear, e.g.
  `lowres, blurry, bad anatomy, bad hands, extra fingers, deformed, jpeg artifacts, watermark, signature`.
  Add what went wrong in the previous attempt (e.g. `text, cropped, extra limbs`).
- Sizes (`--largeur`, `--hauteur`, multiples of 8). The script picks the model's native size if you give
  none (`details.sdxl` in the answer tells which family it is):
  - **SDXL** (also Pony, Illustrious): about 1 megapixel: 1024x1024, 1152x896 or 1216x832 (landscape),
    896x1152 or 832x1216 (portrait). Never go below 768 on a side, never above ~1.3 megapixel on an 8 GB card.
  - **SD 1.5**: 512x512, 512x768 (portrait), 768x512 (landscape); beyond 768 it duplicates subjects.
- Optional `--pas` (steps, default 28 SDXL / 25 SD 1.5), `--cfg` (default 6 / 7), `--graine` (fixed seed to
  vary only the prompt between two tries; default random).
- The first call can start Stable Diffusion by itself and wait for it (up to 8 minutes, first start much
  longer). If the answer says it is still starting, run the same command again a bit later (do not start a
  second copy). `IMG demarrer` starts it without generating.

### Engine "codex" (gpt-image through the Codex CLI)

- `--prompt`: natural, detailed description in full sentences (any language, English is safest): the
  scene, subject, mood, colours, style, composition, and the exact text if any (in quotes).
  No tags and no negative prompt: say what you want instead ("a clean white background", "no text").
- Only the ratio matters for size: pass `--largeur`/`--hauteur` (e.g. 1536 and 1024) to ask landscape,
  portrait or square.
- It takes one to three minutes. If the answer says a paid ChatGPT plan is required, tell the user that
  clearly and offer the free engine (do not retry).

## 3. Generate, then LOOK

```
IMG generer --prompt "..." [--negatif "..."] [--largeur N --hauteur N] --sortie "<path>.png"
```

- Save **inside the current project** (for example `<project>/images/<descriptive-name>.png`, create the
  folder) unless the user names another place. Never overwrite: if the answer says the file exists, use
  the suggested name.
- When `ok` is true, **open the file with the Read tool** (it shows the image) and judge it honestly
  against the request: subject, composition, style, mistakes (hands, faces, garbled text, cut-off edges).
- If it does not match, change the prompt for the specific defect and generate again with a new file name
  (`-v2`, `-v3`). **At most 3 attempts in total.** Then keep the best one, and say what is still off.
- Tell the user the final path, the engine used, and one line on what you changed between attempts.
- When `ok` is false, give `message` in your own words with the one thing to do; never loop on a failure
  that is not about the picture itself (missing model, plan, login).
