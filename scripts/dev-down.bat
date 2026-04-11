@echo off
if /i not "%~1"=="--inner" (
  start "Bella Office - dev-down" "%SystemRoot%\System32\cmd.exe" /k call "%~f0" --inner
  exit /b 0
)
shift /1
setlocal EnableDelayedExpansion
title Bella Office - dev-down
REM Best-effort stop for local dev (same path/user detection as dev-start.bat).

if exist "%~dp0dev-wsl.config.bat" call "%~dp0dev-wsl.config.bat"

set "BASHPX=unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; "

set "WIN_REPO_ROOT="
for %%I in ("%~dp0..") do set "WIN_REPO_ROOT=%%~fI"
set "WR=!WIN_REPO_ROOT!"

if not "!WR:~0,2!"=="\\" (
  if "!WR:~1,2!"==":\" (
    set "WR_TAIL=!WR:~3!"
    if /i "!WR_TAIL:~0,5!"=="wsl$\" (
      set "WR=\\!WR_TAIL!"
    ) else (
      if /i "!WR_TAIL:~0,15!"=="wsl.localhost$\" (
        set "WR=\\!WR_TAIL!"
      )
    )
  )
)

if defined WSL_PROJECT_DIR (
  echo !WSL_PROJECT_DIR! | findstr /i /c:"/mnt/c/wsl" >nul
  if not errorlevel 1 (
    echo [warn] Clearing invalid WSL_PROJECT_DIR from config.
    set "WSL_PROJECT_DIR="
  )
)

if not defined WSL_PROJECT_DIR call :WslPathFromWin_U "!WR!"
if not defined WSL_PROJECT_DIR call :WslPathFromWin_A "!WR!"
if defined WSL_PROJECT_DIR (
  echo !WSL_PROJECT_DIR! | findstr /i /c:"/mnt/c/wsl" >nul
  if not errorlevel 1 set "WSL_PROJECT_DIR="
)
if not defined WSL_PROJECT_DIR call :WslPathFromPs1 "!WR!"

set "WSL_TARGET="
if defined WSL_DISTRO (
  wsl -d !WSL_DISTRO! -- echo ok >nul 2>nul
  if not errorlevel 1 set "WSL_TARGET=-d !WSL_DISTRO!"
)

if not defined WSL_USER (
  for /f "usebackq delims=" %%u in (`wsl !WSL_TARGET! whoami 2^>nul`) do set "WSL_USER=%%u"
)

if not defined WSL_PROJECT_DIR (
  echo [warn] WSL_PROJECT_DIR unset - gateway stop may skip cd-based steps.
)
if not defined WSL_USER (
  echo [warn] WSL_USER unset - WSL commands run as default distro user.
)

set "WSL_USER_FLAG="
if defined WSL_USER set "WSL_USER_FLAG=-u !WSL_USER!"

echo === Bella Office: Dev Down (WSL) ===
if defined WSL_USER (echo User: !WSL_USER!) else (echo User: ^(default^))
echo Stopping OpenClaw Gateway and dev ports...

wsl !WSL_TARGET! !WSL_USER_FLAG! -- bash --noprofile --norc -lc "!BASHPX!if [ -x \"$HOME/.npm-global/bin/openclaw\" ]; then \"$HOME/.npm-global/bin/openclaw\" gateway stop; else openclaw gateway stop; fi" 1>nul 2>nul
wsl !WSL_TARGET! !WSL_USER_FLAG! -- bash --noprofile --norc -lc "!BASHPX!for p in 18789 3001 5173 19000; do if command -v lsof >/dev/null 2>&1; then pid=\$(lsof -ti:\$p -sTCP:LISTEN); [ -n \"\$pid\" ] && kill -9 \$pid 2>/dev/null || true; elif command -v fuser >/dev/null 2>&1; then fuser -k \${p}/tcp 2>/dev/null || true; fi; done"

taskkill /FI "WINDOWTITLE eq OpenClaw Gateway*" /FI "IMAGENAME eq powershell.exe" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Backend*" /FI "IMAGENAME eq powershell.exe" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Frontend*" /FI "IMAGENAME eq powershell.exe" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Star Office Backend*" /FI "IMAGENAME eq powershell.exe" /T /F >nul 2>nul

echo Done.
echo Note: if some unrelated PowerShell windows remain open, close them manually.
echo       Postgres (docker) is not stopped - use: npm run docker:db:down ^(repo root^)
echo.
pause
goto :eof

:WslPathFromWin_U
setlocal DisableDelayedExpansion
set "RP=%~1"
set "OUT="
if defined RP for /f "usebackq delims=" %%i in (`wsl wslpath -u "%RP%" 2^>nul`) do set "OUT=%%i"
endlocal & if not "%OUT%"=="" set "WSL_PROJECT_DIR=%OUT%"
goto :eof

:WslPathFromWin_A
setlocal DisableDelayedExpansion
set "RP=%~1"
set "OUT="
if defined RP for /f "usebackq delims=" %%i in (`wsl wslpath -a "%RP%" 2^>nul`) do set "OUT=%%i"
endlocal & if not "%OUT%"=="" set "WSL_PROJECT_DIR=%OUT%"
goto :eof

:WslPathFromPs1
setlocal DisableDelayedExpansion
set "RP=%~1"
set "OUT="
if defined RP for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0win-repo-to-wsl-path.ps1" "%RP%" 2^>nul`) do set "OUT=%%p"
endlocal & if not "%OUT%"=="" set "WSL_PROJECT_DIR=%OUT%"
goto :eof
