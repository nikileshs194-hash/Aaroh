"""Safety layer (F23): school-appropriate instructions, blocked topics, polite refusals."""
from __future__ import annotations

import re
import unicodedata

from . import db

LANG_NAME = {"en": "English", "kn": "Kannada", "hi": "Hindi"}

SYSTEM_PROMPT = (
    # Kept short on purpose: every word here is read by the processor before each answer.
    # Measured: on the Kannada model every 100 words of instructions adds about 3 s before the first word.
    "You are Aaroh, an expert school tutor in India. Give the direct answer first, then 2-4 short key points with "
    "**bold** key terms. Be precise and concise, under 150 words. No emojis, no filler. Give an example only if it is "
    "simple and certainly correct. Never ask for personal details; refuse unsafe, adult or cheating requests; if a "
    "student seems unsafe, suggest a trusted adult and Tele-MANAS 14416. If unsure, say so."
)


def language_instruction(lang: str) -> str:
    if lang == "kn":
        # Measured: this wording gave clearer, more correct Kannada than a one-line instruction (see docs/evidence).
        return ("Reply only in clear, standard Kannada (ಕನ್ನಡ) with short sentences; keep rare science terms in English "
                "in brackets. Do not repeat sentences.")
    if lang == "hi":
        return "Always reply in Hindi (हिन्दी) in Devanagari script, using simple words."
    return "Reply in clear English."


# Patterns are deliberately conservative: block clearly unsafe requests, not school topics
# like 'explosion of a star' or 'drug resistance in bacteria'.
DEFAULT_BLOCKED = {
    "weapons": [r"\b(make|build|assemble)\b.{0,30}\b(bomb|gun|pistol|explosive|grenade)s?\b", r"\bhow to kill\b"],
    "self_harm": [r"\b(kill|hurt|harm)\s+(myself|me)\b", r"\bsuicide\b", r"\bend my life\b", r"\bcut myself\b"],
    "drugs": [r"\b(buy|make|cook|get)\b.{0,20}\b(drugs|weed|ganja|cocaine|heroin|meth|mdma)\b"],
    "adult": [r"\bporn\w*\b", r"\bsex(y|ual)?\s+(story|video|photo|pics?)\b", r"\bnude(s)?\b"],
    "hacking": [r"\bhack\w*\b.{0,30}\b(account|password|wifi|instagram|facebook|whatsapp)\b", r"\bsteal\b.{0,20}\bpassword"],
    "cheating": [r"\b(answers?|paper)\b.{0,20}\b(leak|leaked)\b", r"\bcheat\w*\b.{0,20}\b(exam|test)\b"],
    "gambling": [r"\b(betting|gambl\w*|satta)\b"],
    "hate": [r"\b(jokes?|insult\w*)\b.{0,25}\b(caste|religion|muslims?|hindus?|christians?|dalits?)\b"],
}

REFUSALS = {
    "en": "I can't help with that here. This assistant is for learning. Please ask your teacher if you have questions about this.",
    "kn": "ಇದಕ್ಕೆ ನಾನು ಇಲ್ಲಿ ಸಹಾಯ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. ಇದು ಕಲಿಕೆಗಾಗಿ ಇರುವ ಸಹಾಯಕ. ಈ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ನಿಮ್ಮ ಶಿಕ್ಷಕರನ್ನು ಕೇಳಿ.",
    "hi": "मैं यहाँ इसमें मदद नहीं कर सकता। यह सहायक पढ़ाई के लिए है। इस बारे में सवाल हों तो अपने शिक्षक से पूछें।",
}
SELF_HARM = {
    "en": "I'm really sorry you're feeling this way. You are not alone. Please talk to a teacher, parent or someone you trust right now. You can also call Tele-MANAS on 14416 (free, any time).",
    "kn": "ನಿಮಗೆ ಹೀಗೆ ಅನಿಸುತ್ತಿರುವುದಕ್ಕೆ ವಿಷಾದವಿದೆ. ನೀವು ಒಬ್ಬರೇ ಅಲ್ಲ. ದಯವಿಟ್ಟು ಈಗಲೇ ಶಿಕ್ಷಕರು, ಪೋಷಕರು ಅಥವಾ ನೀವು ನಂಬುವವರ ಜೊತೆ ಮಾತನಾಡಿ. ಟೆಲಿ-ಮಾನಸ್ 14416 ಗೆ ಉಚಿತವಾಗಿ ಕರೆ ಮಾಡಬಹುದು.",
    "hi": "मुझे दुख है कि आप ऐसा महसूस कर रहे हैं। आप अकेले नहीं हैं। कृपया अभी किसी शिक्षक, माता-पिता या भरोसेमंद व्यक्ति से बात करें। आप टेली-मानस 14416 पर मुफ़्त कॉल कर सकते हैं।",
}
EXAM_MODE = {
    "en": "Student chat is switched off by your teacher right now (exam time). Please try again later.",
    "kn": "ಈಗ ಪರೀಕ್ಷೆಯ ಸಮಯ, ಶಿಕ್ಷಕರು ವಿದ್ಯಾರ್ಥಿ ಚಾಟ್ ಅನ್ನು ಆಫ್ ಮಾಡಿದ್ದಾರೆ. ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
    "hi": "अभी परीक्षा का समय है, शिक्षक ने छात्र चैट बंद की है। बाद में कोशिश करें।",
}


def _normalise(text: str) -> str:
    t = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"\s+", " ", t)


def check(text: str) -> str | None:
    """Return the blocked category, or None if the question is fine."""
    t = _normalise(text)
    for cat, pats in DEFAULT_BLOCKED.items():
        for p in pats:
            if re.search(p, t):
                return cat
    for word in db.get_setting("blocked_topics") or []:
        w = _normalise(str(word)).strip()
        if w and w in t:
            return "custom"
    return None


def refusal(category: str, lang: str) -> str:
    table = SELF_HARM if category == "self_harm" else REFUSALS
    return table.get(lang, table["en"])


PII = [
    (re.compile(r"\b[6-9]\d{9}\b"), "a phone number"),
    (re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"), "an Aadhaar-like number"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "an email address"),
]


def pii_warning(text: str) -> str | None:
    for pat, what in PII:
        if pat.search(text):
            return what
    return None
