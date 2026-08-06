import test from "node:test";
import assert from "node:assert/strict";
import { TikTokProvider, cleanUsername, findBrowserExecutable } from "../src/tiktok-provider.js";

test("accepts usernames, @names and LIVE URLs", () => {
  assert.equal(cleanUsername("@hana_12"), "hana_12");
  assert.equal(cleanUsername("https://www.tiktok.com/@hana.12/live"), "hana.12");
});

test("rejects unsafe username input", () => {
  assert.throws(() => cleanUsername("not a username!"), /valid TikTok username/);
});

test("finds a locally installed supported browser", () => {
  assert.match(findBrowserExecutable(), /(chrome|msedge)\.exe$/i);
});

test("drops byte-identical captured frames so one gift never counts twice", async () => {
  const provider = new TikTokProvider();
  provider.stoppedByUser = false;
  const logs = [];
  provider.on("log", (entry) => logs.push(entry.message));

  const payload = Buffer.from("same webcast frame").toString("base64");
  await provider.acceptCapturedFrame(payload);
  await provider.acceptCapturedFrame(payload);

  assert.equal(logs.filter((message) => /duplicate LIVE frame/i.test(message)).length, 1);
});
