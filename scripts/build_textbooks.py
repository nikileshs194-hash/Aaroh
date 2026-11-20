"""Build (or update) the textbook search index from the PDFs in the textbook folder.

Usage:  .venv\Scripts\python scripts\build_textbooks.py [--force]
Books already indexed and unchanged are skipped, so it can be stopped and run again.
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.textbooks import library, textbook_dir  # noqa: E402

if __name__ == "__main__":
    print("Textbook folder:", textbook_dir(), flush=True)
    library.build(force="--force" in sys.argv)
    last = None
    while library.thread and library.thread.is_alive():
        s = library.state
        msg = f"{s.get('done', 0)}/{s.get('total', 0)} {s.get('current', '')}"
        if msg != last:
            print(msg, flush=True)
            last = msg
        time.sleep(2)
    print(library.status(), flush=True)
