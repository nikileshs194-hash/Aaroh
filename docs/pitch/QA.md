# Judge questions: short, honest answers

Each answer points to something you can **show** in the app. Numbers in [brackets] come from `docs\evidence\RESULTS.md` (measured on this laptop).

**Isn't this just a wrapper around llama.cpp?**
llama.cpp is the engine, like a car engine. On top of it we built what a school needs: measuring each PC, guarding answer quality per language, predicting classroom capacity, adapting under load, and proving privacy, all usable by a teacher. *Show: Results page (9 settings measured, rejected ones with reasons).*

**Ollama and LM Studio already exist.**
They run a model with default settings for one user. They do not test each machine, predict how many students it can serve, check Kannada quality or switch models under load, and they are built for developers.

**What about VectorPrime or similar tuners?**
Command-line tools that pick a setting once. We share the idea of automatic tuning and go further: capacity for a whole class, quality per language, continuous adaptation and a simple admin interface for the school. We name them on our comparison slide.

**Why not cloud AI?**
More than a third of schools have no internet, cloud use sends children's data off the premises, and costs grow with use. Where internet exists, schools can still use both.

**Small models make mistakes.**
Yes. We measure quality, reject settings that lower it, label every answer "AI can make mistakes", put a "please check" label on Kannada until a teacher reviews, and position it for explanations and drafts, not exams.

**How good is Kannada?**
Weaker than English, and we show it. On a Kannada reading test (Belebele, 40 questions) the 2B model scored 65% and the 4B 82.5%, so Aaroh sends Kannada questions to the 4B model automatically while English stays on the faster 2B (Kannada answers start in about 1.5 to 2 s and write at about 6 tokens a second). Simple facts come out right; science explanations can still contain mistakes, which is why every Kannada answer carries a "please check with your teacher" label. Better Kannada models drop in as they are released, and Aaroh measures them the same way.

**How did you measure "serves N students"?**
Virtual students ask realistic classroom questions, read, pause 10 to 30 seconds, and ask again, in steps of 1, 2, 4, 6, 8, 10 and 12. N is the largest group where the typical writing speed stays at least 5 tokens a second and the slow-case (95th percentile) first word stays within 3 seconds. It is labelled a simulation, and we checked it with real tabs and phones.

**What did you discover by measuring?**
On this laptop, *reading* the question is fastest with all 16 logical threads (compute is the limit), while *writing* the answer is fastest on the 12 physical cores; pushing writing onto all 16 threads was about 20% slower in llama.cpp's own benchmark (11 vs 14 tokens/s for the 2B model). Giving prompt reading more threads made it 45% faster for the 4B model. Aaroh sets the two separately; a default setup uses one number for both. *Show: Results table, "half the cores" vs "all cores".*

**Where is the AI or ML?**
The product runs and evaluates language models; selection is a multi-objective optimisation over measured data (speed, quality, memory, first word, weighted by the school's goal); the controller is an autonomous feedback loop; the roadmap adds learning the best setting from many schools' results.

**Is it agentic AI?**
The controller observes every 2 seconds, decides with waiting periods (20 s to switch, 60 s to switch back), acts by routing new questions, and explains every decision in plain words. We use rules rather than a small chatbot to control it, because rules are predictable and testable. *Show: Dashboard → Simulate 10 students → the timeline.*

**Can students misuse it?**
Students only see a chat with school-appropriate instructions, a blocked-topics filter, a "report this answer" button, a per-device rate limit, and an exam switch that turns student chat off. Red-team result on this laptop: 20/20 unsafe prompts handled, 10/10 normal questions answered (self-harm messages get a caring reply with Tele-MANAS 14416, not a cold refusal).

**Is it legal under the DPDP rules?**
It is built for data minimisation: students choose a username (no phone, email or Aadhaar), passwords are stored only as secure hashes, each student's chats stay on the school computer under their own account and can be deleted by them at any time, voice is never recorded to disk, and nothing is sent outside the school. That supports compliance; it is not a legal certificate, and we say so.

**How is the privacy counter trustworthy?**
Every second it reads the operating system's own connection list for our programs. Press "Test the watcher": it deliberately opens one outside connection and shows it was caught. We count connections, not bytes, because a reliable per-program byte count is not available everywhere.

**What if the PC is very old?**
The Hardware Passport says honestly what it can do, and the classroom PC simulator lets us test a 4-core, 8 GB machine on this laptop (results are labelled "Simulated"). A 4 GB PC can still run a tiny model for a few users; if it cannot, Aaroh says so instead of failing in class.

**Power cuts?**
The engine watchdog restarts a crashed engine by itself (measured: back in 5 s), and with "start when switched on" Aaroh comes back with the last good setting after a reboot.

**Can it scale to a lab of 40?**
One PC serves as many as its capacity allows; beyond that, add a second PC. The capacity planner tells you exactly when that is needed.

**Who pays?**
The core is free for schools. Income comes from deployment, training and support for state programmes, CSR funders and low-cost AI-PC makers.

**Why would a state choose this over its own system?**
Karnataka and Kerala are already buying or building local AI. Aaroh is the open, hardware-independent layer that tunes any such PC for a whole class, and it can run their models.

**Can students speak instead of type?**
Yes, in English and Kannada, fully offline. Two free open models run on the school computer: NVIDIA Parakeet for English and AI4Bharat's IndicConformer for Kannada. Measured on this laptop with 10 real recordings each: about 3 words in 100 wrong in both languages, about 1.5 seconds per sentence. The text appears in the box first so the student can correct it. *Show: tap the microphone, speak in Kannada.*

**What would you build next?**
Textbook-grounded answers, a teacher studio for lesson plans and quizzes (we built one and set it aside to keep this prototype student-focused), a fleet view for officials, and a shared settings database so new schools skip testing.

**Did you write the code?**
"I designed the product, research and system, and built it with an AI coding assistant. I can explain every part and run it live."
