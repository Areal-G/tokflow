(() => {
  const $ = (selector) => document.querySelector(selector);
  const activity = $("#activity");
  const viewerStats = $("#viewerStats");
  const client = new window.TokFlow.LiveGameClient({ url: `ws://${window.location.host}/events` });
  const labels = { idle: "READY", login: "AGE CHECK", connecting: "CONNECTING", connected: "LIVE CONNECTED", waiting: "RECONNECTING", disconnected: "DISCONNECTED", error: "NEEDS ATTENTION" };
  const activityTargets = { like: $("#likeActivity"), join: $("#joinActivity"), comment: $("#commentActivity"), gift: $("#giftActivity"), follow: $("#followActivity"), share: $("#shareActivity") };
  const emptyLabels = { like: "Waiting for Likes…", join: "Waiting for viewers…", comment: "Waiting for comments…", gift: "Waiting for Gifts…", follow: "Waiting for follows…", share: "Waiting for shares…" };
  const activityCounts = { like: 0, join: 0, comment: 0, gift: 0, follow: 0, share: 0 };
  const likeBoard = new Map();
  const giftBoard = new Map();
  const shareBoard = new Map();
  let latestStatus = { state: "idle", viewerCount: 0, connectedAt: null };

  function updateLiveMetrics() {
    const connected = latestStatus.state === "connected";
    $("#liveViewerCount").textContent = connected ? Number(latestStatus.viewerCount || 0).toLocaleString() : "—";
    if (!connected || !latestStatus.connectedAt) {
      $("#liveDuration").textContent = "—";
      return;
    }
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(latestStatus.connectedAt).getTime()) / 60000));
    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = elapsedMinutes % 60;
    $("#liveDuration").textContent = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function addActivity(row) {
    activity.querySelector(".empty")?.remove();
    const item = document.createElement("div");
    item.className = `activity-row ${row.level || "info"}`;
    const time = new Date(row.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const user = row.event?.user;
    const name = String(user?.displayName || user?.username || "").trim();
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "•";
    const avatar = document.createElement("div");
    avatar.className = `activity-avatar${user ? " has-user" : ""}`;
    avatar.textContent = initials;
    if (user?.avatarUrl) {
      const image = document.createElement("img");
      image.src = user.avatarUrl;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove());
      avatar.appendChild(image);
    }
    const copy = document.createElement("span");
    copy.textContent = row.message || "Event received";
    const level = document.createElement("b");
    level.textContent = String(row.level || "info").toUpperCase();
    const timeNode = document.createElement("time");
    timeNode.textContent = time;
    item.append(timeNode, avatar, copy, level);
    activity.prepend(item);
    while (activity.children.length > 60) activity.lastElementChild.remove();
  }

  function makeAvatar(user, className = "activity-avatar") {
    const name = String(user?.displayName || user?.username || "").trim();
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "•";
    const avatar = document.createElement("div");
    avatar.className = className;
    avatar.textContent = initials;
    if (user?.avatarUrl) {
      const image = document.createElement("img");
      image.src = user.avatarUrl;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove());
      avatar.appendChild(image);
    }
    return avatar;
  }

  // Identity for the like leaderboard. TikTok like messages sometimes omit
  // the username ("unknown"), so fall back to the numeric id, then the
  // display name — otherwise every unknown liker merges into one row.
  function likeKey(user = {}) {
    const username = String(user.username || "").trim().toLowerCase();
    if (username && username !== "unknown") return `u:${username}`;
    const id = String(user.id || "").trim().toLowerCase();
    if (id && id !== "unknown") return `i:${id}`;
    const name = String(user.displayName || "").trim().toLowerCase();
    return name && name !== "tiktok viewer" ? `n:${name}` : "anonymous";
  }

  function renderLikeBoard() {
    const target = activityTargets.like;
    target.replaceChildren();
    const entries = [...likeBoard.values()].sort((a, b) =>
      b.total - a.total || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!entries.length) {
      target.innerHTML = `<div class="lane-empty">${emptyLabels.like}</div>`;
      return;
    }
    entries.slice(0, 40).forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = `lane-row like-rank-row${index === 0 ? " like-top" : ""}`;
      const rank = document.createElement("b");
      rank.className = "like-rank";
      rank.textContent = index === 0 ? "♛" : String(index + 1);
      const copy = document.createElement("div");
      copy.className = "lane-copy";
      const name = document.createElement("strong");
      name.textContent = entry.user.displayName || entry.user.username || "TikTok viewer";
      const message = document.createElement("p");
      message.textContent = `liked ${entry.total.toLocaleString()} ${entry.total === 1 ? "time" : "times"}`;
      copy.append(linkedName(entry.user, name), message);
      const time = document.createElement("time");
      time.textContent = new Date(entry.updatedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      item.append(rank, makeAvatar(entry.user, "lane-avatar"), copy, time);
      target.appendChild(item);
    });
  }

  // Wraps a name element in a link to the viewer's TikTok profile when we
  // know their @username.
  function linkedName(user, nameElement) {
    const username = String(user?.username || "").trim().replace(/^@/, "");
    if (!username || username === "unknown" || !/^[A-Za-z0-9._]{2,32}$/.test(username)) return nameElement;
    const link = document.createElement("a");
    link.href = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "user-link";
    link.title = `Open @${username} on TikTok`;
    link.appendChild(nameElement);
    return link;
  }

  function renderGiftBoard() {
    const target = $("#gifterActivity");
    target.replaceChildren();
    const entries = [...giftBoard.values()].sort((a, b) =>
      b.coins - a.coins || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!entries.length) {
      target.innerHTML = `<div class="lane-empty">Waiting for Gifts…</div>`;
      return;
    }
    entries.slice(0, 40).forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = `lane-row like-rank-row${index === 0 ? " like-top" : ""}`;
      const rank = document.createElement("b");
      rank.className = "like-rank";
      rank.textContent = index === 0 ? "♛" : String(index + 1);
      const copy = document.createElement("div");
      copy.className = "lane-copy";
      const name = document.createElement("strong");
      name.textContent = entry.user.displayName || entry.user.username || "TikTok viewer";
      const message = document.createElement("p");
      message.textContent = `${entry.coins.toLocaleString()} ${entry.coins === 1 ? "coin" : "coins"}`;
      copy.append(linkedName(entry.user, name), message);
      const time = document.createElement("time");
      time.textContent = new Date(entry.updatedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      item.append(rank, makeAvatar(entry.user, "lane-avatar"), copy, time);
      target.appendChild(item);
    });
  }

  function renderShareBoard() {
    const target = $("#shareActivity");
    target.replaceChildren();
    const entries = [...shareBoard.values()].sort((a, b) =>
      b.count - a.count || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!entries.length) {
      target.innerHTML = `<div class="lane-empty">Waiting for shares…</div>`;
      return;
    }
    entries.slice(0, 40).forEach((entry) => {
      const item = document.createElement("div");
      item.className = "lane-row";
      const copy = document.createElement("div");
      copy.className = "lane-copy";
      const name = document.createElement("strong");
      name.textContent = entry.user.displayName || entry.user.username || "TikTok viewer";
      const message = document.createElement("p");
      message.textContent = entry.count === 1
        ? "Shared the LIVE ↗"
        : `Shared the LIVE ↗ · ${entry.count.toLocaleString()} times`;
      copy.append(linkedName(entry.user, name), message);
      const time = document.createElement("time");
      time.textContent = new Date(entry.updatedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      item.append(makeAvatar(entry.user, "lane-avatar"), copy, time);
      target.appendChild(item);
    });
  }

  function addCategorizedActivity(row) {
    const type = row.event?.type;
    const target = activityTargets[type];
    if (!target) {
      if (row.level === "debug") return;
      $("#systemNotice").textContent = row.message || "The connector is ready.";
      $("#systemNotice").dataset.level = row.level || "info";
      return;
    }
    const displayName = row.event.user?.displayName || row.event.user?.username || "TikTok viewer";
    if (type === "share") {
      const key = likeKey(row.event.user);
      const entry = shareBoard.get(key) || { user: {}, count: 0 };
      entry.count += 1;
      const incoming = row.event.user || {};
      entry.user = {
        id: incoming.id || entry.user.id || "",
        username: incoming.username || entry.user.username || "",
        displayName: incoming.displayName || entry.user.displayName || "",
        avatarUrl: incoming.avatarUrl || entry.user.avatarUrl || ""
      };
      entry.updatedAt = row.timestamp || new Date().toISOString();
      shareBoard.set(key, entry);
      renderShareBoard();
      activityCounts.share += 1;
      $("#shareCount").textContent = activityCounts.share.toLocaleString();
      return;
    }
    if (type === "like") {
      const likeCount = Math.max(1, Number(row.event.count) || 1);
      const key = likeKey(row.event.user);
      const entry = likeBoard.get(key) || { user: {}, total: 0 };
      entry.total += likeCount;
      const incoming = row.event.user || {};
      entry.user = {
        id: incoming.id || entry.user.id || "",
        username: incoming.username || entry.user.username || "",
        displayName: incoming.displayName || entry.user.displayName || "",
        avatarUrl: incoming.avatarUrl || entry.user.avatarUrl || ""
      };
      entry.updatedAt = row.timestamp || new Date().toISOString();
      likeBoard.set(key, entry);
      renderLikeBoard();
      activityCounts.like += likeCount;
      $("#likeCount").textContent = activityCounts.like.toLocaleString();
      return;
    }
    target.querySelector(".lane-empty")?.remove();
    const item = document.createElement("div");
    item.className = "lane-row";
    const copy = document.createElement("div");
    copy.className = "lane-copy";
    const name = document.createElement("strong");
    name.textContent = displayName;
    const message = document.createElement("p");
    if (type === "comment") {
      const commentText = row.event.comment || "";
      const emotes = Array.isArray(row.event.emotes) ? row.event.emotes : [];
      if (commentText) message.appendChild(document.createTextNode(commentText));
      emotes.forEach((url) => {
        const emote = document.createElement("img");
        emote.className = "gift-icon";
        emote.src = url;
        emote.alt = "";
        emote.referrerPolicy = "no-referrer";
        emote.addEventListener("error", () => emote.remove());
        message.appendChild(emote);
      });
      if (!commentText && !emotes.length) message.textContent = "Comment text unavailable";
    }
    else if (type === "join") message.textContent = "Joined the LIVE";
    else if (type === "follow") message.textContent = "Started following ✚";
    else if (type === "share") message.textContent = "Shared the LIVE ↗";
    else if (type === "gift") {
      const repeat = Math.max(1, Number(row.event.gift?.repeatCount) || 1);
      const coins = Math.max(0, Number(row.event.gift?.totalCoins)
        || Math.max(0, Number(row.event.gift?.coinsPerGift) || 0) * repeat);
      const iconUrl = String(row.event.gift?.imageUrl || "");
      if (iconUrl) {
        const icon = document.createElement("img");
        icon.className = "gift-icon";
        icon.src = iconUrl;
        icon.alt = "";
        icon.referrerPolicy = "no-referrer";
        icon.addEventListener("error", () => icon.remove());
        message.appendChild(icon);
      }
      const coinsLabel = coins ? ` · ${coins.toLocaleString()} ${coins === 1 ? "coin" : "coins"}` : "";
      message.appendChild(document.createTextNode(`${repeat.toLocaleString()}× ${row.event.gift?.name || "Gift"}${coinsLabel}`));

      const key = likeKey(row.event.user);
      const entry = giftBoard.get(key) || { user: {}, coins: 0 };
      entry.coins += coins;
      const incoming = row.event.user || {};
      entry.user = {
        id: incoming.id || entry.user.id || "",
        username: incoming.username || entry.user.username || "",
        displayName: incoming.displayName || entry.user.displayName || "",
        avatarUrl: incoming.avatarUrl || entry.user.avatarUrl || ""
      };
      entry.updatedAt = row.timestamp || new Date().toISOString();
      giftBoard.set(key, entry);
      renderGiftBoard();
    }
    else message.textContent = row.message || "Event received";
    copy.append(linkedName(row.event.user, name), message);
    const time = document.createElement("time");
    time.textContent = new Date(row.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    item.append(makeAvatar(row.event.user, "lane-avatar"), copy, time);
    target.prepend(item);
    while (target.children.length > 40) target.lastElementChild.remove();
    activityCounts[type] += type === "gift" ? Math.max(1, Number(row.event.gift?.repeatCount) || 1) : 1;
    $(`#${type}Count`).textContent = activityCounts[type].toLocaleString();
  }

  function resetActivity() {
    likeBoard.clear();
    giftBoard.clear();
    shareBoard.clear();
    $("#gifterActivity").innerHTML = `<div class="lane-empty">Waiting for Gifts…</div>`;
    Object.entries(activityTargets).forEach(([type, target]) => {
      activityCounts[type] = 0;
      $(`#${type}Count`).textContent = "0";
      target.innerHTML = `<div class="lane-empty">${emptyLabels[type]}</div>`;
    });
    $("#systemNotice").textContent = "The connector is ready.";
    delete $("#systemNotice").dataset.level;
  }

  function renderViewerStats(viewers) {
    viewerStats.replaceChildren();
    if (!viewers.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Waiting for viewer activity…";
      viewerStats.appendChild(empty);
      return;
    }
    viewers.forEach((viewer) => {
      const row = document.createElement("div");
      row.className = "viewer-row";
      const identity = document.createElement("div");
      identity.className = "viewer-identity";
      const name = document.createElement("strong");
      name.textContent = viewer.user.displayName || viewer.user.username || "TikTok viewer";
      const username = document.createElement("small");
      username.textContent = viewer.user.username && viewer.user.username !== "unknown" ? `@${viewer.user.username}` : "TikTok viewer";
      identity.append(linkedName(viewer.user, name), username);
      row.append(makeAvatar(viewer.user, "viewer-avatar"), identity);
      [
        [viewer.comments, "Comments"],
        [viewer.gifts, "Gifts"],
        [viewer.likes, "Likes"]
      ].forEach(([value, label]) => {
        const metric = document.createElement("div");
        metric.className = "viewer-metric";
        const number = document.createElement("b");
        number.textContent = Number(value || 0).toLocaleString();
        const caption = document.createElement("small");
        caption.textContent = label;
        metric.append(number, caption);
        if (label === "Gifts") metric.title = `${Number(viewer.giftCoins || 0).toLocaleString()} total Gift coins`;
        row.appendChild(metric);
      });
      viewerStats.appendChild(row);
    });
  }

  client.addEventListener("status", ({ detail: status }) => {
    latestStatus = status;
    updateLiveMetrics();
    document.body.dataset.status = status.state;
    $("#statusLabel").textContent = labels[status.state] || status.state.toUpperCase();
    $("#statusMessage").textContent = status.message;
    $("#statusDetail").textContent = status.state === "connected"
      ? `Events from @${status.username} are being sent to every connected game.`
      : "Start your TikTok LIVE first, then connect using your username.";
    if (status.username) $("#username").value = status.username;
    $("#autoReconnect").checked = status.autoReconnect !== false;
    $("#connectButton").disabled = status.state === "connecting";
  });

  client.addEventListener("message", ({ detail }) => {
    if (detail.type === "log") addCategorizedActivity(detail);
    if (detail.type === "history") {
      resetActivity();
      [...detail.logs].reverse().forEach(addCategorizedActivity);
    }
    if (detail.type === "viewer-stats") renderViewerStats(detail.viewers || []);
    if (detail.type === "command-error") addCategorizedActivity({ level: "error", message: detail.message });
  });

  $("#connectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    client.send({ type: "connect", username: $("#username").value, autoReconnect: $("#autoReconnect").checked });
  });
  $("#disconnectButton").addEventListener("click", () => client.send({ type: "disconnect" }));
  $("#openLoginButton").addEventListener("click", () => client.send({ type: "open-login" }));
  $("#clearLog").addEventListener("click", () => client.send({ type: "clear-log" }));
  $("#clearViewerStats").addEventListener("click", () => client.send({ type: "clear-viewer-stats" }));
  $("#sendTest").addEventListener("click", () => {
    const now = Date.now();
    const coins = Math.max(0, Number($("#testCoins").value || 0));
    const event = {
      schemaVersion: 1,
      id: `test-gift-${now}`,
      type: "gift",
      occurredAt: new Date(now).toISOString(),
      user: { id: "test-viewer", username: "test_viewer", displayName: $("#testViewer").value || "Test Viewer", avatarUrl: "" },
      gift: { id: "test", name: $("#testGift").value || "Rose", coinsPerGift: coins, repeatCount: 1, totalCoins: coins, streakable: false, streakFinished: true, imageUrl: "" }
    };
    client.send({ type: "simulate", event });
  });
  $("#themeToggle").addEventListener("click", () => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = root.dataset.theme || (systemDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("tokflow-theme", next); } catch { /* private mode */ }
  });

  setInterval(updateLiveMetrics, 1000);
  client.connect();
})();
