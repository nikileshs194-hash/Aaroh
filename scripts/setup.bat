@echo off
setlocal
title Aaroh setup
cd /d "%~dp0.."
echo.
echo  ==== Aaroh setup ====
echo  This installs everything Aaroh needs. It uses the internet once; after that Aaroh works offline.
echo.

where python >nul 2>nul || (echo  [!] Python 3.11 or 3.12 is not installed. Get it free from python.org and tick "Add Python to PATH". & pause & exit /b 1)
where node >nul 2>nul || (echo  [!] Node.js is not installed. Get the LTS version free from nodejs.org. & pause & exit /b 1)

echo  [1/5] Preparing Python...
if not exist .venv\Scripts\python.exe python -m venv .venv || goto :fail
.venv\Scripts\python -m pip install --quiet --upgrade pip
.venv\Scripts\pip install --quiet -r backend\requirements.txt || goto :fail

echo  [2/5] Building the interface...
pushd frontend
call npm install --no-audit --no-fund --silent || (popd & goto :fail)
call npm run build --silent || (popd & goto :fail)
popd

echo  [3/5] Checking the AI engine...
.venv\Scripts\python scripts\fetch_engine.py || goto :fail

echo  [4/5] Checking AI model files...
.venv\Scripts\python -c "import sys; sys.path.insert(0,'backend'); from app import models_lib; sys.exit(0 if models_lib.list_models() else 1)"
if errorlevel 1 (
  echo        No model files found. Downloading the small set (about 4 GB^)...
  .venv\Scripts\python scripts\download_models.py --small || goto :fail
)
echo        Voice input models (English + Kannada, about 1.3 GB, skipped if present)...
.venv\Scripts\python scripts\download_speech.py || echo        Voice models not downloaded; typing still works.

echo  [5/5] Running the automatic checks...
.venv\Scripts\python -m pytest -q backend\tests || goto :fail

echo.
echo  Setup finished. Double-click scripts\start.bat to open Aaroh.
echo  The first time, Windows may ask whether Python can use "Private networks": press Allow,
echo  so phones on the school Wi-Fi can open Aaroh.
echo.
pause
exit /b 0

:fail
echo.
echo  [!] Setup stopped because a step failed. Read the message above, or see docs\README.md "Troubleshooting".
pause
exit /b 1
