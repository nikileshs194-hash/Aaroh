"""Textbook knowledge (F28 "ask my textbook"): NCERT PDFs on this computer become a searchable index, and each
question is answered with the most relevant textbook paragraphs in front of the AI.

- Text from the PDFs (pypdf), cut into overlapping paragraphs with class, subject and page.
- Search model: multilingual-E5-small (MIT, int8 ONNX), so Kannada questions also find English paragraphs.
- Everything stays on this computer: the PDFs, the index (data/rag) and the model.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from pathlib import Path

import numpy as np

from .config import DATA_DIR, ROOT

logging.getLogger("pypdf").setLevel(logging.ERROR)

INDEX_DIR = DATA_DIR / "rag"
CHUNK_CHARS, OVERLAP, MIN_CHARS = 700, 120, 180
MAX_TOKENS = 256
BATCH = 32
MIN_SCORE = 0.855
PASSAGE_CHARS = 420  # measured: 3 full paragraphs added about 5 s before the first word on this laptop


def textbook_dir() -> Path:
    env = os.environ.get("AAROH_TEXTBOOKS")
    for d in ([Path(env)] if env else []) + [ROOT / "NCERT textbooks", Path("D:/Aaroh-textbooks")]:
        if d.exists():
            return d
    return ROOT / "NCERT textbooks"


def model_dir() -> Path:
    for d in (Path("D:/InferSmart-models/search/e5-small"), ROOT / "models" / "search" / "e5-small"):
        if d.exists():
            return d
    return Path("D:/InferSmart-models/search/e5-small")


# ------------------------------------------------------------------ book names and text
def book_info(filename: str) -> dict:
    """'10th_Social_Democratic_Politics.pdf' -> class 10, 'Social Democratic Politics'."""
    stem = Path(filename).stem
    m = re.match(r"^(\d{1,2})(?:st|nd|rd|th)?[_\s-]*(.*)$", stem, re.I)
    cls = int(m.group(1)) if m else None
    rest = (m.group(2) if m else stem).replace("_", " ").replace("-", " ")
    rest = re.sub(r"\bhegp\d+\b", "", rest, flags=re.I)
    rest = re.sub(r"\s+", " ", rest).strip() or stem
    return {"file": filename, "class": cls, "subject": rest}


_REPEAT = re.compile(r"(.{3,60}?)\1{1,}")  # "Activity 1.7Activity 1.7Activity 1.7" -> "Activity 1.7"


def clean(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\ufb01", "fi").replace("\ufb02", "fl")
    text = re.sub(r"-\n(\w)", r"\1", text)              # join hyphenated line breaks
    text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
    text = _REPEAT.sub(r"\1", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def chunks_of(text: str) -> list[str]:
    """Paragraph-sized pieces that end at a sentence where possible, with a little overlap."""
    out, i, n = [], 0, len(text)
    while i < n:
        end = min(n, i + CHUNK_CHARS)
        if end < n:
            cut = max(text.rfind(". ", i + CHUNK_CHARS // 2, end), text.rfind("? ", i + CHUNK_CHARS // 2, end))
            if cut > 0:
                end = cut + 1
        piece = text[i:end].strip()
        if len(piece) >= MIN_CHARS:
            out.append(piece)
        if end >= n:
            break
        i = max(end - OVERLAP, i + 1)
    return out


def _pdftotext() -> str | None:
    import shutil
    for c in (shutil.which("pdftotext"), "C:/Program Files/Git/mingw64/bin/pdftotext.exe"):
        if c and Path(c).exists():
            return c
    return None


def pages_of(path: Path) -> list[str]:
    """Text of every page. Uses the fast pdftotext tool when present (about 10x faster), else pypdf."""
    exe = _pdftotext()
    if exe:
        import subprocess
        try:
            out = subprocess.run([exe, "-enc", "UTF-8", str(path), "-"], capture_output=True, timeout=600,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout.decode("utf-8", "replace")
            pages = out.split(chr(12))  # pdftotext ends each page with a form feed
            if len(pages) > 1:
                return pages
        except Exception:
            pass
    import pypdf
    res = []
    for page in pypdf.PdfReader(str(path)).pages:
        try:
            res.append(page.extract_text() or "")
        except Exception:
            res.append("")
    return res


def read_book(path: Path) -> list[dict]:
    info = book_info(path.name)
    rows = []
    for pno, raw in enumerate(pages_of(path), start=1):
        for c in chunks_of(clean(raw)):
            rows.append({**info, "page": pno, "text": c})
    return rows


# ------------------------------------------------------------------ embeddings
class Embedder:
    def __init__(self) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer
        d = model_dir()
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(2, min(6, (os.cpu_count() or 4) // 2))
        self.sess = ort.InferenceSession(str(d / "model_qint8_avx512_vnni.onnx"), opts, providers=["CPUExecutionProvider"])
        self.tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        self.tok.enable_truncation(MAX_TOKENS)
        self.tok.enable_padding()

    def encode(self, texts: list[str]) -> np.ndarray:
        enc = self.tok.encode_batch(texts)
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        out = self.sess.run(None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)})[0]
        m = mask[:, :, None].astype(np.float32)
        v = (out * m).sum(axis=1) / np.maximum(m.sum(axis=1), 1e-9)
        return (v / np.linalg.norm(v, axis=1, keepdims=True)).astype(np.float32)


# ------------------------------------------------------------------ index (built once, per book, resumable)
class Library:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.emb: Embedder | None = None
        self.vectors: np.ndarray | None = None
        self.rows: list[dict] = []
        self.state: dict = {"status": "idle"}
        self.thread: threading.Thread | None = None

    def _embedder(self) -> Embedder:
        if self.emb is None:
            self.emb = Embedder()
        return self.emb

    def available(self) -> bool:
        return (model_dir() / "tokenizer.json").exists() and textbook_dir().exists()

    def status(self) -> dict:
        meta = json.loads((INDEX_DIR / "meta.json").read_text()) if (INDEX_DIR / "meta.json").exists() else {}
        books = sorted(p.name for p in textbook_dir().glob("*.pdf")) if textbook_dir().exists() else []
        return {**self.state, "folder": str(textbook_dir()), "books_in_folder": len(books), "model_ready": self.available(),
                "index": meta, "loaded_passages": len(self.rows)}

    def build(self, force: bool = False) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._build, args=(force,), daemon=True)
        self.thread.start()

    def _build(self, force: bool) -> None:
        t0 = time.time()
        books = sorted(textbook_dir().glob("*.pdf"))
        (INDEX_DIR / "books").mkdir(parents=True, exist_ok=True)
        self.state = {"status": "building", "done": 0, "total": len(books), "current": "", "started": t0}
        try:
            emb = self._embedder()
            for i, b in enumerate(books):
                self.state.update(current=b.name, done=i)
                cache = INDEX_DIR / "books" / (b.stem + ".npz")
                sig = f"{b.stat().st_size}-{int(b.stat().st_mtime)}"
                if cache.exists() and not force:
                    try:
                        if str(np.load(cache, allow_pickle=False)["sig"]) == sig:
                            continue
                    except Exception:
                        pass
                rows = read_book(b)
                vecs = [emb.encode(["passage: " + r["text"] for r in rows[j:j + BATCH]]) for j in range(0, len(rows), BATCH)]
                v = np.vstack(vecs).astype(np.float16) if vecs else np.zeros((0, 384), np.float16)
                np.savez(cache, v=v, rows=json.dumps(rows, ensure_ascii=False), sig=sig)
            self._merge(books)
            meta = {"built_at": time.time(), "books": len(books), "passages": len(self.rows),
                    "seconds": round(time.time() - t0), "model": "multilingual-e5-small (int8)"}
            (INDEX_DIR / "meta.json").write_text(json.dumps(meta))
            self.state = {"status": "ready", "done": len(books), "total": len(books)}
        except Exception as ex:
            self.state = {"status": "error", "error": str(ex)}

    def _merge(self, books: list[Path]) -> None:
        vecs, rows = [], []
        for b in books:
            cache = INDEX_DIR / "books" / (b.stem + ".npz")
            if cache.exists():
                z = np.load(cache, allow_pickle=False)
                vecs.append(z["v"])
                rows += json.loads(str(z["rows"]))
        with self.lock:
            self.vectors = np.vstack(vecs).astype(np.float32) if vecs else None
            self.rows = rows

    def load(self) -> bool:
        if self.vectors is not None:
            return True
        if not (INDEX_DIR / "meta.json").exists():
            return False
        self._merge(sorted(textbook_dir().glob("*.pdf")))
        return self.vectors is not None

    def search(self, query: str, k: int = 3, min_score: float = MIN_SCORE) -> list[dict]:
        """Best-matching textbook paragraphs for a question; [] if nothing is close enough.
        Measured on this index: textbook questions score about 0.86-0.90, small talk 0.80-0.85."""
        if len(query.split()) < 3 or not self.load():
            return []
        q = self._embedder().encode(["query: " + query.strip()[:500]])[0]
        with self.lock:
            scores = self.vectors @ q
            top = np.argsort(-scores)[: k * 3]
            out, seen = [], set()
            for i in top:
                if scores[i] < min_score:
                    break
                r = self.rows[int(i)]
                key = (r["file"], r["page"])
                if key in seen:
                    continue
                seen.add(key)
                out.append({**r, "score": round(float(scores[i]), 3)})
                if len(out) >= k:
                    break
        return out


library = Library()


def context_block(hits: list[dict], lang: str) -> str:  # noqa: ARG001
    """Background facts from the textbooks for the AI. It must use them silently: no quoting, no mention of sources."""
    notes = []
    for h in hits:
        text = h["text"]
        if len(text) > PASSAGE_CHARS:  # keep the AI's reading short: first sentences of the best paragraphs
            cut = text.rfind(". ", 0, PASSAGE_CHARS)
            text = text[: cut + 1 if cut > PASSAGE_CHARS // 2 else PASSAGE_CHARS]
        notes.append("- " + text)
    limit = PASSAGE_CHARS if lang != "kn" else 280  # the Kannada model reads slowly
    notes = [n[:limit + 2] for n in notes]
    return "Syllabus facts (use silently to stay correct; never mention them; ignore if unrelated):\n" + "\n".join(notes)
