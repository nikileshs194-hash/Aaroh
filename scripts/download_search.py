"""Download the free textbook-search model: multilingual-E5-small (int8 ONNX, MIT licence, about 135 MB).

Usage:  .venv\Scripts\python scripts\download_search.py [--dir D:/InferSmart-models/search/e5-small]
"""
import argparse
import os
import urllib.request

FILES = ["onnx/model_qint8_avx512_vnni.onnx", "onnx/tokenizer.json"]
REPO = "intfloat/multilingual-e5-small"

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="D:/InferSmart-models/search/e5-small")
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    for f in FILES:
        dest = os.path.join(a.dir, os.path.basename(f))
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print("have", dest)
            continue
        urllib.request.urlretrieve(f"https://huggingface.co/{REPO}/resolve/main/{f}", dest)
        print("got", dest)
    print("search model ready")
