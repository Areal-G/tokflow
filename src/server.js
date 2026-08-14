import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { TikTokProvider } from "./tiktok-provider.js";
import { RecentEvents } from "./recent-events.js";
import { SettingsStore } from "./settings-store.js";
import { toLegacyGameEvent } from "./event-normalizer.js";
import { ViewerStats } from "./viewer-stats.js";
import { Analytics } from "./analytics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const port = Number(process.env.LIVE_ENGINE_PORT || 24880);
const host = "127.0.0.1";
// Writable state lives outside the install dir when packaged (e.g. %APPDATA%).
const dataDir = process.env.TOKFLOW_DATA_DIR || path.join(root, "data");
const settingsStore = new SettingsStore(path.join(dataDir, "settings.json"));
const saved = settingsStore.read();
const provider = new TikTokProvider({
  profileDir: path.join(dataDir, "tiktok-browser-profile"),
  extensionDir: path.join(root, "extension")
});
const recentEvents = new RecentEvents();
const viewerStats = new ViewerStats();
// every event is written to disk for later analysis
const analytics = new Analytics(path.join(dataDir, "analytics"),
  { enabled: saved.collectAnalytics !== false });
// rolled-up sheets rewrite themselves every minute — nothing to click
analytics.startAutoExport(60000);
const logBuffer = [];
let status = { state: "idle", message: "Ready to connect.", username: saved.username || "", autoReconnect: saved.autoReconnect !== false, viewerCount: 0, connectedAt: null };

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(payload);
}
function sendCsv(response, filename, text) {
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="' + filename + '"',
    "Cache-Control": "no-store"
  });
  response.end(text);
}

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${host}:${port}`).pathname;

  /* ── analytics ──────────────────────────────────────────────────────────
     Everything the engine has seen this session, plus the raw files on disk. */
  if (requestPath === "/analytics/toggle") {
    const on = new URL(request.url, `http://${host}:${port}`).searchParams.get("on") !== "0";
    analytics.setEnabled(on);
    settingsStore.write({ ...settingsStore.read(), collectAnalytics: on });
    broadcast({ type: "analytics-state", collecting: on });
    return sendJson(response, { collecting: on });
  }
  if (requestPath === "/analytics/summary.json") return sendJson(response, analytics.summary());
  if (requestPath === "/analytics/files.json")   return sendJson(response, analytics.listFiles());
  if (requestPath === "/analytics/people.csv")
    return sendCsv(response, "people-" + analytics.day + ".csv", analytics.peopleCsv());
  if (requestPath.startsWith("/analytics/file/")) {
    const name = path.basename(decodeURIComponent(requestPath.slice("/analytics/file/".length)));
    const full = path.join(dataDir, "analytics", name);
    if (!full.startsWith(path.join(dataDir, "analytics")) || !fs.existsSync(full)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No such export");
      return;
    }
    response.writeHead(200, {
      "Content-Type": name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + name + '"',
      "Cache-Control": "no-store"
    });
    fs.createReadStream(full).pipe(response);
    return;
  }

  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(response);
});

const sockets = new WebSocketServer({ server, path: "/events" });
sockets.on("error", (error) => {
  if (error.code !== "EADDRINUSE") console.error(error);
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function addLog(level, message, event = null) {
  const row = { type: "log", level, message, timestamp: new Date().toISOString(), event };
  logBuffer.unshift(row);
  if (logBuffer.length > 100) logBuffer.length = 100;
  broadcast(row);
}

function broadcastViewerStats() {
  broadcast({ type: "viewer-stats", viewers: viewerStats.snapshot() });
}

function processEvent(event, { simulated = false } = {}) {
  if (!simulated && recentEvents.hasOrAdd(event.id)) {
    addLog("debug", `Ignored duplicate ${event.type} event.`);
    return;
  }
  analytics.record(event, status.viewerCount || 0);
  const gameEvent = toLegacyGameEvent(event);
  broadcast({ type: "live-event", event, gameEvent });
  if (viewerStats.record(event)) broadcastViewerStats();

  const prefix = simulated ? "Test — " : "";
  if (event.type === "gift") {
    addLog(simulated ? "test" : "gift", `${prefix}${event.user.displayName} sent ${event.gift.repeatCount}× ${event.gift.name}`, event);
  } else if (event.type === "join") {
    addLog(simulated ? "test" : "join", `${prefix}${event.user.displayName} joined the LIVE`, event);
  } else if (event.type === "comment") {
    addLog(simulated ? "test" : "comment", `${prefix}${event.user.displayName} commented: ${event.comment}`, event);
  } else if (event.type === "like") {
    addLog(simulated ? "test" : "like", `${prefix}${event.user.displayName} sent ${event.count} ${event.count === 1 ? "like" : "likes"}`, event);
  } else if (event.type === "follow") {
    addLog(simulated ? "test" : "follow", `${prefix}${event.user.displayName} followed`, event);
  } else if (event.type === "share") {
    addLog(simulated ? "test" : "share", `${prefix}${event.user.displayName} shared the LIVE`, event);
  } else {
    addLog(simulated ? "test" : "event", `${prefix}${event.user.displayName}: ${event.type}`, event);
  }
}

provider.on("status", (next) => {
  if (next.state === "connecting" && next.username && next.username !== status.username) {
    status.connectedAt = null;
    status.viewerCount = 0;
  }
  if (next.state === "connected" && !status.connectedAt) status.connectedAt = new Date().toISOString();
  if (next.state === "idle") {
    status.connectedAt = null;
    status.viewerCount = 0;
  }
  status = { ...status, ...next };
  broadcast({ type: "status", status });
  addLog(next.state === "error" ? "error" : "info", next.message);
});

provider.on("log", ({ level, message }) => addLog(level, message));
provider.on("reader-command", (command) => broadcast(command));
provider.on("room-stats", ({ viewerCount, totalViewers }) => {
  status = { ...status, viewerCount, totalViewers };
  broadcast({ type: "status", status });
});
provider.on("streak", (event) => broadcast({ type: "streak", event }));
provider.on("event", (event) => processEvent(event));

/* Which games are live right now. Keyed by socket so a game that closes its
   tab disappears from the dashboard instead of lingering forever. */
const liveGames = new Map();   // socket -> { id, name, version, connectedAt }
function broadcastGames() {
  broadcast({ type: "games", games: [...liveGames.values()] });
}

sockets.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", protocol: "tokflow-live-engine", version: 1 }));
  socket.send(JSON.stringify({ type: "status", status }));
  socket.send(JSON.stringify({ type: "history", logs: logBuffer.slice(0, 50) }));
  socket.send(JSON.stringify({ type: "viewer-stats", viewers: viewerStats.snapshot() }));
  socket.send(JSON.stringify({ type: "analytics-state", collecting: analytics.enabled }));
  socket.send(JSON.stringify({ type: "games", games: [...liveGames.values()] }));
  socket.on("close", () => { if (liveGames.delete(socket)) broadcastGames(); });
  socket.on("message", async (data) => {
    let command;
    try { command = JSON.parse(String(data)); } catch { return; }
    try {
      if (command.type === "connect") {
        const settings = { username: command.username, autoReconnect: command.autoReconnect !== false };
        settingsStore.write(settings);
        await provider.connect(settings.username, settings);
      } else if (command.type === "open-login") {
        await provider.openLoginWindow();
      } else if (command.type === "disconnect") {
        await provider.disconnect();
      } else if (command.type === "game-register") {
        // any game announces itself once on connect
        const id = analytics.registerGame(command.game || {});
        const info = command.game || {};
        liveGames.set(socket, { id, name: info.name || id, version: info.version || "",
          connectedAt: new Date().toISOString() });
        broadcastGames();
        addLog("info", (info.name || id) + " connected to TokFlow.");
        socket.send(JSON.stringify({ type: "game-registered", gameId: id,
          collecting: analytics.enabled }));
      } else if (command.type === "game-annotate") {
        // the game reporting how it read an event
        analytics.annotate(command.annotation || {});
      } else if (command.type === "set-analytics") {
        const on = command.enabled !== false;
        analytics.setEnabled(on);
        settingsStore.write({ ...settingsStore.read(), collectAnalytics: on });
        broadcast({ type: "analytics-state", collecting: on });
        addLog("info", on ? "Data collection on." : "Data collection paused — nothing is being recorded.");
      } else if (command.type === "simulate") {
        const event = command.event;
        if (!event || typeof event !== "object") throw new Error("Invalid simulated event.");
        processEvent(event, { simulated: true });
      } else if (command.type === "clear-log") {
        logBuffer.length = 0;
        broadcast({ type: "history", logs: [] });
      } else if (command.type === "clear-viewer-stats") {
        viewerStats.clear();
        broadcastViewerStats();
      } else if (command.type === "capture-open") {
        provider.acceptCapturedSocket(command.url);
      } else if (command.type === "capture-frame") {
        await provider.acceptCapturedFrame(command.payload);
      } else if (command.type === "capture-close") {
        provider.capturedSocketClosed(command.url);
      } else if (command.type === "capture-ready") {
        provider.acceptCaptureReady();
        addLog("debug", `Local Chrome event reader loaded on ${command.page || "TikTok"}.`);
      } else if (command.type === "reader-controller-ready") {
        provider.acceptCaptureReady();
        addLog("debug", "Normal Chrome reader controller is ready.");
      }
    } catch (error) {
      socket.send(JSON.stringify({ type: "command-error", message: String(error.message || error) }));
    }
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. The LIVE engine may already be running.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`TokFlow engine: http://${host}:${port}`);
});

async function shutdown() {
  await provider.disconnect();
  sockets.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
