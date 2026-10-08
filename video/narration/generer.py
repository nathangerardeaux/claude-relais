# Voice-over of the RelaisV2 video with Chatterbox Multilingual (local, GPU), checked by ear... of Whisper.
# Usage (from D:\outils\chatterbox): .venv\Scripts\python.exe D:\claude-relais\video\narration\generer.py [voix] [prises] [ids]
#   voix   = femme (official French sample fr_f1). There is no official French male sample: a reference from
#            another language carries its accent (tried with Italian: rejected).
#   prises = takes per sentence (default 3); each take is transcribed by Whisper (French) and the take whose
#            transcript is closest to the text (and fits its slot) is kept as narration/<voix>/<id>.wav.
#   ids    = optional comma-separated sentence ids to redo only those (e.g. p4,p7).
# More expressive than the defaults: exaggeration 0.75, cfg_weight 0.35 (Chatterbox README advice for
# dramatic / expressive speech).
import difflib, json, os, re, sys, unicodedata, urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", r"D:\outils\chatterbox\hf")

import torch, torchaudio, whisper
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

VOIX = {"femme": {"ref": "fr_f1.flac", "exaggeration": 0.75, "cfg_weight": 0.35, "temperature": 0.8}}
voix = sys.argv[1] if len(sys.argv) > 1 else "femme"
prises = int(sys.argv[2]) if len(sys.argv) > 2 else 3
seulement = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
reglage = VOIX[voix]
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

texte = json.loads((ICI / "texte.json").read_text(encoding="utf-8"))
sortie = ICI / voix
sortie.mkdir(exist_ok=True)
modele = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
oreille = whisper.load_model("small", device="cuda", download_root=r"D:\outils\chatterbox\whisper")
for p in texte["phrases"]:
    if seulement and p["id"] not in seulement:
        continue
    place = p["fin"] - p["debut"]
    meilleure = None
    for k in range(prises):
        torch.manual_seed(100 + k)
        wav = modele.generate(p["texte"], language_id="fr", audio_prompt_path=str(ref), exaggeration=reglage["exaggeration"],
                              cfg_weight=reglage["cfg_weight"], temperature=reglage["temperature"])
        essai = sortie / f"{p['id']}.prise{k}.wav"
        torchaudio.save(str(essai), wav, modele.sr)
        lu = oreille.transcribe(str(essai), language="fr", fp16=True)["text"].strip()
        score = difflib.SequenceMatcher(None, norm(p["texte"]), norm(lu)).ratio()
        duree = wav.shape[-1] / modele.sr
        if duree > place: score -= 0.5
        print(f"  {p['id']} prise {k}: {score:.2f} {duree:.1f}s/{place:.1f}s | {lu}", flush=True)
        if meilleure is None or score > meilleure[0]:
            meilleure = (score, essai, lu)
    score, essai, lu = meilleure
    (sortie / f"{p['id']}.wav").write_bytes(essai.read_bytes())
    print(f"{p['id']}: gardée {essai.name} ({score:.2f}) | {lu}", flush=True)
for f in sortie.glob("*.prise*.wav"):
    f.unlink()
