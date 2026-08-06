const $ = (selector) => document.querySelector(selector);
const statusBox = $("#status");
const statusLabel = $("#statusLabel");
const statusMessage = $("#statusMessage");
const username = $("#username");
const captureRow = $("#captureRow");
const captureInfo = $("#captureInfo");

function render(status = {}) {
  const state = status.state || "offline";
  statusBox.dataset.state = state;
  statusLabel.textContent = state === "connected" ? "LIVE CONNECTED" : state.replaceAll("-", " ").toUpperCase();
  statusMessage.textContent = status.message || "Waiting for the local engine.";
}

function renderCapture(capture) {
  if (!capture || !capture.frames) {
    captureRow.hidden = true;
    return;
  }
  captureRow.hidden = false;
  const last = capture.lastFrameAt ? new Date(capture.lastFrameAt) : null;
  const ago = last ? Math.max(0, Math.round((Date.now() - last.getTime()) / 1000)) : null;
  captureInfo.textContent = ago === null
    ? `${capture.frames} LIVE frames captured`
    : `${capture.frames} LIVE frames · last ${ago}s ago`;
}

async function initialize() {
  const saved = await chrome.storage.local.get(["liveUsername", "liveEngineStatus"]);
  username.value = saved.liveUsername || "";
  render(saved.liveEngineStatus);
  const response = await chrome.runtime.sendMessage({ type: "get-status" }).catch(() => null);
  if (response?.status) render(response.status);
  renderCapture(response?.capture);
}

$("#connect").addEventListener("click", async () => {
  const clean = username.value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,32}$/.test(clean)) {
    render({ state: "error", message: "Enter a valid TikTok username." });
    return;
  }
  await chrome.storage.local.set({ liveUsername: clean });
  const response = await chrome.runtime.sendMessage({ type: "connect-live", username: clean, autoReconnect: true }).catch(() => null);
  if (!response?.ok) render({ state: "offline", message: "Start the local LIVE engine first." });
  else render({ state: "connecting", message: `Opening @${clean}'s public LIVE…` });
});

$("#stop").addEventListener("click", () => chrome.runtime.sendMessage({ type: "disconnect-live" }));
$("#testGift").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "test-gift" }).catch(() => null);
  render(response?.ok
    ? { state: "ready", message: "Test Rose sent: +10 points to Doro Wot." }
    : { state: "offline", message: "Start the local LIVE engine first." });
});
$("#dashboard").addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-dashboard" }));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "status-update") {
    render(message.status);
    renderCapture(message.capture);
  }
});

initialize();
setInterval(async () => {
  const response = await chrome.runtime.sendMessage({ type: "get-status" }).catch(() => null);
  if (response?.capture) renderCapture(response.capture);
}, 5000);
