@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WEBOS - MOZILLA FIREFOX KIOSK · BUILD 35
set "FIREFOX="
set "SERVER_STARTER=%~dp0START_WEBOS_LOCAL_SERVER.bat"
set "APP_URL=http://127.0.0.1:18767/WEBOS.html"
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "FIREFOX=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if not defined FIREFOX if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" set "FIREFOX=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if not defined FIREFOX for /f "delims=" %%F in ('where firefox.exe 2^>nul') do if not defined FIREFOX set "FIREFOX=%%F"
if not defined FIREFOX (echo HIBA: A Mozilla Firefox nem talalhato.& pause& exit /b 2)
call "%SERVER_STARTER%"
if errorlevel 1 (pause& exit /b 3)
taskkill /F /T /IM firefox.exe >nul 2>&1
start "" "%FIREFOX%" --kiosk -new-instance "%APP_URL%"
endlocal
exit /b 0
