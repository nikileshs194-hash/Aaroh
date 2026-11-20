# What we took from the research resource list (AAROH_AI_CPU_Inference_Resources.pdf)

Measured on this laptop (Intel Core i5-1340P, 12 cores / 16 threads, 15.6 GB), 20 Nov 2026.

## Already in Aaroh (matches the PDF's roadmap steps 1-7)
llama.cpp + GGUF engine; benchmark of thread counts and Q4/Q5/Q8; hardware profiling; model recommendation;
capacity estimation from simulated classroom load; adaptive controller (quality -> fast -> protect); fair queue and
rate limit; multilingual quality guard (Belebele English/Kannada, ARC-Easy).

## Added now
1. **8-bit KV cache + flash attention** (idea from He et al., arXiv:2407.07304: reduce KV-cache size while keeping precision).
   llama.cpp options `-fa on -ctk q8_0 -ctv q8_0`, on by default, switch in Admin > Settings > Advanced.

   | model | setting | prompt reading (tok/s) | writing (tok/s) | engine memory (GB) | accuracy (40 Belebele questions) |
   |---|---|---|---|---|---|
   | Qwen3.5 2B Q4_K_M (8 slots x 3072) | llama.cpp default | 86.2 | 14.4 | 1.29 | English 87.5% |
   | | flash attention + 8-bit KV | 95.3 | 15.1 | 1.16 | English 85.0% (1 question; within the 3-point margin) |
   | Qwen3.5 4B Q4_K_M (2 slots x 3072) | llama.cpp default | 37.6 | 6.7 | 2.02 | Kannada 80.0% |
   | | flash attention + 8-bit KV | 37.5 | 6.9 | 1.93 | Kannada 80.0% |

   The saving is modest because Qwen3.5 is a hybrid model: most of its layers keep a small fixed state instead of a
   growing KV cache. The setting helps more with standard transformer models and longer conversations.
2. **Memory speed in the Hardware Passport** (the PDF: "CPU inference can become memory-bound"). A one-core copy test
   (rough indicator, about 1 s at start-up).

## Not adopted, with reasons
- PowerInfer: needs a GPU (CPU-GPU hybrid); Aaroh targets CPU-only school PCs.
- Intel xFasterTransformer: archived/read-only with known security issues (as the PDF itself warns).
- Distributed multi-PC inference (arXiv:2407.00029): measured on Xeon servers; a future option for large labs
  (llama.cpp's RPC server could split a model across PCs), not needed for one-PC classrooms today.
- llama-cpp-python: Aaroh already talks to llama.cpp's own server API, which keeps the engine in a separate,
  restartable process (crash recovery).
