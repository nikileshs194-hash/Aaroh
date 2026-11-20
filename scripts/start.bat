@echo off
title Aaroh
cd /d "%~dp0.."
if not exist .venv\Scripts\python.exe (echo Run scripts\setup.bat first. & pause & exit /b 1)
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/health -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Starting Aaroh...
  start "Aaroh control centre" /min .venv\Scripts\python.exe backend\run.py
  powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/health -TimeoutSec 2) | Out-Null; exit 0 } catch { Start-Sleep 1 } }; exit 1"
  if errorlevel 1 (echo Aaroh did not start. See data\logs. & pause & exit /b 1)
)
start "" http://localhost:8080/
exit /b 0
