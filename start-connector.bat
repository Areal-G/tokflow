@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\tiktok-live-connector" goto install
if not exist "node_modules\playwright-core" goto install
goto start_engine

:install
  echo Installing the LIVE engine for first use...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )

:start_engine
start "TokFlow Engine" /min cmd /c "npm.cmd start"
timeout /t 2 /nobreak >nul
start "LIVE Connector" "http://127.0.0.1:24880"
endlocal
