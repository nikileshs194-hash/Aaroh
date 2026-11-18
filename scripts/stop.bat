@echo off
title Stop InferSmart
echo Stopping InferSmart and its AI engines...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -like '*backend*run.py*') -or ($_.CommandLine -like '*uvicorn app.main:app*') -or ($_.Name -eq 'llama-server.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Stopped.
