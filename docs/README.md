# Aaroh

**Private, offline AI that sets itself up on a school's existing computer and serves a whole classroom, with no internet, no GPU and no expert.**

Old PC, no internet, no expert: Aaroh turns the computer a school already owns into a private AI assistant for the whole class, and tunes itself so it stays fast.

---

## 1. First-time setup (once, needs internet)

1. Install, if not already there (all free):
   - **Python 3.11 or 3.12** from python.org. Tick **"Add Python to PATH"**.
   - **Node.js LTS** from nodejs.org.
2. Double-click **`scripts\setup.bat`**. It:
   - installs the Python and interface packages (pinned versions),
   - builds the interface,
   - downloads the pinned AI engine (llama.cpp release **b12521**, CPU build),
   - downloads the small model set if no models are present (about 4 GB),
   - runs the automatic checks.
3. For the full model set (about 17 GB; 0.8B, 2B and 4B in three quality levels) run:
   ```
   .venv\Scripts\python scripts\download_models.py --dir D:\InferSmart-models
   ```
   Models are kept on **D:** on this laptop because C: is nearly full. Any folder works; Aaroh also looks in `models\`.

## 2. Every day

| To | Do |
|---|---|
| Start | Double-click **`scripts\start.bat`**. The browser opens at `http://localhost:8080`. |
| Stop | Double-click **`scripts\stop.bat`**. |
| Start automatically when the PC is switched on | Admin → Settings → Start-up → "Start Aaroh when this computer is switched on". |
| Let students in | Admin → Share → print the lab poster. Students scan the QR code on the school Wi-Fi. |

The first time it starts, **Windows Firewall may ask whether Python can use "Private networks". Press Allow.** Without this, phones cannot reach the computer.

## 3. The three spaces

| Space | Who | How to open |
|---|---|---|
| **Student chat** | Everyone | `http://<this-PC>:8080/` (QR code). No login. Chats stay on the student's own device. |
| **Admin console** | Lab in-charge | `/admin`. Enter the admin PIN chosen during setup. |

Projector mode: `/present` (very large type on a dark background).

## 4. First setup inside the app (about 10 minutes of attention)

1. **Check this computer**: the Hardware Passport (processor, cores, memory, disk, class, what it means).
2. **Goal**: class size, languages (English, ಕನ್ನಡ), what matters most; quick or full test.
3. **Test**: about 8 settings are measured on this exact computer (speed, first word, memory, processor), each model's answers are checked against its 8-bit reference in each language, then 1 to 12 virtual students are simulated. You can close the page; it keeps going and can be paused and resumed.
4. **Result and launch**: "This computer can serve about N students comfortably", the recommended setup with a one-line reason, a runner-up and a fast model for busy periods. Choose an admin PIN, then share the QR code.

## 5. How it works (short)

- **Control centre** (`backend/`, Python + FastAPI) offers every service listed in the dossier's D6 section, with automatic documentation at `http://localhost:8080/docs`.
- **AI engines**: llama.cpp servers. Engine A runs the quality model; engine B runs the fast model when memory allows. Both listen only on `127.0.0.1`; the control centre is the only door.
- **Load controller**: every 2 s it observes users, queue, first-word time, writing speed and memory. If the limits stay broken for 20 s it moves one mode right (quality → fast → protect); after 60 s of calm it moves back. Every switch is written in plain words on the dashboard.
- **Privacy watcher**: every second it lists the network connections of Aaroh's own programs and counts any outside the school network. It counts connections, not bytes. Admin → Privacy → "Test the watcher" proves it catches a deliberate one.
- **Data**: one SQLite file, `data\infersmart.db`. No student question or answer text is stored on the server.

## 6. Tests

- Automatic logic tests: double-click `scripts\run-tests.bat` (selection, capacity, controller, address classification, safety filter, quality guard).
- Acceptance tests with real numbers (M14): with Aaroh running and set up,
  ```
  .venv\Scripts\python scripts\acceptance.py --pin <your admin PIN>
  ```
  This writes `docs\evidence\ACCEPTANCE.md`.

## 7. Troubleshooting

| You see | Do this |
|---|---|
| Phones cannot open the address | Same Wi-Fi? Allow Python in Windows Firewall (Private networks). Some venue Wi-Fi isolates devices: use a phone hotspot as the local network. |
| "The AI engine is starting" for a long time | Admin → Dashboard → Restart. If it repeats, Admin → Settings → Re-test. Engine logs: `data\logs\engine_A.log`. |
| Test says a model "needs more memory" | Close other programs, or use the lighter model. The Model library in Settings shows what fits. |
| Numbers look different each run ("noisy") | Plug in the laptop, choose "Best performance" power mode, close other apps, run the full test. |
| Forgot the admin PIN | Stop Aaroh, delete the `admin_pin_hash` row with any SQLite tool, or delete `data\infersmart.db` (this also deletes test results), then run setup again. |
| Setup failed at "Building the interface" | Check Node.js is installed; run `scripts\setup.bat` again (it resumes). |

## 8. Folder structure

| Folder | Contents |
|---|---|
| `engine/` | Pinned llama.cpp program files (release b12521) |
| `models/` | `MODELS.json`: list of model files, sources, licences and checksums (the files are on D:) |
| `backend/` | The control centre |
| `frontend/` | The interface |
| `data/` | Database, test question sets, logs |
| `scripts/` | Double-click files: setup, start, stop, tests |
| `docs/` | This readme, the pitch kit, evidence, checklists |

## 9. Licences

Aaroh's code is MIT. llama.cpp is MIT. Qwen3.5 models are Apache 2.0 (from the official Unsloth GGUF pages). Fonts (Inter, Noto Sans Kannada, Noto Sans Devanagari) are SIL Open Font Licence. Test questions: Belebele and ARC-Easy, CC-BY-SA 4.0.

## 10. Honest limits

Small models suit explanations and drafts, not deep reasoning. Kannada quality is measured and shown, and answers carry a "please check" label. Capacity comes from simulated students. Privacy features support compliance and are not legal certification.

## Voice input (English and Kannada, offline)

Students pick the question language with the small EN / ಕನ್ನಡ switch next to the microphone (the screen stays in English), tap 🎤, speak, tap again; the words appear in the question box so they can fix them before sending. The speech is turned into text on this computer by two free models (English: NVIDIA Parakeet, Kannada: AI4Bharat IndicConformer) and is never stored. Install or repair the models with:

    .venv\Scripts\python scripts\download_speech.py

Phones: browsers only allow the microphone on secure (https) pages, so on phones that open Aaroh by its `http://192.168...` address the 🎤 button explains this and students type instead. On the school computer itself (`http://localhost:8080`) voice works.

