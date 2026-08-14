@echo off
REM Opens the game board in a clean Chrome window — no tabs, no address bar, no
REM bookmarks, on its own profile — so capturing it puts nothing of yours on the
REM stream. Capture it with WINDOW CAPTURE, never Display Capture.
REM
REM QUALITY NOTE
REM   A 9:16 board wants to be 1080x1920. A 1080p landscape monitor cannot show a
REM   window that tall, so a window capture always gets upscaled and text softens.
REM   If your encoder has a BROWSER / WEB source, use that instead of capturing
REM   this window — it renders off-screen at full size with no upscaling at all:
REM
REM       URL     http://127.0.0.1:24880/games/race/index.html
REM       Size    1080 x 1920
REM
REM   Only fall back to this window if your encoder has no browser source.
REM
REM   Pass "big" to open a window TALLER than your screen. Windows can still
REM   capture the off-screen part, which gets you a sharper picture — but it
REM   looks odd on your desktop, so try it and see whether your encoder likes it:
REM       start-game-window.bat big

set GAME_URL=http://127.0.0.1:24880/games/race/index.html
set WIN_SIZE=--window-size=600,1010
if /I "%~1"=="big" set WIN_SIZE=--window-size=1080,1920

set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  echo Could not find Chrome. Open this address in any browser instead:
  echo    %GAME_URL%
  pause
  exit /b 1
)

REM A separate user-data-dir keeps bookmarks, history and other tabs out of this
REM window entirely. force-device-scale-factor=1 stops Windows display scaling
REM from shrinking the rendered pixels before the capture ever sees them.
start "" %CHROME% --app=%GAME_URL% ^
  --user-data-dir="%LocalAppData%\TokFlow\game-window" ^
  %WIN_SIZE% ^
  --window-position=0,0 ^
  --force-device-scale-factor=1 ^
  --high-dpi-support=1 ^
  --disable-features=Translate ^
  --no-first-run --no-default-browser-check

echo.
echo Game window opened  %WIN_SIZE%
echo.
echo   Sharpest  : use a BROWSER source at 1080x1920 if your encoder has one.
echo   Otherwise : add a WINDOW CAPTURE of this window, and consider streaming
echo               at 720x1280 instead of 1080x1920 - less upscaling, sharper text.
echo.
