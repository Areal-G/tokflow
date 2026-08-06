# Adding another game

The LIVE engine is deliberately independent from Shiro vs Doro. Start it once and any number of local browser games can listen to the same events.

## Browser setup

Load the reusable client before the game adapter:

```html
<script src="http://127.0.0.1:24880/live-game-client.js"></script>
<script src="game.js"></script>
<script src="live-adapter.js"></script>
```

In `live-adapter.js`, translate the stable event contract into that game's actions:

```js
const client = new window.TokFlow.LiveGameClient();

client.addEventListener("live-event", ({ detail: event }) => {
  if (event.type !== "gift" || !event.gift.streakFinished) return;

  // Example only: each game owns its own Gift-to-action mapping.
  const action = giftActions[event.gift.name];
  if (action) action(event);
});

client.connect();
```

The helper automatically reconnects to the local engine if the game opens before the engine or the engine restarts.

## Stable event contract: version 1

Every event includes:

```js
{
  schemaVersion: 1,
  id: "unique event id",
  type: "gift | comment | like | follow | share | social",
  occurredAt: "ISO timestamp",
  user: {
    id: "TikTok user id",
    username: "public username",
    displayName: "viewer name",
    avatarUrl: "https://..."
  }
}
```

A Gift also includes:

```js
gift: {
  id: "TikTok gift id",
  name: "Rose",
  coinsPerGift: 1,
  repeatCount: 7,
  totalCoins: 7,
  streakable: true,
  streakFinished: true,
  imageUrl: "https://..."
}
```

Only award points when `streakFinished` is true. The engine already withholds unfinished streak events from normal game dispatch and exposes them separately as `streak` previews.

## Design rules for future games

- Keep Gift-to-action rules inside the game, not inside the TikTok provider.
- Use `event.id` for idempotency if a game stores events permanently.
- Calculate paid actions from `totalCoins`, while showing `coinsPerGift × repeatCount` for clarity.
- Always retain a simulator and a manual pause control.
- Never require a TikTok password or copy browser session cookies into this engine.
- Treat unknown Gifts as ignored/unmapped until the game owner assigns them.

## Changing the provider later

If a future official TikTok Gift API becomes available, replace only `src/tiktok-provider.js`. The dashboard, local WebSocket, normalized event contract, game clients and game mappings can remain unchanged.
