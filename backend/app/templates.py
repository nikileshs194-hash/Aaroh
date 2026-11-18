"""Teacher Studio templates (F11). Fields are chosen from lists; no student names are ever needed."""
from __future__ import annotations

from .safety import LANG_NAME

CLASSES = ["6", "7", "8", "9", "10", "11", "12", "College"]
SUBJECTS = {
    "Science": ["Crop production", "Microorganisms", "Force and pressure", "Light", "Matter in our surroundings",
                "Atoms and molecules", "The fundamental unit of life", "Motion", "Life processes",
                "Chemical reactions and equations", "Acids, bases and salts", "Electricity",
                "Magnetic effects of electric current", "Our environment", "Photosynthesis"],
    "Mathematics": ["Rational numbers", "Linear equations", "Squares and square roots", "Polynomials",
                    "Coordinate geometry", "Triangles", "Quadrilaterals", "Circles", "Surface areas and volumes",
                    "Statistics", "Probability", "Quadratic equations", "Arithmetic progressions", "Trigonometry"],
    "Social Science": ["Resources and development", "The rise of nationalism", "Democracy and diversity",
                       "Water resources", "Agriculture", "Money and credit", "Globalisation", "Indian Constitution",
                       "History of Karnataka", "Climate of India"],
    "English": ["Reading comprehension", "Letter writing", "Essay writing", "Tenses", "Active and passive voice",
                "Reported speech", "Poetry appreciation"],
    "Kannada": ["ಗದ್ಯ ಪಾಠ", "ಪದ್ಯ ಪಾಠ", "ವ್ಯಾಕರಣ", "ಪತ್ರ ಲೇಖನ", "ಪ್ರಬಂಧ"],
    "Hindi": ["गद्य पाठ", "कविता", "व्याकरण", "पत्र लेखन", "निबंध"],
    "Computer Science / AI": ["What is AI?", "Computational thinking", "Algorithms and flowcharts",
                              "Data and patterns", "Responsible use of AI", "Internet safety", "Python basics"],
}
DURATIONS = ["30", "40", "45", "60", "90"]

TEMPLATES = {
    "lesson_plan": {"icon": "notebook-pen", "fields": ["class", "subject", "chapter", "duration", "language"]},
    "quiz": {"icon": "list-checks", "fields": ["class", "subject", "chapter", "count", "language"]},
    "worksheet": {"icon": "file-pen-line", "fields": ["class", "subject", "chapter", "count", "language"]},
    "explain": {"icon": "lightbulb", "fields": ["class", "subject", "topic", "language"]},
    "translate": {"icon": "languages", "fields": ["text", "language"]},
}


def catalogue() -> dict:
    return {"templates": TEMPLATES, "classes": CLASSES, "subjects": SUBJECTS, "durations": DURATIONS,
            "counts": ["5", "10", "15", "20"], "languages": ["en", "kn", "hi"]}


def title_for(template: str, f: dict) -> str:
    chap = f.get("chapter") or f.get("topic") or ""
    names = {"lesson_plan": "Lesson plan", "quiz": "Quiz", "worksheet": "Worksheet", "explain": "Explanation",
             "translate": "Translation"}
    base = names.get(template, template)
    extra = f" ({f['part']})" if f.get("part") else ""
    if template == "translate":
        return f"{base} to {LANG_NAME.get(f.get('language', 'en'))}"
    cls = f"Class {f['class']}" if f.get("class") and f.get("class") != "College" else (f.get("class") or "")
    return " · ".join(x for x in [base + extra, cls, chap] if x)


def build_prompt(template: str, f: dict) -> tuple[str, int]:
    """Returns (user prompt, max tokens)."""
    lang = LANG_NAME.get(f.get("language", "en"), "English")
    cls = f.get("class", "9")
    level = "college students" if cls == "College" else f"Class {cls} students in an Indian school (state board / NCERT level)"
    subj, chap = f.get("subject", "Science"), f.get("chapter") or f.get("topic") or ""
    part = f" This is {f['part']} of the chapter; focus on the part that fits that position." if f.get("part") else ""
    if template == "lesson_plan":
        dur = f.get("duration", "40")
        return (f"Write a {dur}-minute lesson plan in {lang} for {level}. Subject: {subj}. Chapter: {chap}.{part}\n"
                "Use these headings exactly: Learning goals; Materials; Introduction (time); Main activity (time); "
                "Explanation with a local Indian example; Check for understanding (3 quick questions); Homework. "
                "Keep it practical for a classroom with few resources. Do not include any student names.", 900)
    if template == "quiz":
        n = int(f.get("count", 10))
        return (f"Make a {n}-question multiple-choice quiz in {lang} for {level}. Subject: {subj}. Chapter: {chap}.\n"
                "Number the questions. Give four options (A, B, C, D) for each. "
                "At the end, under the heading 'Answer key', list the correct letters.", 140 + 70 * n)
    if template == "worksheet":
        n = int(f.get("count", 10))
        return (f"Make a practice worksheet in {lang} for {level}. Subject: {subj}. Chapter: {chap}.\n"
                f"Include {n} questions mixing: fill in the blanks, true or false, short answers and one activity. "
                "Add an answer key at the end.", 140 + 60 * n)
    if template == "explain":
        return (f"Explain '{chap}' ({subj}) simply in {lang} for {level}. "
                "Use short sentences, one everyday Indian example, and end with a two-line summary.", 450)
    if template == "translate":
        return (f"Translate the following text into {lang}. Keep the meaning and school terms accurate. "
                f"Give only the translation.\n\n{f.get('text', '')}", 900)
    raise ValueError("unknown template")


def followup_prompt(kind: str, lang: str) -> str:
    ln = LANG_NAME.get(lang, "English")
    return {
        "simpler": f"Explain that again more simply, in {ln}, for a younger student. Use shorter sentences.",
        "example": f"Give one more everyday Indian example for that, in {ln}.",
    }[kind]
