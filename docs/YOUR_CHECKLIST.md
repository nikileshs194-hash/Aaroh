# What is left for you to do

Everything that could be built and measured on this laptop without you is done. These steps need a person, a second device or a decision. Do them in this order.

## Before you open the app (5 minutes)

- [ ] **Allow the firewall.** The first time Aaroh starts, Windows may ask whether Python can use "Private networks". Press **Allow**. Without this, phones cannot open Aaroh. (I am not allowed to change security settings for you.)
- [ ] **Push the code to GitHub** (optional backup). Open a terminal in the `Vyom` folder and run these one at a time:
  ```
  winget install --id GitHub.cli -e
  gh auth login
  gh repo create infersmart --private --source . --push
  ```
- [ ] **Copy the project to a USB drive.** Copy the `Vyom` folder and `D:\InferSmart-models`.

## Try it yourself (15 minutes)

- [ ] Double-click `scripts\start.bat`. The setup is already finished and the admin PIN is in `docs\evidence\DEMO_ACCESS.md`. **Change the PIN** in Admin → Settings → Codes.
- [ ] Admin → Share: scan the QR code with your phone **on the same Wi-Fi**, ask a question in Kannada. (Module M9/M12 test.)
- [ ] Open three browser tabs on `/chat` and ask at the same time. Does "serves about N" feel right? (Capacity manual check.)
- [x] (Done 20 Nov 2026) Turn **Wi-Fi off**, ask a question, then Admin → Privacy → Run offline check. It should say "worked with the internet disconnected". (Offline test.)
- [ ] Restart the laptop with "Start Aaroh when this computer is switched on" turned on in Settings, then open `http://localhost:8080`. (Reboot recovery test.)

## People you need (these make the biggest difference to judges)

- [ ] **Native-speaker review**: give a Kannada teacher the file `frontend\src\i18n\kn.ts` (or let them click through the app in Kannada) and ask them to check 10 Kannada answers. Note corrections; I can apply them in minutes.
- [ ] **Survey** (Google Forms, 10 questions in dossier section B6), target 30+ teachers.
- [ ] **Five 15-minute interviews** (questions in B6).
- [ ] **Usability test with 3 teachers**: tasks are set up, ask in Kannada, make a quiz, print it. Time each task, then the 10-question SUS form. Target 70+.
- [ ] **Clean-install test** on a second computer or a new Windows user account using only `docs\README.md`.

## Before the event

- [ ] Put your **name, team and college** into `docs\pitch\deck.html` (search for `[Your name]`) and the school name in Admin → Settings.
- [ ] Re-run `scripts\acceptance.py` on the presentation laptop and copy the new numbers into the slides. **Never use a number you did not measure.**
- [ ] Record the 90-second backup video (script: `docs\pitch\DEMO_SCRIPT.md`) with OBS Studio.
- [ ] Rehearse the demo three times, once with Wi-Fi off.
- [ ] Freeze features two days before the event.
- [ ] Tell me the event date and rules if you want the deck cut to fit the time limit.
