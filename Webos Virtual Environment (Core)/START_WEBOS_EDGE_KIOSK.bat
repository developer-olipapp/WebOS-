@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WEBOS - MICROSOFT EDGE KIOSK · BUILD 35
set "EDGE="
set "SERVER_STARTER=%~dp0START_WEBOS_LOCAL_SERVER.bat"
set "APP_URL=http://127.0.0.1:18767/WEBOS.html"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE for /f "delims=" %%E in ('where msedge.exe 2^>nul') do if not defined EDGE set "EDGE=%%E"
if not defined EDGE (echo HIBA: A Microsoft Edge nem talalhato.& pause& exit /b 2)
call "%SERVER_STARTER%"
if errorlevel 1 (pause& exit /b 3)
taskkill /F /T /IM msedge.exe >nul 2>&1
start "" "%EDGE%" --kiosk "%APP_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-session-crashed-bubble
endlocal
exit /b 0
