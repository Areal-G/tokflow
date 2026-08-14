@echo off
REM Fast recovery when something jams mid-stream.
REM Stops whatever is holding the TokFlow port and starts the engine again.
REM Your board keeps its own state; it reconnects by itself within a few seconds.

echo Stopping TokFlow engine...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":24880" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo Starting it again...
pushd "%~dp0"
start "" /min node src\server.js
popd
timeout /t 3 /nobreak >nul

echo.
echo Done. Check http://127.0.0.1:24880
echo If the reader does not pick the LIVE back up, refresh the Chrome tab that
echo has the TikTok live page open — that is what feeds the events.
echo.
pause
