@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "SERVER=%~dp0WEBOS_LOCAL_SERVER.ps1"
set "URL=http://127.0.0.1:18767/api/content/status"
if not exist "%SERVER%" (
  echo HIBA: Nem talalhato a WEBOS_LOCAL_SERVER.ps1.
  exit /b 1
)
REM The listener is loopback-only; it serves WEBOS, login.json and the fixed Content folder.
start "" /min powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SERVER%"
powershell.exe -NoLogo -NoProfile -Command "$until=(Get-Date).AddSeconds(15); do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 1; if($r.StatusCode -eq 200 -and $r.Content -match 'ok.{0,2}true'){ exit 0 } } catch { }; Start-Sleep -Milliseconds 250 } while((Get-Date) -lt $until); exit 1" >nul 2>&1
if errorlevel 1 (
  echo HIBA: A WEBOS helyi szolgaltatas nem indult el a 127.0.0.1:18767 cimen.
  echo Ellenorizd, hogy nem hasznalja-e mas program ezt a portot.
  exit /b 2
)
exit /b 0
