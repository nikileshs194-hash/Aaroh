# Textbook knowledge: measured on this laptop (20 Nov 2026)

- Books: 41 NCERT PDFs, Class 1 to 12 (Maths, Science/EVS, Social Science, Physics, Chemistry, Biology)
- Index: 29,290 paragraphs, built in 30 minutes; search takes about 0.03 s per question
- Search model: multilingual-E5-small (MIT licence, int8 ONNX, offline)
- Relevance cut-off 0.855: textbook questions scored 0.86 to 0.90, small talk ("hello", "thank you") 0.80 to 0.85, so small talk is not matched
- Kannada questions are first turned into an English search phrase by the fast 2B model (NCERT books are in English)
- The facts are used silently: answers are written in Aaroh's own words and do not cite the books

## Effect on answers (same questions, textbook knowledge off vs on)

| question | without textbooks | with textbooks |
|---|---|---|
| SI unit of electric current | Ampere, but a wrong definition ("one joule of heat per second") | Ampere = rate of flow of charge (1 coulomb per second) |
| Kannada: why is respiration exothermic | vague, partly off-topic | glucose and oxygen react and release heat (correct) |
| Kannada: what is photosynthesis | earlier version said it makes "hemoglobin" | CO2 + water + light -> glucose + oxygen, chlorophyll (correct) |

## Cost
- Time to first word with textbook facts: English about 0.4 to 4 s; Kannada about 7 to 9 s (the 4B Kannada model reads about 36 tokens/s on this CPU, so instructions are kept short)

Small samples: indicators, not proof. Small models can still make mistakes; Kannada answers keep the "please check" label.
