const text = (value, fallback = "") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function avatarFrom(user = {}) {
  const candidate = user.profilePictureUrl
    || user.avatarThumb?.urlList?.[0]
    || user.avatarMedium?.urlList?.[0]
    || user.avatarLarger?.urlList?.[0]
    || user.avatar?.urlList?.[0]
    || "";
  return text(candidate);
}

function userFrom(raw = {}) {
  const source = raw.user || raw.fromUser || {};
  return {
    id: text(source.userId || source.id || source.secUid || source.uniqueId, "unknown"),
    username: text(source.uniqueId || source.username, "unknown"),
    displayName: text(source.nickname || source.displayName || source.uniqueId, "TikTok viewer"),
    avatarUrl: avatarFrom(source)
  };
}

function messageId(raw = {}) {
  return text(raw.msgId || raw.messageId || raw.common?.msgId || raw.common?.messageId);
}

export function normalizeGift(raw = {}, now = Date.now()) {
  const details = raw.giftDetails || raw.extendedGiftInfo || raw.gift || {};
  const repeatCount = Math.max(1, Math.trunc(number(raw.repeatCount || raw.repeat_count, 1)));
  const giftType = Math.trunc(number(details.giftType ?? raw.giftType, 0));
  const repeatEnd = Boolean(raw.repeatEnd ?? raw.repeat_end ?? giftType !== 1);
  const coinsPerGift = Math.max(0, Math.trunc(number(
    details.diamondCount ?? details.diamond_count ?? details.cost ?? raw.diamondCount ?? raw.coins,
    0
  )));
  const giftId = text(raw.giftId || details.giftId || details.id, "unknown");
  const giftName = text(details.giftName || details.name || raw.giftName, `Gift ${giftId}`);
  const user = userFrom(raw);

  return {
    schemaVersion: 1,
    id: messageId(raw) || `gift:${user.id}:${giftId}:${now}:${repeatCount}`,
    type: "gift",
    occurredAt: new Date(now).toISOString(),
    user,
    gift: {
      id: giftId,
      name: giftName,
      coinsPerGift,
      repeatCount,
      totalCoins: coinsPerGift * repeatCount,
      streakable: giftType === 1,
      streakFinished: repeatEnd,
      imageUrl: text(details.giftPictureUrl || details.image?.urlList?.[0] || details.icon?.urlList?.[0])
    }
  };
}

export function normalizeLike(raw = {}, now = Date.now()) {
  const user = userFrom(raw);
  return {
    schemaVersion: 1,
    id: messageId(raw) || `like:${user.id}:${now}`,
    type: "like",
    occurredAt: new Date(now).toISOString(),
    user,
    count: Math.max(1, Math.trunc(number(raw.likeCount || raw.count, 1))),
    totalCount: Math.max(0, Math.trunc(number(raw.totalLikeCount, 0)))
  };
}

export function normalizeRoomStats(raw = {}) {
  return {
    viewerCount: Math.max(0, Math.trunc(number(raw.viewerCount ?? raw.total, 0))),
    totalViewers: Math.max(0, Math.trunc(number(raw.totalUser, 0)))
  };
}

export function normalizeComment(raw = {}, now = Date.now()) {
  const user = userFrom(raw);
  return {
    schemaVersion: 1,
    id: messageId(raw) || `comment:${user.id}:${now}`,
    type: "comment",
    occurredAt: new Date(now).toISOString(),
    user,
    comment: text(raw.comment || raw.content || raw.text)
  };
}

export function normalizeMember(raw = {}, now = Date.now()) {
  const user = userFrom(raw);
  return {
    schemaVersion: 1,
    id: messageId(raw) || `join:${user.id}:${now}`,
    type: "join",
    occurredAt: new Date(now).toISOString(),
    user,
    memberCount: Math.max(0, Math.trunc(number(raw.memberCount || raw.member_count, 0)))
  };
}

export function normalizeSocial(raw = {}, now = Date.now()) {
  const user = userFrom(raw);
  const action = text(raw.action || raw.label || raw.displayType, "social").toLowerCase();
  const type = action.includes("follow") ? "follow" : action.includes("share") ? "share" : "social";
  return {
    schemaVersion: 1,
    id: messageId(raw) || `${type}:${user.id}:${now}`,
    type,
    occurredAt: new Date(now).toISOString(),
    user,
    action
  };
}

export function toLegacyGameEvent(event) {
  if (event.type === "gift") {
    return {
      type: "gift",
      eventId: event.id,
      giftId: event.gift.id,
      giftName: event.gift.name,
      coins: event.gift.coinsPerGift,
      repeatCount: event.gift.repeatCount,
      sender: event.user.displayName,
      username: event.user.username,
      avatarUrl: event.user.avatarUrl
    };
  }
  if (event.type === "like") {
    return { type: "like", eventId: event.id, count: event.count, sender: event.user.displayName, username: event.user.username, avatarUrl: event.user.avatarUrl };
  }
  if (event.type === "comment") {
    return { type: "comment", eventId: event.id, comment: event.comment, sender: event.user.displayName, username: event.user.username, avatarUrl: event.user.avatarUrl };
  }
  if (event.type === "join" || event.type === "follow" || event.type === "share") {
    return { type: event.type, eventId: event.id, sender: event.user.displayName, username: event.user.username, avatarUrl: event.user.avatarUrl };
  }
  return null;
}
