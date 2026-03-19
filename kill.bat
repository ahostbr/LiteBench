@echo off
echo Killing LiteBench processes...

taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "LiteBench.exe" >nul 2>&1

echo Done.
