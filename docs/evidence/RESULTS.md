# Measured results (19 Nov 2026)

Computer: 13th Gen Intel Core i5-1340P, 12 cores / 16 threads, 15.6 GB, Windows 11
Test: full (3 repeats, median), took 173 minutes. Goal: balanced. Languages: English, Kannada.

## Headline

- **This computer can serve about 6 students comfortably** (simulated, tested up to 10; limits ≥ 5.0 tokens/s typical, ≤ 3.0 s slow-case first word).
- Recommended: **Qwen3.5 2B · light** (all cores, smaller context). Best balance of speed and quality: it kept answer quality within 3 points of the best version in English and Kannada, writes about 14 tokens a second, and leaves 10.8 GB memory free.
- Fast model for busy periods: none (already_fastest)
- What measuring taught us: Writing with 12 threads gave 13.8 tokens/s versus 12.6 with 6 (+9%). Going from the 2B to the 4B model changed Indian-language accuracy (Kannada 65% → 82%) but cut writing speed from 13.8 to 6.4 tokens/s: the trade-off the goal setting decides.

## All settings

| setting | detail | threads | writing tokens/s | first word s | memory GB | noisy | EN | KN | HI | passed | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3.5 2B · light | half the cores | 6 | 12.6 | 0.27 | 2.32 |  | 91 | 65 | – | True |  |
| Qwen3.5 2B · light | all cores | 12 | 13.8 | 0.28 | 2.34 |  | 91 | 65 | – | True |  |
| Qwen3.5 2B · light | all cores, bigger batch | 12 | 13.8 | 0.28 | 2.35 |  | 91 | 65 | – | True |  |
| Qwen3.5 2B · light | all cores, smaller context | 12 | 13.8 | 0.27 | 2.34 |  | 91 | 65 | – | True |  |
| Qwen3.5 2B · balanced | all cores | 12 | 12.6 | 0.31 | 2.01 |  | 90 | 58 | – | False | answer quality dropped too much |
| Qwen3.5 2B · reference | all cores (reference) | 12 | 10.7 | 0.30 | 2.54 |  | 94 | 62 | – | True |  |
| Qwen3.5 4B · light | all cores | 12 | 6.4 | 0.48 | 5.37 |  | 95 | 82 | – | False | answer quality dropped too much |
| Qwen3.5 4B · balanced | all cores | 12 | 5.9 | 0.57 | 4.48 |  | 100 | 80 | – | True |  |
| Qwen3.5 0.8B · light | all cores (fast candidate) | 12 | 24.3 | 0.23 | 1.32 |  | 71 | 28 | – | False | answer quality dropped too much |

## Capacity steps

| students | answers | typical tokens/s | slow-case first word s | comfortable |
|---|---|---|---|---|
| 1 | 4 | 14.29 | 1.44 | yes |
| 2 | 7 | 10.98 | 0.72 | yes |
| 4 | 13 | 9.17 | 0.79 | yes |
| 6 | 18 | 5.2 | 0.65 | yes |
| 8 | 16 | 3.34 | 0.79 | no |
| 10 | 20 | 3.0 | 0.98 | no |

Capacity was measured again on 19 Nov 2026 04:38 with nothing else running, because the first capacity run overlapped a manual dashboard simulation.

## Quality per model file

- Qwen3.5-2B-Q4_K_M.gguf: Belebele eng_Latn 34/40 (85%); Belebele hin_Deva 21/40 (52%); Belebele kan_Knda 26/40 (65%); ARC-Easy 39/40 (98%)
- Qwen3.5-2B-Q8_0.gguf: Belebele eng_Latn 36/40 (90%); Belebele hin_Deva 22/40 (55%); Belebele kan_Knda 25/40 (62%); ARC-Easy 39/40 (98%)
- Qwen3.5-2B-Q5_K_M.gguf: Belebele eng_Latn 34/40 (85%); Belebele hin_Deva 22/40 (55%); Belebele kan_Knda 23/40 (58%); ARC-Easy 38/40 (95%)
- Qwen3.5-4B-Q4_K_M.gguf: Belebele eng_Latn 37/40 (92%); Belebele hin_Deva 33/40 (82%); Belebele kan_Knda 33/40 (82%); ARC-Easy 39/40 (98%)
- Qwen3.5-4B-Q8_0.gguf: Belebele eng_Latn 40/40 (100%); Belebele hin_Deva 33/40 (82%); Belebele kan_Knda 33/40 (82%); ARC-Easy 40/40 (100%)
- Qwen3.5-4B-Q5_K_M.gguf: Belebele eng_Latn 40/40 (100%); Belebele hin_Deva 33/40 (82%); Belebele kan_Knda 32/40 (80%); ARC-Easy 40/40 (100%)
- Qwen3.5-0.8B-Q4_K_M.gguf: Belebele eng_Latn 27/40 (68%); Belebele hin_Deva 20/40 (50%); Belebele kan_Knda 11/40 (28%); ARC-Easy 30/40 (75%)
- Qwen3.5-0.8B-Q8_0.gguf: Belebele eng_Latn 29/40 (72%); Belebele hin_Deva 20/40 (50%); Belebele kan_Knda 12/40 (30%); ARC-Easy 32/40 (80%)

## Acceptance tests

See ACCEPTANCE.md.

Only these numbers go on slides. Re-run on the presentation laptop before the event.