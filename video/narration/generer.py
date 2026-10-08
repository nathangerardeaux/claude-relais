# Voice-over of the RelaisV2 video with Chatterbox Multilingual (local, GPU), checked by ear... of Whisper.
# Usage (from D:\outils\chatterbox): .venv\Scripts\python.exe D:\claude-relais\video\narration\generer.py [voix] [prises] [ids]
#   voix   = femme (official French sample fr_f1). There is no official French male sample: a reference from
#            another language carries its accent (tried with Italian: rejected).
#   prises = takes per sentence (default 3); each take is transcribed by Whisper (French) and the take whose
#            transcript is closest to the text (and fits its slot) is kept as narration/<voix>/<id>.wav.
#   ids    = optional comma-separated sentence ids to redo only those (e.g. p4,p7).
# Options (anywhere on the line), for the other videos:
#   --texte texte-v3.json          narration file, relative to this folder (default texte.json)
#   --sortie ../public/voix-v3/femme  output folder, relative to this folder (default narration/<voix>)
#   --garder 1                     keep every take (<id>.priseN.wav) to pick another one by hand
#   A sentence may have a "dit" field: the spelling given to the voice when it mispronounces a word (the
#   Whisper check still compares with "texte").
#   --expressif                    livelier presenter read (RelaisOutils): exaggeration 1.05, cfg_weight 0.25,
#                                  temperature 0.85; among the takes whose transcript is exact and that fit the
#                                  slot, keeps the most expressive one (pitch / loudness variation, expressivite.py)
#                                  instead of the closest one, then trims it just after the last word.
#                                  Tested on p1/p6 (0.95/0.3/0.8, 1.05/0.25/0.85, 1.1/0.25/0.9): 1.05/0.25 gives the
#                                  liveliest exact takes; it derails more often (babbling tail, rejected by the
#                                  Whisper check), so ask for 6 takes. Higher exaggeration also speeds the read up.
#   --exag 1.0 --cfg 0.3 --temp 0.85  override one setting (tests); --graine 200 changes the random seeds
#   A "dit" field may also carry punctuation for the voice only (exclamation marks were tried: more derails,
#   no measurable gain).
#   e.g. RelaisOutils video: generer.py femme 6 --expressif --texte texte-v3.json --sortie ../public/voix-v3/femme
# More expressive than the defaults: exaggeration 0.75, cfg_weight 0.35 (Chatterbox README advice for
# dramatic / expressive speech).
import difflib, json, os, re, sys, unicodedata, urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", r"D:\outils\chatterbox\hf")

import torch, torchaudio, whisper
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from expressivite import mesure, score_expressif

VOIX = {"femme": {"ref": "fr_f1.flac", "exaggeration": 0.75, "cfg_weight": 0.35, "temperature": 0.8}}
EXPRESSIF = {"exaggeration": 1.05, "cfg_weight": 0.25, "temperature": 0.85}
DRAPEAUX = {"expressif"}  # options without a value
args, options = [], {}
it = iter(sys.argv[1:])
for a in it:
    if a.startswith("--"):
        options[a[2:]] = "1" if a[2:] in DRAPEAUX else next(it)
    else:
        args.append(a)
voix = args[0] if len(args) > 0 else "femme"
prises = int(args[1]) if len(args) > 1 else 3
seulement = set(args[2].split(",")) if len(args) > 2 else None
expressif = "expressif" in options
reglage = dict(VOIX[voix], **(EXPRESSIF if expressif else {}))
for opt, cle in (("exag", "exaggeration"), ("cfg", "cfg_weight"), ("temp", "temperature")):
    if opt in options:
        reglage[cle] = float(options[opt])
graine = int(options.get("graine", 100))
print(f"reglage: exaggeration {reglage['exaggeration']}, cfg_weight {reglage['cfg_weight']}, temperature {reglage['temperature']}", flush=True)
refs = ICI / "references"
refs.mkdir(exist_ok=True)
ref = refs / reglage["ref"]
if not ref.exists():
    urllib.request.urlretrieve(f"https://storage.googleapis.com/chatterbox-demo-samples/mtl_prompts/{reglage['ref']}", ref)

UNITES = "zero un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split()
def nombre_fr(n: int) -> str:
    # Enough for this narration (whisper writes 191 000 or 3000 as digits).
    if n < 17: return UNITES[n]
    if n < 20: return "dix " + UNITES[n - 10]
    if n < 1000:
        c, r = divmod(n, 100)
        if c:
            return ("cent" if c == 1 else UNITES[c] + " cent") + (" " + nombre_fr(r) if r else "")
        d, u = divmod(n, 10)
        dizaines = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}
        if d in dizaines: return dizaines[d] + (" et un" if u == 1 else (" " + UNITES[u] if u else ""))
        if d == 7: return "soixante " + ("et onze" if u == 1 else nombre_fr(10 + u))
        if d == 8: return "quatre vingt" + (" " + UNITES[u] if u else "")
        return "quatre vingt " + nombre_fr(10 + u)
    m, r = divmod(n, 1000)
    return ("mille" if m == 1 else nombre_fr(m) + " mille") + (" " + nombre_fr(r) if r else "")
def norm(s: str) -> list:
    s = re.sub(r"(\d)[\s\u00a0\u202f.](?=\d{3}\b)", r"\1", s)
    s = re.sub(r"\d+", lambda m: " " + nombre_fr(int(m.group())) + " ", s)
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).split()

def fin_parole(wav, sr, dernier_mot):
    # first 0.1 s window after the last word that is 40 dB under the peak = end of speech (drops the noises
    # Chatterbox sometimes adds after a silence)
    x = wav[0]
    pas = int(0.02 * sr)
    n = x.shape[-1] // pas
    db = 20 * torch.log10(x[: n * pas].reshape(n, pas).pow(2).mean(1).sqrt() + 1e-6)
    seuil = db.max() - 40
    for i in range(int(dernier_mot / 0.02), n - 4):
        if bool((db[i : i + 5] < seuil).all()):
            return i * 0.02
    return x.shape[-1] / sr
def rogner(wav, sr, fin):
    k = min(wav.shape[-1], int((fin + 0.12) * sr))
    out = wav[:, :k].clone()
    f = int(0.1 * sr)
    out[:, -f:] *= torch.linspace(1, 0, f)
    return out

texte = json.loads((ICI / options.get("texte", "texte.json")).read_text(encoding="utf-8"))
sortie = (ICI / options["sortie"]).resolve() if "sortie" in options else ICI / voix
sortie.mkdir(parents=True, exist_ok=True)
modele = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
oreille = whisper.load_model("small", device="cuda", download_root=r"D:\outils\chatterbox\whisper")
for p in texte["phrases"]:
    if seulement and p["id"] not in seulement:
        continue
    place = p["fin"] - p["debut"]
    meilleure = None
    essais = []
    for k in range(prises):
        torch.manual_seed(graine + k)
        wav = modele.generate(p.get("dit", p["texte"]), language_id="fr", audio_prompt_path=str(ref), exaggeration=reglage["exaggeration"],
                              cfg_weight=reglage["cfg_weight"], temperature=reglage["temperature"])
        essai = sortie / f"{p['id']}.prise{k}.wav"
        torchaudio.save(str(essai), wav, modele.sr)
        res = oreille.transcribe(str(essai), language="fr", fp16=True, word_timestamps=expressif)
        lu = res["text"].strip()
        score = difflib.SequenceMatcher(None, norm(p["texte"]), norm(lu)).ratio()
        duree = wav.shape[-1] / modele.sr
        info = ""
        if expressif:
            mots = [w for seg in res["segments"] for w in seg["words"]]
            duree = fin_parole(wav, modele.sr, mots[-1]["end"] if mots else 0)
            wav = rogner(wav, modele.sr, duree)
            torchaudio.save(str(essai), wav, modele.sr)
            m = mesure(essai, len(norm(p["texte"])))
            info = f" ton {m['ton']:.2f} energie {m['energie']:.1f} debit {m['debit']:.2f} expressif {score_expressif(m):.2f}"
            essais.append((score, duree <= place, m["debit"], score_expressif(m), essai, lu))
        if duree > place: score -= 0.5
        print(f"  {p['id']} prise {k}: {score:.2f} {duree:.1f}s/{place:.1f}s{info} | {lu}", flush=True)
        if meilleure is None or score > meilleure[0]:
            meilleure = (score, essai, lu)
    score, essai, lu = meilleure
    if expressif:
        # exact enough (best transcript, or within 0.04 of it), fits the slot, not rushed: most expressive wins
        bons = [e for e in essais if e[1] and e[0] >= max(0.9, score - 0.04) and e[2] <= 4.0]
        if bons:
            score, _, _, _, essai, lu = max(bons, key=lambda e: e[3])
    (sortie / f"{p['id']}.wav").write_bytes(essai.read_bytes())
    print(f"{p['id']}: gardée {essai.name} ({score:.2f}) | {lu}", flush=True)
if "garder" not in options:
    for f in sortie.glob("*.prise*.wav"):
        f.unlink()
