import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { deserializeWebSocketMessage } from "tiktok-live-connector";
import { normalizeComment, normalizeGift, normalizeLike, normalizeMember, normalizeRoomStats, normalizeSocial } from "./event-normalizer.js";

export function cleanUsername(value) {
  let username = String(value || "").trim();
  const liveUrl = username.match(/tiktok\.com\/@([^/?#]+)/i);
  if (liveUrl) username = liveUrl[1];
  username = username.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9._]{2,32}$/.test(username)) {
    throw new Error("Enter a valid TikTok username, for example @yourname.");
  }
  return username;
}

export function findBrowserExecutable() {
  const candidates = [
    process.env.LIVE_ENGINE_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Google Chrome or Microsoft Edge is required for the free local LIVE connection.");
  return found;
}

export class TikTokProvider extends EventEmitter {
  constructor({ reconnectDelays = [2000, 5000, 10000, 20000, 30000], socketTimeoutMs = 30000, profileDir = "", extensionDir = "" } = {}) {
    super();
    this.reconnectDelays = reconnectDelays;
    this.socketTimeoutMs = socketTimeoutMs;
    this.profileDir = profileDir;
    this.extensionDir = extensionDir;
    this.username = "";
    this.autoReconnect = true;
    this.stoppedByUser = true;
    this.retryAttempt = 0;
    this.retryTimer = null;
    this.socketLossTimer = null;
    this.generation = 0;
    this.browser = null;
    this.chromeProcess = null;
    this.context = null;
    this.page = null;
    this.liveSockets = new Set();
    this.connected = false;
    this.roomId = "";
    this.captureAccept = null;
    this.captureReject = null;
    this.readerReady = false;
  }

  async connect(username, { autoReconnect = true } = {}) {
    const clean = cleanUsername(username);
    await this.disconnect({ userInitiated: false });
    this.username = clean;
    this.autoReconnect = Boolean(autoReconnect);
    this.stoppedByUser = false;
    this.retryAttempt = 0;
    return this.#open();
  }

  async openLoginWindow() {
    await this.disconnect({ userInitiated: true });
    const executablePath = findBrowserExecutable();
    this.#status("login", "Opening your normal Chrome for TikTok login…", { transport: "normal-browser", roomId: "" });

    const child = spawn(executablePath, [
      "--no-first-run",
      "--no-default-browser-check",
      "https://www.tiktok.com/login"
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });

    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    this.#status("idle", "Your normal Chrome opened. Log in there if needed, then press Connect.", { transport: "normal-browser", roomId: "" });
  }

  async #open() {
    const generation = ++this.generation;
    this.#status("connecting", `Opening @${this.username}'s public LIVE…`, { transport: "local-browser", roomId: "" });
    this.connected = false;
    this.liveSockets.clear();
    this.readerReady = false;
    clearTimeout(this.socketLossTimer);

    try {
      const socketReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const message = this.readerReady
            ? `@${this.username} is not LIVE, is private, or TikTok did not expose the public event stream.`
            : "The TokFlow LIVE Reader extension is not installed, enabled, or reloaded in your normal Chrome.";
          this.captureReject?.(new Error(message));
        }, this.socketTimeoutMs);
        this.captureAccept = (roomId) => {
          clearTimeout(timer);
          this.captureAccept = null;
          this.captureReject = null;
          resolve(roomId);
        };
        this.captureReject = (error) => {
          clearTimeout(timer);
          this.captureAccept = null;
          this.captureReject = null;
          reject(error);
        };
      });
      this.emit("reader-command", { type: "open-live", username: this.username });
      const roomId = await socketReady;
      if (generation !== this.generation) return null;
      this.retryAttempt = 0;
      this.connected = true;
      this.roomId = roomId;
      this.#status("connected", `Connected to @${this.username}`, { roomId, transport: "local-browser" });
      return { roomId };
    } catch (error) {
      if (generation !== this.generation) return null;
      const message = this.#errorMessage(error);
      this.captureAccept = null;
      this.captureReject = null;
      await this.#closeBrowser();
      this.#status("error", message, { transport: "local-browser", roomId: "" });
      if (/requires desktop age confirmation|approved followers|browser profile is not configured|Chrome or Microsoft Edge is required/i.test(message)) {
        this.stoppedByUser = true;
      } else {
        this.#scheduleReconnect(generation);
      }
      throw new Error(message);
    }
  }

  acceptCapturedSocket(url) {
    if (this.stoppedByUser || !String(url).includes("webcast")) return false;
    let roomId = "";
    try { roomId = new URL(url).searchParams.get("room_id") || ""; } catch { /* keep blank */ }
    this.liveSockets.add(String(url));
    clearTimeout(this.socketLossTimer);
    this.captureAccept?.(roomId);
    return true;
  }

  acceptCaptureReady() {
    this.readerReady = true;
  }

  async acceptCapturedFrame(payload) {
    if (this.stoppedByUser || typeof payload !== "string") return;
    await this.#handleFrame(Buffer.from(payload, "base64"), this.generation);
  }

  capturedSocketClosed(url) {
    this.liveSockets.delete(String(url));
    if (!this.liveSockets.size && this.connected && !this.stoppedByUser) {
      const generation = this.generation;
      clearTimeout(this.socketLossTimer);
      this.socketLossTimer = setTimeout(() => {
        if (!this.liveSockets.size) this.#transportLost(generation, "TikTok's LIVE event stream closed.");
      }, 12000);
    }
  }

  #handleSocket(socket, generation, accept) {
    if (generation !== this.generation || !socket.url().includes("webcast")) return;
    let roomId = "";
    try { roomId = new URL(socket.url()).searchParams.get("room_id") || ""; } catch { /* keep blank */ }
    this.liveSockets.add(socket);
    clearTimeout(this.socketLossTimer);
    accept(roomId);

    socket.on("framereceived", ({ payload }) => this.#handleFrame(payload, generation));
    socket.on("close", () => {
      this.liveSockets.delete(socket);
      if (!this.liveSockets.size && generation === this.generation && !this.stoppedByUser) {
        clearTimeout(this.socketLossTimer);
        this.socketLossTimer = setTimeout(() => {
          if (!this.liveSockets.size) this.#transportLost(generation, "TikTok's LIVE event stream closed.");
        }, 12000);
      }
    });
  }

  async #handleFrame(payload, generation) {
    if (generation !== this.generation) return;
    try {
      const frame = await deserializeWebSocketMessage(Buffer.from(payload));
      for (const message of frame.protoMessageFetchResult?.messages || []) {
        const decoded = message.decodedData;
        if (!decoded?.data) continue;
        const raw = decoded.data;
        if (decoded.type === "WebcastGiftMessage") {
          const event = normalizeGift(raw);
          if (event.gift.streakable && !event.gift.streakFinished) this.emit("streak", event);
          else this.emit("event", event);
        } else if (decoded.type === "WebcastChatMessage") {
          this.emit("event", normalizeComment(raw));
        } else if (decoded.type === "WebcastLikeMessage") {
          this.emit("event", normalizeLike(raw));
        } else if (decoded.type === "WebcastRoomUserSeqMessage") {
          this.emit("room-stats", normalizeRoomStats(raw));
        } else if (decoded.type === "WebcastMemberMessage") {
          this.emit("event", normalizeMember(raw));
        } else if (["WebcastSocialMessage", "WebcastFollowMessage", "WebcastShareMessage"].includes(decoded.type)) {
          this.emit("event", normalizeSocial(raw));
        }
      }
    } catch (error) {
      this.emit("log", { level: "debug", message: `Ignored one unreadable TikTok frame: ${this.#errorMessage(error)}` });
    }
  }

  async #transportLost(generation, message) {
    if (generation !== this.generation || this.stoppedByUser) return;
    this.connected = false;
    await this.#closeBrowser();
    this.#status("disconnected", message, { transport: "local-browser" });
    this.#scheduleReconnect(generation);
  }

  async disconnect({ userInitiated = true } = {}) {
    if (userInitiated) this.stoppedByUser = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.socketLossTimer);
    this.retryTimer = null;
    this.socketLossTimer = null;
    this.generation += 1;
    this.connected = false;
    this.liveSockets.clear();
    this.captureAccept = null;
    this.captureReject = null;
    this.emit("reader-command", { type: "close-live" });
    await this.#closeBrowser();
    if (userInitiated) this.#status("idle", "Connector stopped.", { transport: "local-browser" });
  }

  async #closeBrowser() {
    clearTimeout(this.socketLossTimer);
    this.socketLossTimer = null;
    this.liveSockets.clear();
    const chromeProcess = this.chromeProcess;
    this.browser = null;
    this.chromeProcess = null;
    this.context = null;
    this.page = null;
    if (chromeProcess && chromeProcess.exitCode === null) {
      chromeProcess.removeAllListeners("exit");
      try { chromeProcess.kill(); } catch { /* already closed */ }
    }
  }

  #scheduleReconnect(generation) {
    if (!this.autoReconnect || this.stoppedByUser || this.retryTimer || generation !== this.generation) return;
    const index = Math.min(this.retryAttempt, this.reconnectDelays.length - 1);
    const delay = this.reconnectDelays[index];
    this.retryAttempt += 1;
    this.#status("waiting", `Reconnecting in ${Math.ceil(delay / 1000)} seconds…`, { retryAttempt: this.retryAttempt, transport: "local-browser" });
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (generation !== this.generation || this.stoppedByUser) return;
      try { await this.#open(); } catch { /* #open schedules the next retry */ }
    }, delay);
  }

  #status(state, message, extra = {}) {
    this.emit("status", { state, message, username: this.username, autoReconnect: this.autoReconnect, ...extra });
  }

  #errorMessage(error) {
    const candidate = error?.exception?.message || error?.message || error?.info || error;
    const message = String(candidate || "Unknown TikTok connection error");
    if (/ERR_NETWORK_ACCESS_DENIED/i.test(message)) return "Windows or a security tool blocked Chrome from opening TikTok.";
    if (/user data directory is already in use|processsingleton|opening in existing browser session|target page, context or browser has been closed/i.test(message)) {
      return "The TikTok login Chrome window is still open. Finish logging in, close that Chrome window completely, then press Connect again.";
    }
    return message.length > 240 ? `${message.slice(0, 237)}…` : message;
  }

  #userAgent() {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
  }
}
