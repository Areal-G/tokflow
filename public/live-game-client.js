(function liveGameClient(global) {
  "use strict";

  class LiveGameClient extends EventTarget {
    constructor(options = {}) {
      super();
      this.url = options.url || "ws://127.0.0.1:24880/events";
      this.dispatchGameEvent = options.dispatchGameEvent || null;
      this.autoReconnect = options.autoReconnect !== false;
      this.socket = null;
      this.retry = 0;
      this.retryTimer = null;
      this.closedByUser = false;
    }

    connect() {
      this.closedByUser = false;
      clearTimeout(this.retryTimer);
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
      this.#emit("transport", { state: "connecting" });
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", () => {
        this.retry = 0;
        this.#emit("transport", { state: "connected" });
      });
      this.socket.addEventListener("message", (message) => this.#message(message.data));
      this.socket.addEventListener("close", () => {
        this.#emit("transport", { state: "disconnected" });
        if (!this.closedByUser && this.autoReconnect) this.#reconnect();
      });
      this.socket.addEventListener("error", () => this.#emit("transport", { state: "error" }));
    }

    disconnect() {
      this.closedByUser = true;
      clearTimeout(this.retryTimer);
      if (this.socket) this.socket.close();
    }

    send(command) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
      this.socket.send(JSON.stringify(command));
      return true;
    }

    #message(raw) {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      this.#emit("message", message);
      if (message.type === "status") this.#emit("status", message.status);
      if (message.type === "streak") this.#emit("streak", message.event);
      if (message.type === "live-event") {
        this.#emit("live-event", message.event);
        if (message.gameEvent && typeof this.dispatchGameEvent === "function") {
          const accepted = this.dispatchGameEvent(message.gameEvent);
          this.#emit("game-dispatch", { accepted, event: message.gameEvent });
        }
      }
    }

    #reconnect() {
      const delay = Math.min(10000, 1000 * (2 ** Math.min(this.retry, 3)));
      this.retry += 1;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    }

    #emit(type, detail) {
      this.dispatchEvent(new CustomEvent(type, { detail }));
    }
  }

  global.TokFlow = { LiveGameClient };
  // Backwards-compatible alias for games written against the old name.
  global.EthiopianLive = global.TokFlow;
})(window);
