import test from "node:test";
import assert from "node:assert/strict";
import { ViewerStats } from "../src/viewer-stats.js";

const user = { id: "7", username: "hana", displayName: "Hana", avatarUrl: "https://example.test/hana.jpg" };

test("totals comments, repeated gifts and batched likes per viewer", () => {
  const stats = new ViewerStats();
  stats.record({ type: "comment", occurredAt: "2026-01-01T00:00:00Z", user, comment: "hello" });
  stats.record({ type: "comment", occurredAt: "2026-01-01T00:00:01Z", user, comment: "again" });
  stats.record({ type: "gift", occurredAt: "2026-01-01T00:00:02Z", user, gift: { repeatCount: 4, totalCoins: 20 } });
  stats.record({ type: "like", occurredAt: "2026-01-01T00:00:03Z", user, count: 37 });
  assert.deepEqual(stats.snapshot()[0], {
    key: "username:hana",
    user,
    comments: 2,
    gifts: 4,
    giftCoins: 20,
    likes: 37,
    updatedAt: "2026-01-01T00:00:03Z"
  });
});

test("ignores joins for interaction totals and can reset", () => {
  const stats = new ViewerStats();
  assert.equal(stats.record({ type: "join", user }), null);
  assert.equal(stats.snapshot().length, 0);
  stats.record({ type: "like", user, count: 1 });
  stats.clear();
  assert.equal(stats.snapshot().length, 0);
});
