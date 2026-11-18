# Live demo script (about 5 minutes)

Before you start: laptop plugged in, "Best performance" power mode, other apps closed, notifications off.
InferSmart already running (`scripts\start.bat`). Phone on the same Wi-Fi or hotspot. Tabs open in this order:

1. `http://localhost:8080/setup` (Welcome)
2. `http://localhost:8080/admin` (Dashboard, logged in with the admin PIN)
3. `http://localhost:8080/admin/privacy`
4. The slide deck (`docs\pitch\deck.html`, press F for full screen)

| Time | Show | Say |
|---|---|---|
| 0:00 | Story slide | "Meet Lakshmi. Her school has an old PC and no reliable internet. From this year she must teach AI." |
| 0:40 | Tab 1: Welcome → **Check this computer** | "InferSmart reads this computer in seconds and explains it in plain words: strong, weak, what it can run." |
| 1:15 | **Continue** → Goal: *One class*, English + ಕನ್ನಡ, *Balanced* → **Quick test** → **Start test** | "It tests several AI models on this exact machine, speed, memory and answer quality in each language." Let two settings run live (about 1 minute), then say: "A full test takes about an hour, so here is the saved full run from this laptop," and open `/setup/result`. |
| 2:00 | Result screen | "This computer can serve about **N** students comfortably, and here is why it chose this model." Read the one-line reason. Point at the Kannada warning: "It tells us honestly where Kannada is weaker." |
| 2:40 | Phone: scan the QR on the Share page, tap ಕನ್ನಡ, ask a suggested question. Laptop: Teacher Studio → Lesson plan → Create → Print | "Students scan and ask in their language. Teachers get a lesson plan in minutes, ready to print in the format the headmaster expects." |
| 3:30 | Tab 2: Dashboard → **Simulate 10 students** | "A whole class joins. Watch the first-word time climb. After 20 seconds over the limit it switches to the fast model and writes down why. When it is quiet for a minute, it switches back." (The switch appears in the timeline about 25 to 40 seconds after starting.) |
| 4:20 | Turn **Wi-Fi off**, ask again on the laptop chat. Tab 3: Privacy → **Run offline check** | "No internet. Still working. Zero connections outside the school, watched every second." Optionally press **Test the watcher** (with Wi-Fi on) to show it catches a deliberate connection. |
| 4:50 | Close slide | "Old PC, no internet, no expert: private AI for every student." |

## Backup plan if anything fails on stage

- The saved full test run is already in the app (`/setup/result`, `/admin/results`). Say: "I am loading the saved full run."
- The 90-second screen recording on the desktop and on the USB drive.
- Screenshots of every screen in the deck (appendix slides).
- Phone hotspot as the local network if the venue Wi-Fi isolates devices.
- Say calmly what you are switching to. Judges respect preparation.

## 90-second backup video (record with OBS Studio)

1. 0:00–0:10 Welcome → Hardware Passport.
2. 0:10–0:25 Result screen: "serves N", reason.
3. 0:25–0:45 Phone chat in Kannada with the review label.
4. 0:45–1:05 Teacher Studio: lesson plan → print preview.
5. 1:05–1:20 Dashboard during "Simulate 10 students": the switch line in the timeline.
6. 1:20–1:30 Wi-Fi off, privacy page showing 0.
