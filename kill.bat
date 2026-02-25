@echo off
echo Killing LiteBench processes...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo Done.
