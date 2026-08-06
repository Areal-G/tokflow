export class RecentEvents {
  constructor({ ttlMs = 120000, maxSize = 5000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.items = new Map();
  }

  hasOrAdd(id, now = Date.now()) {
    this.prune(now);
    if (this.items.has(id)) return true;
    this.items.set(id, now);
    if (this.items.size > this.maxSize) {
      const oldest = this.items.keys().next().value;
      this.items.delete(oldest);
    }
    return false;
  }

  prune(now = Date.now()) {
    for (const [id, timestamp] of this.items) {
      if (now - timestamp <= this.ttlMs) break;
      this.items.delete(id);
    }
  }

  clear() {
    this.items.clear();
  }
}
