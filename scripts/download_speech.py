"""Download the two free, offline speech-to-text models used for voice input.

- English: NVIDIA Parakeet TDT 0.6B v2 (int8, sherpa-onnx export)  licence CC-BY-4.0
- Kannada: AI4Bharat IndicConformer 600M multilingual (int8 ONNX)  licence MIT

Usage:  .venv\\Scripts\\python scripts\\download_speech.py [--dir D:/InferSmart-models/speech]
"""
import argparse
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from download_models import download, get_json  # noqa: E402

MODELS = {
    "parakeet-en": ("csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
                    ["tokens.txt", "decoder.int8.onnx", "joiner.int8.onnx", "encoder.int8.onnx"]),
    "indicconformer-kn": ("atharva-again/indic-conformer-600m-quantized",
                          ["config/vocab.json", "config/language_masks.json", "onnx/ctc_decoder_quantized_int8.onnx",
                           "onnx/encoder_quantized_int8.onnx"]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.environ.get("AAROH_SPEECH_DIR", "D:/InferSmart-models/speech"))
    ap.add_argument("--only", choices=list(MODELS), default=None)
    a = ap.parse_args()
    for name, (repo, files) in MODELS.items():
        if a.only and name != a.only:
            continue
        sizes = {f["path"]: f.get("size", 0) for f in get_json(f"https://huggingface.co/api/models/{repo}/tree/main?recursive=true")
                 if f["type"] == "file"}
        for rel in files:
            dest = os.path.join(a.dir, name, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            size = sizes[rel]
            if os.path.exists(dest) and os.path.getsize(dest) == size:
                print("have", name, rel, flush=True)
                continue
            url = f"https://huggingface.co/{repo}/resolve/main/{rel}"
            if size > 50_000_000:
                download(url, dest, size)
            else:
                urllib.request.urlretrieve(url, dest)
            print("got", name, rel, round(size / 1e6, 1), "MB", flush=True)
    print("speech models ready", flush=True)


if __name__ == "__main__":
    main()
