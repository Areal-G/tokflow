# TokFlow roadmap

Ideas under review. Nothing here is committed until it's promoted to "next up".

## Next up

*(pick from below)*

## Streamer tools

- **Sound alerts + voice announcements** — play a sound when a gift lands; text-to-speech
  reads comments or announces gifts ("Areal sent a Rose!") so the host never has to
  read chat mid-sentence. Highest-demand feature in comparable tools.
- **Gift goals** — a progress bar tied to coins ("1,000 coins unlocks the challenge").
  Gives viewers a reason to gift right now. Shown on the dashboard and as an overlay.
- **OBS / LIVE Studio overlays** — transparent pages served by the engine
  (e.g. `/overlay/top-gifters`, `/overlay/goal`, `/overlay/alerts`) that hosts add as a
  browser source, so viewers see the leaderboard, goal, and gift alerts on stream.

## Analytics

- **Session history** — save every LIVE automatically; afterwards show viewers/likes/
  coins per minute, peak moments, and totals compared with previous streams.
- **All-time leaderboards** — top gifters and likers across all sessions, so loyal
  supporters can be recognized on return visits.
- **CSV export** — one click to export a session's viewers, comments, and coins.

## Interactive games

- **Shiro Wot vs Doro Wot on TokFlow** — the game already speaks the engine protocol;
  needs a real-LIVE acceptance test and the gift catalog checked against the host
  account's gift tray.
- **Keyword triggers** — match comment patterns ("comment 1 or 2 to vote",
  "!join to enter") and fire actions without a game window.
- **Raffle wheel** — every gift buys entries, a wheel spins on screen, the winner's
  name is displayed. The simplest gift-driven game; works for any host.

## Distribution

- **Chrome Web Store listing** — replaces load-unpacked with a normal one-click
  install and automatic updates ($5 one-time developer fee).
- **Code-signing certificate** — removes the Windows SmartScreen warning on the
  installer once distribution grows.
