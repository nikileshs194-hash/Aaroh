"""Compare textbook search: meaning-only vs hybrid (meaning + keyword). A question counts as found when the paragraph
given to the AI contains the topic's key term(s). Writes docs/evidence/HYBRID_SEARCH.md."""
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))
from app.textbooks import library  # noqa: E402

QS = [  # (question, any of these words must appear in the paragraph)
    ("What is photolysis of water?", ["photolysis"]),
    ("State Ohm's law.", ["ohm"]),
    ("What are the Fundamental Rights in the Indian Constitution?", ["fundamental rights"]),
    ("What is the Pythagoras theorem?", ["pythagoras"]),
    ("What is the function of the placenta?", ["placenta"]),
    ("What is Mendel's law of segregation?", ["segregation"]),
    ("Define the SI unit of electric current, the ampere.", ["ampere"]),
    ("What is a galvanometer used for?", ["galvanometer"]),
    ("What is the role of chlorophyll?", ["chlorophyll"]),
    ("What is an isotope? Give an example.", ["isotope"]),
    ("What is the Rowlatt Act?", ["rowlatt"]),
    ("What is the Calvin cycle?", ["calvin"]),
    ("What are alkanes?", ["alkane"]),
    ("What is the formula for the area of a trapezium?", ["trapezium"]),
    ("What is an arithmetic progression?", ["arithmetic progression"]),
    ("What causes tides in the sea?", ["tide"]),
    ("How do plants make their own food?", ["photosynthesis", "chlorophyll", "food"]),
    ("Why does iron get a brown coating when left in moist air?", ["rust"]),
    ("How does blood carry oxygen in our body?", ["haemoglobin", "hemoglobin", "oxygen"]),
    ("What happens to light when it passes through a prism?", ["prism", "dispersion", "spectrum"]),
    ("Why do we have different seasons?", ["season"]),
    ("What is power sharing in a democracy?", ["power sharing"]),
    ("How is soil formed?", ["soil"]),
    ("What is the difference between speed and velocity?", ["velocity"]),
]
SMALL_TALK = ["hello, how are you?", "tell me a joke please", "what is your name?", "thank you so much",
              "write a poem about my mother", "best mobile phone under 10000", "who won the cricket world cup in 2023?", "how to make tea"]


def run(hybrid: bool):
    library.hybrid = hybrid
    hits1 = hits2 = 0
    ms = []
    rows = []
    for q, keys in QS:
        t = time.perf_counter()
        h = library.search(q, 2)
        ms.append((time.perf_counter() - t) * 1000)
        ok = [any(k in x["text"].lower() for k in keys) for x in h]
        hits1 += bool(ok[:1] and ok[0])
        hits2 += any(ok)
        rows.append((q, h[0] if h else None, bool(ok[:1] and ok[0])))
    talk = sum(1 for s in SMALL_TALK if library.search(s, 2))
    return hits1, hits2, sorted(ms)[len(ms) // 2], talk, rows


if __name__ == "__main__":
    t0 = time.perf_counter()
    library.load()
    library.search("warm up the search model please", 1)
    print(f"index + keyword table ready in {time.perf_counter() - t0:.1f} s")
    old = run(False)
    new = run(True)
    n = len(QS)
    L = ["# Textbook search: meaning-only vs hybrid (measured on this laptop)", "",
         f"{n} textbook questions; found = the paragraph given to the AI contains the topic's key term.", "",
         "| search | found in 1st paragraph | found in 1st or 2nd | median search time | small talk matched (of 8) |",
         "|---|---|---|---|---|",
         f"| meaning only (before) | {old[0]}/{n} | {old[1]}/{n} | {old[2]:.0f} ms | {old[3]} |",
         f"| hybrid: meaning + keyword (now) | {new[0]}/{n} | {new[1]}/{n} | {new[2]:.0f} ms | {new[3]} |", "",
         "| question | before: 1st paragraph | ok | now: 1st paragraph | ok |", "|---|---|---|---|---|"]
    for (q, a, oka), (_, b, okb) in zip(old[4], new[4]):
        f = lambda h: f"Class {h['class']} {h['subject']} p.{h['page']}" if h else "none"
        L.append(f"| {q} | {f(a)} | {'yes' if oka else 'no'} | {f(b)} | {'yes' if okb else 'no'} |")
    os.makedirs(os.path.join(ROOT, "docs", "evidence"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "evidence", "HYBRID_SEARCH.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:7]))
    for (q, a, oka), (_, b, okb) in zip(old[4], new[4]):
        if oka != okb:
            print(("BETTER " if okb else "WORSE  ") + q)
