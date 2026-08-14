# Connecting a game to TokFlow

TokFlow is the platform; a game is a separate project that plugs into it. Any
number of games can connect at once, and TokFlow needs no changes to accept a
new one.

## The short version

Serve your game from TokFlow (`public/games/<your-game>/`) or anywhere on the
same machine, then:

```html
<script src="/tokflow-game.js"></script>
<script>
  const tf = TokFlow.connect({ id: "my-game", name: "My Game", version: "1.0" });

  tf.on("comment", (e) => {
    const choice = readVote(e.comment);
    if (choice) { score(choice); tf.counted(e, { reason: "vote", target: choice, points: 1 }); }
    else        { tf.ignored(e, "not a vote"); }
  });

  tf.on("gift", (e) => {
    const team = teamForGift(e.gift.name);
    if (team) { score(team, e.gift.totalCoins * 10);
                tf.counted(e, { reason: "gift", target: team, points: e.gift.totalCoins * 10 }); }
    else      { tf.ignored(e, "gift not mapped"); }
  });
</script>
```

That is the whole integration. It reconnects on its own, and a throw inside one
of your handlers cannot take down the socket.

## Events you can listen for

`comment` · `gift` · `like` · `follow` · `share` · `join` — plus `event` for all
of them, `status` for the engine's connection state, and `connected` /
`disconnected` / `collecting`.

Each event arrives already flattened:

```js
{
  id, type, at,
  user:    { id, username, name, avatar },
  comment: "…",                 // comments
  likes:   0,                   // likes
  gift:    { id, name, coins, repeat, totalCoins, image },   // gifts
  raw:     { …the untouched event… }
}
```

`gift.image` is the real TikTok artwork URL, and `user.avatar` the real profile
picture, so a game can show what a viewer actually recognises.

## Why `counted()` and `ignored()` matter

TokFlow records the raw stream by itself — it does not need your help for that.
What it cannot know is **what any of it meant in your game**. A comment of "D"
is a vote in one game, noise in another, and a team name in a third.

- `tf.counted(event, { reason, target, points })` — this event did something
- `tf.ignored(event, "why not")` — it reached the game and did not count

Each game gets its own file, `game-<your-id>-<date>.csv`, with the columns
`relevant`, `reason`, `target` and `points` alongside the who and the what. So
you can ask questions that only make sense for your game:

- how many comments were real votes versus chatter — do people understand it?
- which choice attracts gifts rather than just comments?
- what do people type when they get it wrong? (that is your instructions problem)
- how many hit the per-viewer vote cap? (that is a reason to raise it)

The raw log keeps everything regardless, so nothing is lost by not annotating —
you just lose the ability to tell signal from noise later.

## Turning collection off

Open **/analytics.html** and untick the box, or call
`/analytics/toggle?on=0`. While off, nothing is written — no raw events, no game
files, no rollups. Games keep running normally. Use it while testing so practice
sessions do not pollute real numbers.

The setting persists across restarts.

## What lands on disk

In `data/analytics/`:

| File | What it is |
|---|---|
| `events-<date>.jsonl` | every event, complete. What a real analytics tool should read |
| `events-<date>.csv` | the same, flattened for Excel |
| `game-<gameId>-<date>.csv` | per game: what counted, what did not, and why |
| `people.csv` | one row per viewer — gifts, coins, comments, likes, shares, follows |
| `gifts.csv` | each gift: how many, worth how much |
| `summary.json` | session totals, top gifters, per-game breakdown |

The rollups rewrite themselves every minute. The CSVs carry a byte-order mark so
Excel renders Amharic names correctly.

## Protocol, if you would rather not use the client

Plain JSON over `ws://127.0.0.1:24880/events`:

```jsonc
// on connect
{ "type": "game-register", "game": { "id": "my-game", "name": "My Game", "version": "1.0" } }

// after deciding what an event meant
{ "type": "game-annotate", "annotation": {
    "gameId": "my-game", "eventId": "…", "type": "comment",
    "username": "…", "relevant": true,
    "reason": "vote", "target": "Tigray", "points": 1 } }

// turn recording on or off
{ "type": "set-analytics", "enabled": false }
```

Incoming, you will receive `live-event`, `status`, `analytics-state` and
`game-registered`.
