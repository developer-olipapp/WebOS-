@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WEBOS - GOOGLE CHROME KIOSK · BUILD 35
set "CHROME="
set "SERVER_STARTER=%~dp0START_WEBOS_LOCAL_SERVER.bat"
set "APP_URL=http://127.0.0.1:18767/WEBOS.html"

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME for /f "delims=" %%C in ('where chrome.exe 2^>nul') do if not defined CHROME set "CHROME=%%C"
if not defined CHROME (echo HIBA: A Google Chrome nem talalhato.& pause& exit /b 2)

call "%SERVER_STARTER%"
if errorlevel 1 (pause& exit /b 3)
REM Close existing Chrome windows so WEBOS starts as a clean full-screen kiosk.
taskkill /F /T /IM chrome.exe >nul 2>&1
start "" "%CHROME%" --kiosk "%APP_URL%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble
endlocal
exit /b 0
