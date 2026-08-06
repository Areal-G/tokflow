# TokFlow

**Real-time TikTok LIVE data on your own PC** — comments, likes, gifts, joins and viewer counts, streamed to a local dashboard and to any game or overlay you build.

TokFlow has two parts:

1. **TokFlow LIVE Reader** — a Chrome extension that reads the public event stream of a TikTok LIVE page in your own signed-in browser. It never asks for a password, never copies cookies, and only talks to `127.0.0.1`.
2. **TokFlow Engine** — a local Node.js server that decodes the events, deduplicates them, tracks per-viewer totals, and serves a live dashboard at `http://127.0.0.1:24880/`. Games and overlays connect to `ws://127.0.0.1:24880/events`.

Everything runs locally. Nothing is sent to any cloud.

## Easiest setup: the Windows installer

Run `TokFlow-Setup-<version>.exe` (build it with `npm run dist`, output lands in `dist/`). It installs TokFlow with a desktop shortcut and a system-tray icon:

- the engine starts automatically in the background;
- **left-click the tray icon** (or "Open dashboard") to open the dashboard;
- "Open extension folder" shows the folder to load unpacked in Chrome (step 2 below);
- optional "Start when Windows starts".

Settings are stored in `%APPDATA%\TokFlow`. Only the extension step below is still manual, because Chrome requires a human click to install unpacked extensions.

## Developer setup (any computer)

Requirements: Google Chrome and [Node.js](https://nodejs.org) 22+.

### 1. Start the engine

```
npm install
npm start
```

The dashboard is now at `http://127.0.0.1:24880/`.

### 2. Load the extension (one time)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder of this repo.
4. Pin **TokFlow LIVE Reader** from the puzzle-piece menu.

After any update to the extension source, click the circular **Reload** button on its card.

### 3. Connect a LIVE

1. Click the TokFlow icon — the popup should show **READY**.
2. Enter the LIVE username and press **Connect LIVE**.
3. The extension opens the LIVE as a muted pinned background tab (or uses a tab you already have open) and events start flowing into the dashboard.

Use **Test Rose Gift** in the popup to verify the pipeline without a real LIVE.

## Dashboard

- Live status, viewer count and connected time
- **Likes** — per-viewer leaderboard (👑 for the top liker)
- **Joined / Comments / Gifts** — real-time feeds, gifts with their icons
- **Viewer totals** — per-viewer comments, gifts, gift coins and likes
- Safe test-event sender using the same channel as real events

## Building games on TokFlow

Connect to `ws://127.0.0.1:24880/events` or use `public/live-game-client.js`:

```js
const client = new window.TokFlow.LiveGameClient();
client.addEventListener("live-event", ({ detail: event }) => {
  // event.type: "gift" | "comment" | "like" | "join" | "follow" | "share"
});
client.connect();
```

See `GAME-INTEGRATION.md` for the full event format.

## Tests

```
npm test
```

## Notes and limits

- TikTok offers no official public LIVE API; TokFlow reads the public event stream of a LIVE page in your own browser. TikTok site changes can require maintenance.
- A LIVE page must be open somewhere in Chrome for events to exist — TokFlow keeps it as a muted pinned tab.
- Content-gated LIVEs ("themes some may find uncomfortable") need one manual click on the LIVE page before the stream exists.
- Gift names, icons and coin values vary by region and account.
