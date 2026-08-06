@echo off
setlocal
set "PROFILE_DIR=%~dp0data\tiktok-browser-profile"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE_DIR%" --profile-directory=Default --no-first-run --no-default-browser-check --disable-background-mode "https://www.tiktok.com/login"
  exit /b 0
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE_DIR%" --profile-directory=Default --no-first-run --no-default-browser-check --disable-background-mode "https://www.tiktok.com/login"
  exit /b 0
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE_DIR%" --profile-directory=Default --no-first-run --no-default-browser-check --disable-background-mode "https://www.tiktok.com/login"
  exit /b 0
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE_DIR%" --profile-directory=Default --no-first-run --no-default-browser-check --disable-background-mode "https://www.tiktok.com/login"
  exit /b 0
)

echo Google Chrome or Microsoft Edge could not be found.
pause
exit /b 1
