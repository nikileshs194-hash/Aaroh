# Judge questions: short, honest answers

Each answer points to something you can **show** in the app. Numbers in [brackets] come from `docs\evidence\RESULTS.md` (measured on this laptop).

**Isn't this just a wrapper around llama.cpp?**
llama.cpp is the engine, like a car engine. On top of it we built what a school needs: measuring each PC, guarding answer quality per language, predicting classroom capacity, adapting under load, and proving privacy, all usable by a teacher. *Show: Results page (8 settings measured, rejected ones with reasons).*

**Ollama and LM Studio already exist.**
They run a model with default settings for one user. They do not test each machine, predict how many students it can serve, check Kannada quality or switch models under load, and they are built for developers.

**What about VectorPrime or similar tuners?**
Command-line tools that pick a setting once. We share the idea of automatic tuning and go further: capacity for a whole class, quality per language, continuous adaptation and a teacher interface. We name them on our comparison slide.

**Why not cloud AI?**
More than a third of schools have no internet, cloud use sends children's data off the premises, and costs grow with use. Where internet exists, schools can still use both.

**Small models make mistakes.**
Yes. We measure quality, reject settings that lower it, label every answer "AI can make mistakes", put a "please check" label on Kannada and Hindi until a teacher reviews, and position it for explanations and drafts, not exams.

**How good is Kannada?**
Weaker than English, and we show the measured score [Kannada accuracy]. On this laptop the 4B model's Kannada is clearly better than the 2B's, and the 0.8B's is not usable. That is exactly why the quality guard exists. Teachers review Kannada output; better Indian-language models drop in as they are released.

**How did you measure "serves N students"?**
Virtual students ask realistic classroom questions, read, pause 10 to 30 seconds, and ask again, in steps of 1, 2, 4, 6, 8, 10 and 12. N is the largest group where the typical writing speed stays at least 5 tokens a second and the slow-case (95th percentile) first word stays within 3 seconds. It is labelled a simulation, and we checked it with real tabs and phones.

**What did you discover by measuring?**
On this laptop, *writing* an answer is fastest with about 6 threads (memory speed is the limit), while *reading* the question is fastest with all 16 threads (compute is the limit). Using all threads for writing was about 20% slower. InferSmart sets the two separately. A default setup would miss this. *Show: Results table, "half the cores" vs "all cores".*

**Where is the AI or ML?**
The product runs and evaluates language models; selection is a multi-objective optimisation over measured data (speed, quality, memory, first word, weighted by the school's goal); the controller is an autonomous feedback loop; the roadmap adds learning the best setting from many schools' results.

**Is it agentic AI?**
The controller observes every 2 seconds, decides with waiting periods (20 s to switch, 60 s to switch back), acts by routing new questions, and explains every decision in plain words. We use rules rather than a small chatbot to control it, because rules are predictable and testable. *Show: Dashboard → Simulate 10 students → the timeline.*

**Can students misuse it?**
Students only see a chat with school-appropriate instructions, a blocked-topics filter, a "report this answer" button, a per-device rate limit, and an exam switch that turns student chat off. Red-team result: [unsafe prompts handled X/20, normal questions answered Y/10].

**Is it legal under the DPDP rules?**
It is built for data minimisation: no student accounts, no chats stored on the server, nothing sent outside the school. That supports compliance; it is not a legal certificate, and we say so.

**How is the privacy counter trustworthy?**
Every second it reads the operating system's own connection list for our programs. Press "Test the watcher": it deliberately opens one outside connection and shows it was caught. We count connections, not bytes, because a reliable per-program byte count is not available everywhere.

**What if the PC is very old?**
The Hardware Passport says honestly what it can do, and the classroom PC simulator lets us test a 4-core, 8 GB machine on this laptop (results are labelled "Simulated"). A 4 GB PC can still run a tiny model for a few users; if it cannot, InferSmart says so instead of failing in class.

**Power cuts?**
The engine watchdog restarts a crashed engine by itself [measured: back in N s], and with "start when switched on" InferSmart comes back with the last good setting after a reboot.

**Can it scale to a lab of 40?**
One PC serves as many as its capacity allows; beyond that, add a second PC. The capacity planner tells you exactly when that is needed.

**Who pays?**
The core is free for schools. Income comes from deployment, training and support for state programmes, CSR funders and low-cost AI-PC makers.

**Why would a state choose this over its own system?**
Karnataka and Kerala are already buying or building local AI. InferSmart is the open, hardware-independent layer that tunes any such PC for a whole class, and it can run their models.

**What would you build next?**
Textbook-grounded answers, voice in Kannada and Hindi, a fleet view for officials, and a shared settings database so new schools skip testing.

**Did you write the code?**
"I designed the product, research and system, and built it with an AI coding assistant. I can explain every part and run it live."
