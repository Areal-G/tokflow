@echo off
REM Opens the game in a clean Chrome window with no tabs, no address bar and no
REM bookmarks — so when you capture it, nothing from your PC is on screen.
REM Capture THIS window in LIVE Studio / OBS with "Window Capture", never
REM "Display Capture", or your whole desktop goes out to the stream.

set GAME_URL=http://127.0.0.1:24880/games/race/index.html
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  echo Could not find Chrome. Open this address in any browser instead:
  echo    %GAME_URL%
  pause
  exit /b 1
)

REM --app strips the browser UI. A separate user-data-dir keeps your bookmarks,
REM history and open tabs out of this window entirely.
start "" %CHROME% --app=%GAME_URL% ^
  --user-data-dir="%LocalAppData%\TokFlow\game-window" ^
  --window-size=1080,1920 ^
  --window-position=0,0 ^
  --disable-features=Translate ^
  --no-first-run --no-default-browser-check

echo.
echo Game window opened.
echo   Press F11 inside it for fullscreen.
echo   In LIVE Studio / OBS add a WINDOW CAPTURE and pick this window.
echo.
