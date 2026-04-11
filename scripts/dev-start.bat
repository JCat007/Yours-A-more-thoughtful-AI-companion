@echo off
REM New window + cmd /k: stays open on errors; avoids parent flash stealing focus. Do not use plain EXIT in dev-wsl.config.bat.
if /i not "%~1"=="--inner" (
  start "Bella Office - dev-start" "%SystemRoot%\System32\cmd.exe" /k call "%~f0" --inner
  exit /b 0
)
shift /1
setlocal EnableDelayedExpansion
title Bella Office - dev-start
REM One-click local dev bootstrap (Windows -> WSL). Repo root = parent of this scripts\ folder.
REM Optional overrides: copy dev-wsl.config.example.bat to dev-wsl.config.bat (same folder).

set "SCRIPT_VER=2026-04-11-r7"

if exist "%~dp0dev-wsl.config.bat" call "%~dp0dev-wsl.config.bat"

REM Bash prefix: avoids WSL "localhost proxy not mirrored" noise when Windows sets ALL_PROXY etc.
set "BASHPX=unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; "

REM Repo root without "pushd .." - pushd on \\wsl$\... maps to Z: and breaks wslpath.
set "WIN_REPO_ROOT="
for %%I in ("%~dp0..") do set "WIN_REPO_ROOT=%%~fI"
set "WR=!WIN_REPO_ROOT!"

REM C:\wsl$\Distro\... -> \\wsl$\Distro\... (else wslpath wrongly returns /mnt/c/wsl$/...)
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
    echo [warn] Clearing invalid WSL_PROJECT_DIR ^(/mnt/c/wsl$...^) from config; will auto-detect.
    set "WSL_PROJECT_DIR="
  )
)

REM wslpath must NOT use "!WR!" here: delayed expansion treats "$\" in \\wsl$\... as special and breaks the path.
if not defined WSL_PROJECT_DIR call :WslPathFromWin_U "!WR!"
if not defined WSL_PROJECT_DIR call :WslPathFromWin_A "!WR!"
if defined WSL_PROJECT_DIR (
  echo !WSL_PROJECT_DIR! | findstr /i /c:"/mnt/c/wsl" >nul
  if not errorlevel 1 set "WSL_PROJECT_DIR="
)
if not defined WSL_PROJECT_DIR call :WslPathFromPs1 "!WR!"
if not defined WSL_PROJECT_DIR (
  echo [error] Could not resolve WSL path from "!WR!"
  echo         Set WSL_PROJECT_DIR in scripts\dev-wsl.config.bat ^(copy from dev-wsl.config.example.bat^).
  goto :end
)

set "WSL_TARGET="
if defined WSL_DISTRO (
  wsl -d !WSL_DISTRO! -- echo ok >nul 2>nul
  if not errorlevel 1 (
    set "WSL_TARGET=-d !WSL_DISTRO!"
  ) else (
    echo [warn] WSL distro "!WSL_DISTRO!" not found. Using default distro.
    wsl -l -q
  )
)

if not defined WSL_USER (
  for /f "usebackq delims=" %%u in (`wsl !WSL_TARGET! whoami 2^>nul`) do set "WSL_USER=%%u"
)
if not defined WSL_USER (
  echo [error] Could not detect WSL username. Set WSL_USER in scripts\dev-wsl.config.bat
  goto :end
)

wsl !WSL_TARGET! -u !WSL_USER! -- test -d "!WSL_PROJECT_DIR!" 2>nul
if errorlevel 1 (
  echo [error] WSL_PROJECT_DIR is not a directory inside WSL: !WSL_PROJECT_DIR!
  goto :end
)

echo === Bella Office: Dev Start (WSL) ===
echo Script: %~f0
echo Version: %SCRIPT_VER%
if defined WSL_DISTRO (echo Distro:  !WSL_DISTRO!) else (echo Distro:  ^(default^))
echo User:    !WSL_USER!
echo WSL dir: !WSL_PROJECT_DIR!
echo.

REM Avoid: cd /d quoted drive-root with trailing backslash before close-quote (breaks cmd.exe).
cd /d "%SystemRoot%"

where wsl >nul 2>nul
if errorlevel 1 (
  echo [error] wsl.exe not found. Please install/enable WSL and try again.
  goto :end
)

echo [prep] Sync OpenClaw skill/allowlist config...
wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!cd \"!WSL_PROJECT_DIR!\" && if [ -f scripts/openclaw-setup-seed-exec.js ]; then node scripts/openclaw-setup-seed-exec.js; fi" 1>nul 2>nul

echo [prep] Apply OpenClaw China mode config (minimax-cn/MiniMax-M2.7)
wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!cd \"!WSL_PROJECT_DIR!\" && if [ -f scripts/openclaw-apply-china-world.js ]; then node scripts/openclaw-apply-china-world.js; fi"
if errorlevel 1 (
  echo [warn] openclaw-apply-china-world.js failed. Will start gateway with existing openclaw.json config.
)
echo [prep] Active minimax model ids in ~/.openclaw/openclaw.json:
wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!cd \"!WSL_PROJECT_DIR!\" && node scripts/openclaw-print-provider-models.js"

echo [prep] Ensure Star Office Python venv and deps (skip if star-office-ui missing)...
wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!cd \"!WSL_PROJECT_DIR!\" && if [ -d star-office-ui ]; then cd star-office-ui && if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi && .venv/bin/python -m pip -q install -r backend/requirements.txt; else echo '[skip] star-office-ui not found under project root'; fi"

echo [prep] Ensure dev helper scripts and backend/run-dev.sh are executable...
wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!cd \"!WSL_PROJECT_DIR!\" && chmod +x backend/run-dev.sh scripts/wsl-openclaw-gateway.sh scripts/wsl-backend-dev.sh scripts/wsl-frontend-dev.sh scripts/wsl-star-office-backend.sh scripts/wsl-is-port-busy.sh 2>nul" 1>nul 2>nul

set "PORT_LISTENING=0"
for /f "delims=" %%A in ('wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-is-port-busy.sh" 18789 2^>nul') do set "PORT_LISTENING=%%A"

if "!PORT_LISTENING!"=="1" (
  echo [restart] OpenClaw Gateway already listening on 18789, stopping to apply config...
  wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!if [ -x /home/!WSL_USER!/.npm-global/bin/openclaw ]; then /home/!WSL_USER!/.npm-global/bin/openclaw gateway stop || true; else openclaw gateway stop || true; fi" 1>nul 2>nul
)

echo [start] OpenClaw Gateway (18789^)
REM Do not use start+powershell+long -Command (CMD misparses -f from test/[ and breaks). Use wsl+bash+repo script.
start "OpenClaw Gateway" wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-openclaw-gateway.sh"

set "PORT_LISTENING=0"
for /f "delims=" %%A in ('wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-is-port-busy.sh" 3001 2^>nul') do set "PORT_LISTENING=%%A"

if "!PORT_LISTENING!"=="1" (
  echo [restart] Backend already listening on 3001, restarting to load latest code...
  wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!PIDS=\$(if command -v lsof >/dev/null 2>&1; then lsof -ti:3001 -sTCP:LISTEN; elif command -v ss >/dev/null 2>&1; then ss -ltnp sport = :3001 | sed -n 's/.*pid=\([0-9]\+\).*/\1/p'; fi); if [ -n \"\$PIDS\" ]; then echo \"\$PIDS\" | xargs -r kill; sleep 1; fi" 1>nul 2>nul
)
echo [start] Backend (3001^)
start "Backend" wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-backend-dev.sh"

set "PORT_LISTENING=0"
for /f "delims=" %%A in ('wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-is-port-busy.sh" 5173 2^>nul') do set "PORT_LISTENING=%%A"

if "!PORT_LISTENING!"=="1" (
  echo [skip] Frontend already listening on 5173
) else (
  echo [start] Frontend (5173^)
  start "Frontend" wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-frontend-dev.sh"
)

set "PORT_LISTENING=0"
for /f "delims=" %%A in ('wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-is-port-busy.sh" 19000 2^>nul') do set "PORT_LISTENING=%%A"

wsl !WSL_TARGET! -u !WSL_USER! -- bash --noprofile --norc -lc "!BASHPX!test -d \"!WSL_PROJECT_DIR!/star-office-ui\"" >nul 2>nul
if errorlevel 1 (
  echo [skip] Star Office backend: star-office-ui directory not present
) else if "!PORT_LISTENING!"=="1" (
  echo [skip] Star Office backend already listening on 19000
) else (
  echo [start] Star Office backend (19000^)
  start "Star Office Backend" wsl !WSL_TARGET! -u !WSL_USER! -- bash "!WSL_PROJECT_DIR!/scripts/wsl-star-office-backend.sh"
)

echo.
echo Started. Keep those windows open.
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:3001/health
echo - Gateway:  http://127.0.0.1:18789 (loopback only)
echo - Star Office UI: http://127.0.0.1:19000
echo.
echo Notes: optional Postgres + pgvector: npm run docker:db ^(repo root; uses backend/.env^).
echo        gbrain: docs/COMPANION_AUTH_GBRAIN.md
echo.
goto :end

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

:end
echo.
pause
goto :eof
