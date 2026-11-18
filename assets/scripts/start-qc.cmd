@echo off
rem ===== QianChuan fixed browser launcher (double-click, no approval needed) =====
rem profile: <this folder>\edge-profile    port: 9222
setlocal
set "PORT=9222"
set "PROFILE=%~dp0edge-profile"

curl -s -m 2 http://127.0.0.1:%PORT%/json/version >nul 2>&1
if not errorlevel 1 (
  echo [QC] already running on port %PORT%
  goto :eof
)

set "EDGEDIR=%ProgramFiles(x86)%\Microsoft\Edge\Application"
if not exist "%EDGEDIR%\msedge.exe" set "EDGEDIR=%ProgramFiles%\Microsoft\Edge\Application"

echo [QC] exe: %EDGEDIR%\msedge.exe
echo [QC] profile: %PROFILE%
pushd "%EDGEDIR%"
start "" msedge.exe ^
 --remote-debugging-port=%PORT% ^
 --remote-allow-origins=* ^
 --user-data-dir="%PROFILE%" ^
 --no-first-run ^
 --no-default-browser-check ^
 --start-maximized ^
 "https://qianchuan.jinritemai.com/login"
popd

echo [QC] waiting for port ...
for /l %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  curl -s -m 1 http://127.0.0.1:%PORT%/json/version >nul 2>&1
  if not errorlevel 1 (
    echo [QC] OK port %PORT% ready in %%i s
    goto :eof
  )
)
echo [QC] FAILED: port not listening
