const ENGINE_URL = "ws://127.0.0.1:24880/events";
const OFFLINE_STATUS = { state: "offline", message: "Start the local LIVE engine." };

let connector = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastStatus = OFFLINE_STATUS;
const pending = [];

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

async function closeLiveWindow() {
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
    reconnectTimer = setTimeout(connect, 2000);
    return;
  }
  connector = socket;
  socket.addEventListener("open", () => {
    if (connector !== socket) {
      socket.close();
      return;
    }
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
    reconnectTimer = setTimeout(connect, 2000);
  });
  socket.addEventListener("error", () => socket.close());
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const id = await getLiveTabId();
  if (tabId === id) await setLiveTabId(null);
});

// The alarm revives the service worker if Chrome put it to sleep while the
// engine was offline, so the extension reconnects without a popup click.
chrome.alarms.create("engine-reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "engine-reconnect") connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (["capture-open", "capture-frame", "capture-close", "capture-ready"].includes(message?.type)) {
    if (message.type === "capture-frame") {
      capture.frames += 1;
      capture.lastFrameAt = new Date().toISOString();
      if (capture.frames === 1 || capture.frames % 25 === 0) persistCapture();
    }
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
