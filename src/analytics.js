import fs from "node:fs";
import path from "node:path";

/* Records every event the engine sees, so a stream can be analysed after the
   fact — who gifted what, who talks, who shares, what a session was worth.
   Two files are written side by side:

     events-<date>.jsonl  one JSON object per line, the complete event. Append
                          only, survives a crash, and is what a real analytics
                          tool should read later.
     events-<date>.csv    the same rows flattened for Excel.

   The CSV is written with a UTF-8 BOM on purpose: without it Excel renders
   Amharic usernames as mojibake, which would make the export useless here. */

const CSV_COLUMNS = [
  "timestamp", "sessionId", "type", "userId", "username", "displayName",
  "giftId", "giftName", "coinsPerGift", "repeatCount", "totalCoins",
  "comment", "likeCount", "viewerCount", "avatarUrl"
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/\r?\n/g, " ").trim();
  return /[",;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Excel needs a byte-order mark or it mangles Amharic display names.
// Excel mangles Amharic display names without a byte-order mark.
const BOM = "﻿";
const NL = "\n";

const dayStamp = (d) => d.toISOString().slice(0, 10);

export class Analytics {
  constructor(dir) {
    this.dir = dir;
    this.sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    this.day = null;
    this.jsonl = null;
    this.csv = null;
    this.totals = this.emptyTotals();
    fs.mkdirSync(this.dir, { recursive: true });
    this.rotate(new Date());
  }

  emptyTotals() {
    return {
      startedAt: new Date().toISOString(),
      events: 0,
      byType: {},
      coins: 0,
      gifts: 0,
      peakViewers: 0,
      users: new Map(),   // username -> tallies
      giftTallies: new Map()
    };
  }

  /* One file per calendar day. A stream that runs past midnight keeps writing
     without the day's data ending up in the wrong file. */
  rotate(now) {
    const day = dayStamp(now);
    if (day === this.day) return;
    this.day = day;
    const base = path.join(this.dir, "events-" + day);
    this.jsonl = base + ".jsonl";
    this.csv = base + ".csv";
    if (!fs.existsSync(this.csv)) {
      fs.writeFileSync(this.csv, BOM + CSV_COLUMNS.join(",") + "\n", "utf8");
    }
  }

  record(event, viewerCount = 0) {
    if (!event || !event.type) return;
    const now = new Date();
    this.rotate(now);

    const user = event.user || {};
    const gift = event.gift || {};
    const row = {
      timestamp: event.occurredAt || now.toISOString(),
      sessionId: this.sessionId,
      type: event.type,
      userId: user.id || "",
      username: user.username || "",
      displayName: user.displayName || "",
      giftId: gift.id || "",
      giftName: gift.name || "",
      coinsPerGift: gift.coinsPerGift ?? "",
      repeatCount: gift.repeatCount ?? "",
      totalCoins: gift.totalCoins ?? "",
      comment: event.comment || "",
      likeCount: event.count ?? "",
      viewerCount,
      avatarUrl: user.avatarUrl || ""
    };

    try {
      fs.appendFileSync(this.jsonl, JSON.stringify({ ...row, raw: event }) + "\n", "utf8");
      fs.appendFileSync(this.csv, CSV_COLUMNS.map((c) => csvCell(row[c])).join(",") + "\n", "utf8");
    } catch { /* never let logging break the stream */ }

    this.tally(row);
  }

  tally(row) {
    const t = this.totals;
    t.events += 1;
    t.byType[row.type] = (t.byType[row.type] || 0) + 1;
    if (row.viewerCount > t.peakViewers) t.peakViewers = row.viewerCount;

    const key = row.username || row.userId || "unknown";
    if (!t.users.has(key)) {
      t.users.set(key, {
        username: key, displayName: row.displayName, avatarUrl: row.avatarUrl,
        gifts: 0, coins: 0, comments: 0, likes: 0, shares: 0, follows: 0,
        firstSeen: row.timestamp, lastSeen: row.timestamp
      });
    }
    const u = t.users.get(key);
    u.lastSeen = row.timestamp;
    if (row.avatarUrl) u.avatarUrl = row.avatarUrl;

    if (row.type === "gift") {
      const coins = Number(row.totalCoins) || 0;
      u.gifts += Number(row.repeatCount) || 1;
      u.coins += coins;
      t.gifts += Number(row.repeatCount) || 1;
      t.coins += coins;
      const g = t.giftTallies.get(row.giftName) ||
        { name: row.giftName, coinsPerGift: Number(row.coinsPerGift) || 0, count: 0, coins: 0 };
      g.count += Number(row.repeatCount) || 1;
      g.coins += coins;
      t.giftTallies.set(row.giftName, g);
    } else if (row.type === "comment") u.comments += 1;
    else if (row.type === "like") u.likes += Number(row.likeCount) || 1;
    else if (row.type === "share") u.shares += 1;
    else if (row.type === "follow") u.follows += 1;
  }

  summary(limit = 25) {
    const t = this.totals;
    const users = [...t.users.values()];
    const top = (key) => users.filter((u) => u[key] > 0)
      .sort((a, b) => b[key] - a[key]).slice(0, limit);
    return {
      sessionId: this.sessionId,
      startedAt: t.startedAt,
      files: { jsonl: path.basename(this.jsonl), csv: path.basename(this.csv) },
      totals: {
        events: t.events, byType: t.byType,
        gifts: t.gifts, coins: t.coins,
        uniquePeople: users.length, peakViewers: t.peakViewers
      },
      topGifters: top("coins").map((u) => ({
        username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl,
        gifts: u.gifts, coins: u.coins
      })),
      topCommenters: top("comments").map((u) => ({
        username: u.username, displayName: u.displayName, comments: u.comments
      })),
      topSharers: top("shares").map((u) => ({ username: u.username, shares: u.shares })),
      newFollowers: users.filter((u) => u.follows > 0).map((u) => u.username),
      giftBreakdown: [...t.giftTallies.values()].sort((a, b) => b.coins - a.coins)
    };
  }

  /* People, one row each — the sheet you actually want when asking
     "who are my top supporters". Built on demand from the running tallies. */
  peopleCsv() {
    const cols = ["username", "displayName", "gifts", "coins", "comments",
                  "likes", "shares", "follows", "firstSeen", "lastSeen"];
    const rows = [...this.totals.users.values()].sort((a, b) => b.coins - a.coins);
    const lines = rows.map((u) => cols.map((c) => csvCell(u[c])).join(","));
    return BOM + [cols.join(","), ...lines].join(NL) + NL;
  }

  /* Writes the rolled-up sheets to disk on a timer so they are simply there,
     always current, with nothing to click. The per-event CSV already appends as
     each event lands; this is the summary view that has to be recomputed.
     Written to a temp file and renamed, so a reader never catches a half-written
     file, and a failure (Excel holding the file open, most likely) is ignored
     rather than allowed to disturb the stream. */
  startAutoExport(everyMs = 60000) {
    const write = () => {
      const stamp = this.day;
      const jobs = [
        ["people.csv", this.peopleCsv()],
        ["people-" + stamp + ".csv", this.peopleCsv()],
        ["summary.json", JSON.stringify(this.summary(100), null, 2)],
        ["gifts.csv", this.giftsCsv()]
      ];
      for (const [name, body] of jobs) {
        const full = path.join(this.dir, name);
        const tmp = full + ".tmp";
        try {
          fs.writeFileSync(tmp, body, "utf8");
          fs.renameSync(tmp, full);
        } catch {
          try { fs.unlinkSync(tmp); } catch {}
          // most likely the file is open in Excel — try again next minute
        }
      }
      this.lastExport = new Date().toISOString();
    };
    write();
    this.exportTimer = setInterval(write, everyMs);
    this.exportTimer.unref?.();
  }

  giftsCsv() {
    const cols = ["giftName", "coinsPerGift", "timesSent", "totalCoins"];
    const rows = [...this.totals.giftTallies.values()].sort((a, b) => b.coins - a.coins);
    const lines = rows.map((g) => [csvCell(g.name), csvCell(g.coinsPerGift),
                                   csvCell(g.count), csvCell(g.coins)].join(","));
    return BOM + [cols.join(","), ...lines].join(NL) + NL;
  }

  listFiles() {
    try {
      return fs.readdirSync(this.dir)
        .filter((f) => f.endsWith(".csv") || f.endsWith(".jsonl"))
        .map((f) => {
          const s = fs.statSync(path.join(this.dir, f));
          return { name: f, bytes: s.size, modified: s.mtime.toISOString() };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
    } catch { return []; }
  }
}
