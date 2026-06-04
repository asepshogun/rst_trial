@echo off
cd /d "%~dp0"
echo Starting NiceCount server...
call .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
pause
