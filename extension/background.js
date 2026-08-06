const ENGINE_URL = "ws://127.0.0.1:24880/events";
const OFFLINE_STATUS = { state: "offline", message: "Start the local LIVE engine." };

let connector = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastStatus = OFFLINE_STATUS;
const pending = [];

// Back off while the engine is down so chrome://extensions doesn't fill with
// one ERR_CONNECTION_REFUSED entry every two seconds. The 30s alarm still
// guarantees a reconnect attempt even after long downtime.
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30000;

// Diagnostic counters shown in the popup. Mirrored to session storage so a
// restarted service worker still reports totals from this browser session.
let capture = { frames: 0, lastFrameAt: null, pageReadyAt: null };

async function restoreCapture() {
  const saved = await chrome.storage.session.get("captureStats").catch(() => ({}));
  if (saved.captureStats) capture = saved.captureStats;
}

function persistCapture() {
  chrome.storage.session.set({ captureStats: capture }).catch(() => {});
}

function send(message) {
  if (connector?.readyState === WebSocket.OPEN) connector.send(JSON.stringify(message));
  else if (pending.length < 200) pending.push(message);
}

async function saveStatus(status) {
  lastStatus = status;
  await chrome.storage.local.set({ liveEngineStatus: status }).catch(() => {});
  chrome.runtime.sendMessage({ type: "status-update", status, capture }).catch(() => {});
}

async function getLiveTabId() {
  const saved = await chrome.storage.session.get("liveTabId").catch(() => ({}));
  return typeof saved.liveTabId === "number" ? saved.liveTabId : null;
}

async function setLiveTabId(id) {
  if (id === null) await chrome.storage.session.remove("liveTabId").catch(() => {});
  else await chrome.storage.session.set({ liveTabId: id }).catch(() => {});
}

// Bandwidth saver, applied ONLY to the reader tab TokFlow opens itself:
// block the live video downloads (.flv / HLS from pull-* stream servers) and
// pause the player. The Webcast event socket is a separate wss connection and
// keeps flowing.
const STREAM_BLOCK_RULE_IDS = [7001, 7002, 7003];

async function blockVideoStream(tabId) {
  const base = { tabIds: [tabId], resourceTypes: ["media", "xmlhttprequest", "other"] };
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: STREAM_BLOCK_RULE_IDS,
      addRules: [
        { id: 7001, action: { type: "block" }, condition: { ...base, regexFilter: "^https?://pull-[^/]+/" } },
        { id: 7002, action: { type: "block" }, condition: { ...base, regexFilter: "\\.flv([?#]|$)" } },
        { id: 7003, action: { type: "block" }, condition: { ...base, regexFilter: "\\.m3u8([?#]|$)" } }
      ]
    });
  } catch { /* best effort */ }
}

async function unblockVideoStream() {
  try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: STREAM_BLOCK_RULE_IDS }); } catch { /* nothing to remove */ }
}

function pauseVideoLoop() {
  const quiet = () => document.querySelectorAll("video").forEach((video) => {
    try {
      video.muted = true;
      video.preload = "none";
      if (!video.paused) video.pause();
    } catch { /* keep trying */ }
  });
  quiet();
  setInterval(quiet, 4000);
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const readerTabId = await getLiveTabId();
  if (tabId !== readerTabId) return;
  chrome.scripting.executeScript({ target: { tabId }, func: pauseVideoLoop }).catch(() => {});
});

async function closeLiveWindow() {
  await unblockVideoStream();
  const id = await getLiveTabId();
  if (id === null) return;
  await setLiveTabId(null);
  try { await chrome.tabs.remove(id); } catch { /* already closed */ }
}

async function openLiveWindow(username) {
  const clean = String(username || "").replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,32}$/.test(clean)) return;
  const url = `https://www.tiktok.com/@${clean}/live`;

  // If the user is already watching this LIVE in any tab, read from that tab
  // instead of opening our own. Lets them click through content gates
  // ("themes some may find uncomfortable") like a normal viewer.
  const openTabs = await chrome.tabs.query({ url: `*://*.tiktok.com/@${clean}/live*` }).catch(() => []);
  const readerTabId = await getLiveTabId();
  const usersOwnTab = openTabs.find((tab) => tab.id !== undefined && tab.id !== readerTabId);
  if (usersOwnTab) {
    await closeLiveWindow();
    return;
  }

  if (readerTabId !== null) {
    try {
      const existing = await chrome.tabs.get(readerTabId);
      const currentUrl = existing?.url || existing?.pendingUrl || "";
      if (currentUrl.includes(`/@${clean}/live`)) return; // already reading this LIVE
    } catch { /* stale id, fall through and reopen */ }
    await closeLiveWindow();
  }

  // Muted, pinned, unfocused tab in the current window: no new Chrome
  // window, no sound, just a small pinned tab next to the dashboard.
  const created = await chrome.tabs.create({ url, active: false, pinned: true }).catch(() => null);
  if (created?.id !== undefined) {
    try { await chrome.tabs.update(created.id, { muted: true }); } catch { /* mute is best-effort */ }
    await setLiveTabId(created.id);
    await blockVideoStream(created.id);
  }
}

function connect() {
  if (connector && (connector.readyState === WebSocket.OPEN || connector.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  let socket;
  try {
    socket = new WebSocket(ENGINE_URL);
  } catch {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    return;
  }
  connector = socket;
  socket.addEventListener("open", () => {
    if (connector !== socket) {
      socket.close();
      return;
    }
    reconnectDelay = 2000;
    saveStatus({ state: "ready", message: "Local LIVE engine connected." });
    socket.send(JSON.stringify({ type: "reader-controller-ready" }));
    while (pending.length && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(pending.shift()));
    }
    // Traffic at least every 20s keeps this MV3 service worker alive (Chrome 116+).
    heartbeatTimer = setInterval(() => send({ type: "reader-controller-ready" }), 20000);
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "status") saveStatus(message.status);
    if (message.type === "open-live") openLiveWindow(message.username);
    if (message.type === "close-live") closeLiveWindow();
  });
  socket.addEventListener("close", () => {
    if (connector !== socket) return;
    connector = null;
    clearInterval(heartbeatTimer);
    saveStatus(OFFLINE_STATUS);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    reconnectTimer = setTimeout(connect, reconnectDelay);
  });
  socket.addEventListener("error", () => socket.close());
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === sourceTabId) sourceTabId = null;
  const id = await getLiveTabId();
  if (tabId === id) {
    await setLiveTabId(null);
    await unblockVideoStream();
  }
});

// The alarm revives the service worker if Chrome put it to sleep while the
// engine was offline, so the extension reconnects without a popup click.
chrome.alarms.create("engine-reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "engine-reconnect") connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

// Only one tab may feed LIVE frames at a time. If the same room is open in
// two tabs (the reader tab plus the user's own), relaying both would double
// every gift and comment.
let sourceTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (["capture-open", "capture-frame", "capture-close", "capture-ready"].includes(message?.type)) {
    const tabId = sender?.tab?.id ?? null;
    if (message.type === "capture-open" && sourceTabId === null) sourceTabId = tabId;
    if (message.type === "capture-frame") {
      if (sourceTabId !== null && tabId !== null && tabId !== sourceTabId) {
        sendResponse({ ok: true, ignored: true });
        return;
      }
      capture.frames += 1;
      capture.lastFrameAt = new Date().toISOString();
      if (capture.frames === 1 || capture.frames % 25 === 0) persistCapture();
    }
    if (message.type === "capture-close" && tabId === sourceTabId) sourceTabId = null;
    if (message.type === "capture-ready") {
      capture.pageReadyAt = new Date().toISOString();
      persistCapture();
    }
    connect();
    send(message);
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "get-status") {
    connect();
    sendResponse({ ok: true, status: lastStatus, capture, online: connector?.readyState === WebSocket.OPEN });
    return;
  }
  if (message?.type === "connect-live") {
    connect();
    send({ type: "connect", username: message.username, autoReconnect: message.autoReconnect !== false });
    sendResponse({ ok: connector?.readyState === WebSocket.OPEN });
    return;
  }
  if (message?.type === "disconnect-live") {
    send({ type: "disconnect" });
    closeLiveWindow();
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "test-gift") {
    send({
      type: "simulate",
      event: {
        id: `extension-test-${Date.now()}`,
        type: "gift",
        timestamp: new Date().toISOString(),
        user: { id: "extension-test-viewer", uniqueId: "extension_test", displayName: "Extension Test", avatarUrl: "" },
        gift: { id: "rose", name: "Rose", coins: 1, repeatCount: 1, streakable: false, streakFinished: true }
      }
    });
    sendResponse({ ok: connector?.readyState === WebSocket.OPEN });
    return;
  }
  if (message?.type === "open-dashboard") {
    chrome.tabs.create({ url: "http://127.0.0.1:24880/", active: true });
    sendResponse({ ok: true });
  }
});

restoreCapture().finally(connect);
