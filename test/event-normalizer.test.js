import test from "node:test";
import assert from "node:assert/strict";
import { normalizeComment, normalizeGift, normalizeMember, normalizeRoomStats, toLegacyGameEvent } from "../src/event-normalizer.js";

test("normalizes a finished gift streak without multiplying twice", () => {
  const normalized = normalizeGift({
    msgId: "123",
    giftId: 5655,
    repeatCount: 7,
    repeatEnd: true,
    giftDetails: { giftName: "Rose", giftType: 1, diamondCount: 1 },
    user: { userId: "42", uniqueId: "hana", nickname: "Hana", profilePictureUrl: "https://example.test/hana.jpg" }
  }, 1000);
  assert.equal(normalized.id, "123");
  assert.equal(normalized.gift.totalCoins, 7);
  assert.equal(normalized.gift.streakFinished, true);
  assert.deepEqual(toLegacyGameEvent(normalized), {
    type: "gift", eventId: "123", giftId: "5655", giftName: "Rose", coins: 1,
    repeatCount: 7, sender: "Hana", username: "hana", avatarUrl: "https://example.test/hana.jpg"
  });
});

test("marks an unfinished streak as preview-only", () => {
  const normalized = normalizeGift({ giftId: 1, repeatCount: 2, repeatEnd: false, giftDetails: { giftName: "Rose", giftType: 1, diamondCount: 1 } }, 1000);
  assert.equal(normalized.gift.streakable, true);
  assert.equal(normalized.gift.streakFinished, false);
});

test("normalizes a viewer joining with their profile picture", () => {
  const normalized = normalizeMember({
    msgId: "join-1",
    memberCount: 42,
    user: { userId: "77", uniqueId: "betty", nickname: "Betty", avatarThumb: { urlList: ["https://example.test/betty.jpg"] } }
  }, 1000);
  assert.equal(normalized.type, "join");
  assert.equal(normalized.memberCount, 42);
  assert.equal(normalized.user.avatarUrl, "https://example.test/betty.jpg");
  assert.deepEqual(toLegacyGameEvent(normalized), {
    type: "join", eventId: "join-1", sender: "Betty", username: "betty", avatarUrl: "https://example.test/betty.jpg"
  });
});

test("reads comment text from TikTok v3 content and older comment fields", () => {
  const user = { userId: "22", uniqueId: "smoke", nickname: "Smoke" };
  assert.equal(normalizeComment({ msgId: "c1", user, content: "Doro!" }, 1000).comment, "Doro!");
  assert.equal(normalizeComment({ msgId: "c2", user, comment: "Shiro!" }, 1000).comment, "Shiro!");
});

test("reads current viewer count from TikTok v3 and older room statistics", () => {
  assert.deepEqual(normalizeRoomStats({ total: "84", totalUser: "1302" }), { viewerCount: 84, totalViewers: 1302 });
  assert.deepEqual(normalizeRoomStats({ viewerCount: 42, totalUser: 900 }), { viewerCount: 42, totalViewers: 900 });
});
