"""Measure voice-input accuracy on this computer: word error rate (WER) and character error rate (CER).

Usage:  .venv\\Scripts\\python scripts\\test_speech.py <clips.json>
clips.json: [{"lang": "kn"|"en", "file": "clip.wav", "ref": "correct text"}, ...]  (16-bit WAV)
Writes docs/evidence/SPEECH.md.
"""
import json
import os
import re
import sys
import time
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))
from app import speech  # noqa: E402


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).replace("‌", "").replace("‍", "").lower()
    s = re.sub(r"[^\w\s']", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def edits(a, b) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def main():
    clips_path = sys.argv[1]
    base = os.path.dirname(os.path.abspath(clips_path))
    clips = json.load(open(clips_path, encoding="utf-8"))
    rows, tot = [], {}
    for c in clips:
        data = open(os.path.join(base, c["file"]), "rb").read()
        r = speech.transcribe(c["lang"], data)  # first call per language includes loading the model
        ref, hyp = norm(c["ref"]), norm(r["text"])
        we, wn = edits(ref.split(), hyp.split()), len(ref.split())
        ce, cn = edits(ref.replace(" ", ""), hyp.replace(" ", "")), len(ref.replace(" ", ""))
        t = tot.setdefault(c["lang"], {"we": 0, "wn": 0, "ce": 0, "cn": 0, "audio": 0.0, "took": 0.0, "n": 0, "took_list": []})
        t["we"] += we; t["wn"] += wn; t["ce"] += ce; t["cn"] += cn; t["n"] += 1
        t["audio"] += r["audio_s"]; t["took_list"].append(r["took_s"])
        rows.append((c["lang"], c["ref"], r["text"], r["audio_s"], r["took_s"]))
        print(c["lang"], f"{r['audio_s']:.1f}s audio -> {r['took_s']:.2f}s |", r["text"][:90], flush=True)
    L = [f"# Voice input accuracy ({time.strftime('%d %b %Y')}, measured on this computer)", "",
         "| language | model | clips | word error rate | character error rate | median time per clip |", "|---|---|---|---|---|---|"]
    for lang, t in tot.items():
        tl = sorted(t["took_list"][1:] or t["took_list"])  # leave out the first clip (model loading)
        L.append(f"| {'English' if lang == 'en' else 'Kannada'} | {speech.MODEL_INFO[lang]['name']} ({speech.MODEL_INFO[lang]['licence']}) | {t['n']} "
                 f"| {100 * t['we'] / max(1, t['wn']):.1f}% | {100 * t['ce'] / max(1, t['cn']):.1f}% | {tl[len(tl) // 2]:.2f} s |")
    L += ["", "Clips: English = LibriSpeech (clean read speech, hf-internal-testing/librispeech_asr_dummy); "
          "Kannada = arpit-tiwari/kannada-asr-filtered test split (read news sentences). Small samples: indicators, not proof.",
          "", "## Every clip", "", "| lang | correct text | recognised text | audio s | took s |", "|---|---|---|---|---|"]
    L += [f"| {l} | {ref} | {hyp} | {a:.1f} | {tk:.2f} |" for l, ref, hyp, a, tk in rows]
    os.makedirs(os.path.join(ROOT, "docs", "evidence"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "evidence", "SPEECH.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:6]))


if __name__ == "__main__":
    main()
