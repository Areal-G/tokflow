/* TokFlow game client — drop this into any game and it is connected.
 *
 *   <script src="/tokflow-game.js"></script>
 *   <script>
 *     const tf = TokFlow.connect({
 *       id: "race-to-the-line",
 *       name: "Where are you from?",
 *       version: "1.0"
 *     });
 *
 *     tf.on("comment", (e) => {
 *       const region = matchLetter(e.comment);
 *       if (region) { score(region); tf.counted(e, { reason: "letter", target: region, points: 1 }); }
 *       else        { tf.ignored(e, "not a letter"); }
 *     });
 *
 *     tf.on("gift", (e) => { ... tf.counted(e, { reason: "gift", target: region, points: pts }); });
 *     tf.on("follow" | "share" | "like" | "join", handler);
 *     tf.on("status", (s) => ...);   // engine state
 *
 * Every game speaks the same protocol, so a new game needs no engine changes.
 * The engine records the raw stream on its own; what a game reports through
 * counted()/ignored() is the interpretation — which comment meant something in
 * THIS game and why — so each game's analytics stay its own.
 *
 * Reconnects on its own. Nothing here throws into your game loop.
 */
(function (global) {
  "use strict";

  function TokFlowClient(game, options) {
    this.game = {
      id: String(game.id || "unnamed-game"),
      name: game.name || game.id || "Unnamed game",
      version: game.version || "0"
    };
    this.url = options.url || ("ws://" + location.host + "/events");
    this.handlers = Object.create(null);
    this.socket = null;
    this.collecting = true;
    this.connected = false;
    this.reportEnabled = options.report !== false;
    this._retryMs = 2500;
    this._open();
  }

  TokFlowClient.prototype._emit = function (name, payload) {
    const list = this.handlers[name];
    if (!list) return;
    for (const fn of list) {
      // a throw inside one handler must not stop the others, or the socket
      try { fn(payload); } catch (err) { console.error("[tokflow] handler for", name, err); }
    }
  };

  TokFlowClient.prototype.on = function (name, fn) {
    (this.handlers[name] = this.handlers[name] || []).push(fn);
    return this;
  };

  TokFlowClient.prototype._open = function () {
    let ws;
    try { ws = new WebSocket(this.url); }
    catch { setTimeout(() => this._open(), this._retryMs); return; }
    this.socket = ws;

    ws.addEventListener("open", () => {
      this.connected = true;
      this._emit("connected", { url: this.url });
      this.send({ type: "game-register", game: this.game });
    });

    ws.addEventListener("close", () => {
      this.connected = false;
      this._emit("disconnected", {});
      setTimeout(() => this._open(), this._retryMs);
    });

    ws.addEventListener("error", () => { try { ws.close(); } catch {} });

    ws.addEventListener("message", (msg) => {
      let m;
      try { m = JSON.parse(msg.data); } catch { return; }

      if (m.type === "analytics-state") { this.collecting = !!m.collecting; this._emit("collecting", this.collecting); return; }
      if (m.type === "game-registered")  { this.collecting = !!m.collecting; this._emit("registered", m); return; }
      if (m.type === "status")           { this._emit("status", m.status || {}); return; }
      if (m.type !== "live-event")       { this._emit(m.type, m); return; }

      const e = m.event || {};
      const view = {
        id: e.id,
        type: e.type,
        at: e.occurredAt,
        user: {
          id: (e.user && e.user.id) || "",
          username: (e.user && e.user.username) || "",
          name: (e.user && e.user.displayName) || (e.user && e.user.username) || "Viewer",
          avatar: (e.user && e.user.avatarUrl) || ""
        },
        comment: e.comment || "",
        likes: e.count || 0,
        gift: e.gift ? {
          id: e.gift.id, name: e.gift.name || "",
          coins: e.gift.coinsPerGift || 0,
          repeat: e.gift.repeatCount || 1,
          totalCoins: e.gift.totalCoins || 0,
          image: e.gift.imageUrl || ""
        } : null,
        raw: e
      };
      this._emit("event", view);
      this._emit(view.type, view);
    });
  };

  TokFlowClient.prototype.send = function (obj) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  TokFlowClient.prototype._annotate = function (event, relevant, info) {
    if (!this.reportEnabled) return;
    info = info || {};
    this.send({
      type: "game-annotate",
      annotation: {
        gameId: this.game.id,
        eventId: event && event.id,
        timestamp: (event && event.at) || new Date().toISOString(),
        type: event && event.type,
        username: event && event.user && event.user.username,
        displayName: event && event.user && event.user.name,
        relevant: relevant,
        reason: info.reason || (relevant ? "" : "ignored"),
        target: info.target || "",
        points: info.points,
        giftName: (event && event.gift && event.gift.name) || "",
        coins: (event && event.gift && event.gift.totalCoins) || "",
        comment: (event && event.comment) || ""
      }
    });
  };

  /* This event meant something in the game. `target` is whatever the game is
     scoring for — a region, a team, a player — and `reason` is how it counted. */
  TokFlowClient.prototype.counted = function (event, info) { this._annotate(event, true, info); };

  /* This event reached the game but did not count. Still worth recording: the
     ratio of ignored to counted is how you learn whether people understand the
     game, and what they type when they misunderstand it. */
  TokFlowClient.prototype.ignored = function (event, reason) {
    this._annotate(event, false, { reason: reason || "ignored" });
  };

  global.TokFlow = {
    connect: function (game, options) { return new TokFlowClient(game || {}, options || {}); },
    version: 1
  };
})(window);
