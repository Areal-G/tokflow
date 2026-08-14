@echo off
REM A second, completely separate TokFlow — its own port, its own settings, its
REM own analytics, its own TikTok login. Use it to run a different account with a
REM different game at the same time. You do NOT need a virtual machine for this.
REM
REM Instance A (the normal one):  http://127.0.0.1:24880
REM Instance B (this one):        http://127.0.0.1:24881

set LIVE_ENGINE_PORT=24881
set TOKFLOW_DATA_DIR=%LocalAppData%\TokFlow\instance-b

pushd "%~dp0"
echo Starting second TokFlow on port %LIVE_ENGINE_PORT%
echo Data and login for this one live in %TOKFLOW_DATA_DIR%
start "" /min node src\server.js
popd
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:24881
echo.
echo Open its game board at http://127.0.0.1:24881/games/race/index.html
echo Use a SEPARATE Chrome profile for this account's live page.
echo.
