import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function waitForOutput(child, needle, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${needle}`)), timeoutMs);
    child.stdout.on("data", (data) => {
      if (String(data).includes(needle)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}`));
    });
  });
}

test("dashboard and local event bridge work end to end", async (context) => {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, LIVE_ENGINE_PORT: "24881" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  context.after(() => child.kill());
  await waitForOutput(child, "http://127.0.0.1:24881");

  const page = await fetch("http://127.0.0.1:24881/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /tokflow/i);

  const socket = new WebSocket("ws://127.0.0.1:24881/events");
  context.after(() => socket.close());
  const received = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket did not open")), 5000);
    socket.on("open", () => { clearTimeout(timer); resolve(); });
  });
  socket.on("message", (data) => received.push(JSON.parse(String(data))));

  const testEvent = {
    schemaVersion: 1,
    id: "integration-gift-1",
    type: "gift",
    occurredAt: new Date().toISOString(),
    user: { id: "7", username: "hana", displayName: "Hana", avatarUrl: "" },
    gift: { id: "5655", name: "Rose", coinsPerGift: 1, repeatCount: 3, totalCoins: 3, streakable: true, streakFinished: true, imageUrl: "" }
  };
  socket.send(JSON.stringify({ type: "simulate", event: testEvent }));

  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test Gift was not broadcast")), 5000);
    const interval = setInterval(() => {
      const found = received.find((entry) => entry.type === "live-event" && entry.event?.id === "integration-gift-1");
      if (found) {
        clearTimeout(timer);
        clearInterval(interval);
        resolve(found);
      }
    }, 20);
  });
  assert.equal(message.gameEvent.giftName, "Rose");
  assert.equal(message.gameEvent.coins, 1);
  assert.equal(message.gameEvent.repeatCount, 3);

  for (const event of [
    { id: "integration-comment-1", type: "comment", comment: "Shiro is delicious" },
    { id: "integration-comment-2", type: "comment", comment: "Hello everyone" },
    { id: "integration-like-1", type: "like", count: 25 }
  ]) {
    socket.send(JSON.stringify({ type: "simulate", event: {
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      user: testEvent.user,
      ...event
    } }));
  }

  const totals = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Viewer totals were not updated")), 5000);
    const interval = setInterval(() => {
      const found = received.findLast((entry) => entry.type === "viewer-stats")?.viewers?.find((viewer) => viewer.user.username === "hana");
      if (found?.comments === 2 && found?.gifts === 3 && found?.likes === 25) {
        clearTimeout(timer);
        clearInterval(interval);
        resolve(found);
      }
    }, 20);
  });
  assert.equal(totals.giftCoins, 3);
  assert.ok(received.some((entry) => entry.type === "log" && entry.event?.comment === "Hello everyone" && entry.message.includes("Hello everyone")));
});
