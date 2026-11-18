"""Download the pinned llama.cpp CPU build (release b12521) into engine/bin. Run by setup.bat."""
import os
import sys
import urllib.request
import zipfile

RELEASE = "b12521"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = f"llama-{RELEASE}-bin-win-cpu-x64.zip"
URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{RELEASE}/{NAME}"
dest_zip = os.path.join(ROOT, "engine", NAME)
bin_dir = os.path.join(ROOT, "engine", "bin")

if os.path.exists(os.path.join(bin_dir, "llama-server.exe")):
    print("Engine already installed.")
    sys.exit(0)
os.makedirs(os.path.dirname(dest_zip), exist_ok=True)
if not (os.path.exists(dest_zip) and zipfile.is_zipfile(dest_zip)):
    print(f"Downloading the AI engine ({NAME})...")
    urllib.request.urlretrieve(URL, dest_zip)
with zipfile.ZipFile(dest_zip) as z:
    z.extractall(bin_dir)
print("Engine installed in engine/bin.")
