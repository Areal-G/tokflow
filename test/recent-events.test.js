import test from "node:test";
import assert from "node:assert/strict";
import { RecentEvents } from "../src/recent-events.js";

test("rejects duplicates and accepts an id after expiry", () => {
  const recent = new RecentEvents({ ttlMs: 100 });
  assert.equal(recent.hasOrAdd("a", 0), false);
  assert.equal(recent.hasOrAdd("a", 50), true);
  assert.equal(recent.hasOrAdd("a", 101), false);
});
