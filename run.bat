@echo off
echo Starting LiteBench...

cd /d "%~dp0backend"
start /b cmd /c "uvicorn main:app --reload --port 8001" >nul 2>&1

cd /d "%~dp0frontend"
start /b cmd /c "pnpm dev" >nul 2>&1

timeout /t 3 >nul
start http://localhost:5174

echo LiteBench running on http://localhost:5174
