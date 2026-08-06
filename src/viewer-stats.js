export class ViewerStats {
  constructor({ maxViewers = 250 } = {}) {
    this.maxViewers = maxViewers;
    this.viewers = new Map();
  }

  record(event) {
    if (!event?.user || !["gift", "comment", "like"].includes(event.type)) return null;
    const username = String(event.user.username || "").trim();
    const userId = String(event.user.id || "").trim();
    const key = username && username !== "unknown" ? `username:${username.toLowerCase()}` : `id:${userId || "unknown"}`;
    const current = this.viewers.get(key) || {
      key,
      user: { id: userId, username, displayName: "TikTok viewer", avatarUrl: "" },
      comments: 0,
      gifts: 0,
      giftCoins: 0,
      likes: 0,
      updatedAt: event.occurredAt || new Date().toISOString()
    };

    current.user = {
      id: userId || current.user.id,
      username: username || current.user.username,
      displayName: String(event.user.displayName || current.user.displayName || username || "TikTok viewer"),
      avatarUrl: String(event.user.avatarUrl || current.user.avatarUrl || "")
    };
    if (event.type === "comment") current.comments += 1;
    if (event.type === "like") current.likes += Math.max(1, Math.trunc(Number(event.count) || 1));
    if (event.type === "gift") {
      current.gifts += Math.max(1, Math.trunc(Number(event.gift?.repeatCount) || 1));
      current.giftCoins += Math.max(0, Math.trunc(Number(event.gift?.totalCoins) || 0));
    }
    current.updatedAt = event.occurredAt || new Date().toISOString();
    this.viewers.delete(key);
    this.viewers.set(key, current);

    while (this.viewers.size > this.maxViewers) {
      this.viewers.delete(this.viewers.keys().next().value);
    }
    return current;
  }

  snapshot() {
    return [...this.viewers.values()].sort((a, b) =>
      b.gifts - a.gifts
      || b.likes - a.likes
      || b.comments - a.comments
      || String(b.updatedAt).localeCompare(String(a.updatedAt))
    );
  }

  clear() {
    this.viewers.clear();
  }
}
