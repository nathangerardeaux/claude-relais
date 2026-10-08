# Expressiveness of a voice take, "by the numbers" (used by generer.py --expressif, or alone to compare takes).
# Usage: python expressivite.py a.wav b.wav ...   (any Python with librosa, e.g. the Chatterbox venv)
#   ton   = standard deviation of the pitch in semitones (voiced frames): higher = livelier intonation
#           (first RelaisOutils takes, default settings: 2.8 to 3.8, mean 3.3).
#   etendue = pitch range between the 5th and 95th percentiles, semitones.
#   energie = standard deviation of the loudness in dB (frames within 40 dB of the peak): stresses and accents.
#   duree = speech length without the silence around it (s); debit = words per second when the text is known.
import sys
import numpy as np
import librosa


def mesure(chemin, nb_mots=None):
    y, sr = librosa.load(str(chemin), sr=16000)
    yt, _ = librosa.effects.trim(y, top_db=35)
    duree = len(yt) / sr
    f0, voise, _ = librosa.pyin(yt, fmin=70, fmax=500, sr=sr, frame_length=1024, hop_length=160)
    f0 = f0[voise & ~np.isnan(f0)]
    if len(f0) < 10:
        return {"ton": 0.0, "etendue": 0.0, "energie": 0.0, "duree": duree, "debit": 0.0}
    demi = 12 * np.log2(f0 / np.median(f0))
    rms = librosa.feature.rms(y=yt, frame_length=640, hop_length=160)[0]
    db = 20 * np.log10(rms + 1e-6)
    db = db[db > db.max() - 40]
    return {
        "ton": float(np.std(demi)),
        "etendue": float(np.percentile(demi, 95) - np.percentile(demi, 5)),
        "energie": float(np.std(db)),
        "duree": duree,
        "debit": (nb_mots / duree) if nb_mots else 0.0,
    }


# Single number used to rank takes that are already exact and fit their slot.
def score_expressif(m):
    return m["ton"] + 0.15 * m["energie"]


if __name__ == "__main__":
    for f in sys.argv[1:]:
        m = mesure(f)
        print(f"{f}: ton {m['ton']:.2f} st, etendue {m['etendue']:.1f} st, energie {m['energie']:.2f} dB, duree {m['duree']:.2f} s, expressif {score_expressif(m):.2f}")
