@echo off
REM Copy this file to `dev-wsl.config.bat` in the same folder (scripts/).
REM `dev-wsl.config.bat` is gitignored - put machine-specific overrides there only.
REM Use CRLF line endings and ANSI or UTF-8 without BOM (not UTF-16), or CMD may misparse lines.
REM Never use plain "exit" here (it closes the whole dev window). Use "exit /b 0" only if you must stop the caller.
REM
REM Optional - leave unset to auto-detect from this repo's Windows path (wslpath + PowerShell fallback).
REM UNC paths like \\wsl$\Ubuntu\... are auto-resolved in dev-start r6+ (earlier "!WR!" broke wslpath because of $).
REM If CMD mapped \\wsl$\... to Z: and wslpath fails, set WSL_PROJECT_DIR explicitly (Linux path).
REM set "WSL_DISTRO=Ubuntu"
REM set "WSL_PROJECT_DIR=/home/you/projects/yours"
REM Must be a real Linux path inside WSL (e.g. /home/you/...). Never use /mnt/c/wsl$/... - that is a bad wslpath on C:\wsl$\...; dev-start normalizes automatically.
REM set "WSL_USER=you"
