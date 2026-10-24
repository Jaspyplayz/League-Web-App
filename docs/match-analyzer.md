# Match analyzer: research and MVP plan

The match analyzer is the standout feature (see [SCOPE.md](./SCOPE.md)). This doc covers which Riot API data it needs, which insights are worth showing, how to stay inside the rate limits, and what to build first.

Facts about the API were checked against the [Riot developer portal](https://developer.riotgames.com/docs/portal) in October 2026. Anything marked *(verify)* is from memory of the API and should be confirmed in the portal's API reference before coding against it.

## TL;DR

- **Data:** four endpoints get a player and their games; one more, the **match timeline**, is what makes the analyzer possible. It has a snapshot of every player's gold, CS, XP and position for every minute, plus a timestamped list of every kill, objective and item purchase.
- **MVP insights:** a lane-opponent comparison chart, "@10 / @15" snapshots, 1 to 3 auto-detected turning points with a reason, and an insights tab with four cross-game trends. Everything is measured **relative to the lane opponent in the same game**, which avoids needing rank-wide averages we don't have.
- **Rate limits are the main engineering problem.** A brand-new player with all 20 timelines is about 44 API calls, and a personal key allows 100 per 2 minutes. The answer is: matches and timelines never change, so store them forever; only fetch a timeline when someone opens that match; and run every Riot call through one rate-limited queue.
- **Key:** apply for a **personal API key** now. Same limits as the dev key but it doesn't expire every 24 hours, so a deployed prototype keeps working. Apply for a production key once the site is public.

## Glossary

| Term | Meaning |
|---|---|
| **PUUID** | A player's permanent, globally unique ID. Every modern endpoint uses it. Riot IDs (`Name#TAG`) can change; the PUUID never does. |
| **Riot ID** | The `GameName#TAG` players type in. Replaced old summoner names. |
| **CS** | "Creep score": minions and jungle monsters killed. The main source of gold. |
| **GD@10 / CSD@10 / XPD@10** | Gold / CS / XP difference vs your lane opponent at 10 minutes. Standard stats in pro analysis. |
| **Lane opponent** | The enemy player in the same position (top vs top, jungle vs jungle, and so on). |
| **Platform routing** | A server like `na1`, `euw1`, `kr`. Used by player-specific APIs (summoner, league). |
| **Regional routing** | A cluster like `americas`, `europe`, `asia`, `sea`. Used by account and match APIs. Each platform maps to one region (e.g. `na1` → `americas`). |
| **Data Dragon** | Riot's free static files: champion, item and rune names and images. No API key, no rate limit. |

## Endpoints

| Step | Endpoint | Routing | What we get | Calls |
|---|---|---|---|---|
| 1 | `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | regional (`americas`, `europe`, `asia`; not `sea`) | PUUID, exact casing of the Riot ID | 1 |
| 2 | `GET /lol/summoner/v4/summoners/by-puuid/{puuid}` | platform | profile icon, level | 1 |
| 3 | `GET /lol/league/v4/entries/by-puuid/{puuid}` *(verify)* | platform | ranked tier, division, LP, wins, losses per queue | 1 |
| 4 | `GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue=&start=&count=` | regional | list of match IDs, newest first (max 100 per call) | 1 |
| 5 | `GET /lol/match/v5/matches/{matchId}` | regional | the full post-game summary for all 10 players | 1 per match |
| 6 | `GET /lol/match/v5/matches/{matchId}/timeline` | regional | minute-by-minute frames and events | 1 per match |

Filter step 4 by queue so the MVP only sees supported modes: `420` ranked solo/duo, `440` ranked flex, `400` normal draft. Pass `queue` once per queue, or fetch unfiltered and drop the rest.

### What's inside a match (step 5)

`info.participants[]` has one entry per player with everything for the scoreboard: champion, `teamPosition` (`TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`), kills/deaths/assists, CS, gold, damage, vision score, items, runes, and `win`.

It also has a `challenges` object with dozens of precomputed stats. Useful ones include `laningPhaseGoldExpAdvantage`, `maxCsAdvantageOnLaneOpponent`, `killParticipation`, `soloKills`, `turretPlatesTaken` and `visionScorePerMinute` *(verify names)*. These are **free**: no timeline call needed. The catch is that they're undocumented, so treat them as optional and fall back gracefully when a field is missing.

### What's inside a timeline (step 6)

This is the analyzer's real input. `info.frames[]` has one frame per minute (`frameInterval` is 60,000 ms). Each frame has:

- `participantFrames["1".."10"]`: per player `totalGold`, `xp`, `level`, `minionsKilled`, `jungleMinionsKilled`, `position {x, y}`, and `damageStats` (e.g. `totalDamageDoneToChampions`).
- `events[]`: everything that happened since the last frame, with exact millisecond timestamps. The types the analyzer cares about:

| Event type | Use |
|---|---|
| `CHAMPION_KILL` | who killed whom, assists, where, bounty. The basis for "ganked" vs "solo killed" vs "teamfight". `victimDamageReceived` is the death recap, added up on Insights ([death-recaps.md](death-recaps.md)). |
| `ELITE_MONSTER_KILL` | dragons, Baron, Herald, void grubs (with team and timestamp) |
| `BUILDING_KILL`, `TURRET_PLATE_DESTROYED` | towers, inhibitors, plates |
| `ITEM_PURCHASED` | item timings, e.g. "first completed item at 14:30" |
| `WARD_PLACED`, `WARD_KILL` | vision (stretch goal) |
| `LEVEL_UP`, `SKILL_LEVEL_UP` | level spikes (stretch goal) |

Participant IDs 1 to 10 in the timeline match `participantId` in the match payload, which links them to PUUIDs. IDs 1 to 5 are blue side, 6 to 10 red side.

**Limitation:** frames are one minute apart, so gold, CS and XP curves have one-minute resolution. Events are exact. That's fine for the analyzer, but don't promise "at 9:42 you were 312 gold behind".

## Insights worth showing

The test for every insight: does it tell the player something they couldn't see on the post-game scoreboard, and could they act on it?

### Per match (match detail page)

1. **Lane matchup chart.** Gold, CS and XP difference vs your lane opponent, per minute, as a line chart with a zero line (above = ahead). Toggle between the three. This is the screenshot for the README.
2. **@10 and @15 snapshot.** Three numbers per checkpoint: GD, CSD, XPD. Colour-coded. Shown on each match row in the profile too, so a player can scan their last 20 laning phases at a glance.
3. **Turning points.** The 1 to 3 biggest swings, each with a plain-English reason built from the events in that window, e.g. *"8:00 to 12:00: you fell from +300 to −900 gold. You died twice, both times to the enemy jungler (ganks)."* See the algorithm below.
4. **Death breakdown.** Every death with a time and a label: *solo killed* (only your lane opponent involved), *ganked* (enemy jungler or another laner involved, in your lane), *teamfight* (3+ enemies involved), *caught* (died alone away from your lane). Early deaths (before 14:00) are highlighted, since they cost the most.
5. **Team context strip.** Team gold difference over time with objective icons on the timeline (dragons, Herald, Baron, towers). Answers "did I lose lane but the team won anyway?".

### Across games (insights tab)

Computed from the last 20 analyzed games.

1. **Laning trend.** Average GD@10 and CSD@10 per game, as a small chart. "You're ahead at 10 in 12 of 20 games."
2. **Conversion rate.** Win rate when ahead at 15 vs when behind at 15. "You win 70% when ahead but only 20% when behind" tells a player whether their problem is laning or closing out games.
3. **Early death profile.** Deaths before 14:00 per game, split by label. "48% of your early deaths are jungle ganks" is a concrete, fixable weakness.
4. **CS per minute by phase.** 0 to 10, 10 to 20, 20+. Most players' CS drops sharply after laning; showing it is a classic coaching point.
5. **What keeps killing you.** Each death's recap added up: the enemy abilities in the most of your deaths and the damage type, so you know what to respect and build against ([death-recaps.md](death-recaps.md)).

Then a **"recurring weaknesses"** box: 2 or 3 rule-based callouts, generated when a stat crosses a threshold in a majority of games (e.g. "behind in CS at 10 in 14 of 20 games"). Rules live in code with clear thresholds, so they're testable.

### Why compare to the lane opponent

The API gives no "average Gold player" benchmarks. Building our own would mean crawling thousands of games. Comparing against the lane opponent in the same game sidesteps that: they're at roughly the same rank, on the same patch, in the same game. It's also how pro analysts talk about laning.

### Later, not MVP

- Position heatmaps from `position {x, y}` (where you die, where you spend time).
- Item timing vs your own average ("your first item came 2 minutes later than usual").
- Vision timeline from ward events.
- Champion-specific insights (option B from the scope doc).
- Rank-wide benchmarks once the database has enough games.

## Algorithms

All analysis lives in pure TypeScript functions (input: match JSON + timeline JSON + PUUID; output: insight objects). No API calls, no database, so they're easy to unit-test with Vitest against saved real games.

### Which games are analyzed

`isAnalyzable` in `src/lib/analyzer/index.ts` decides, and `whyNotAnalyzed` gives the sentence players see when the answer is no. A game is analyzed when all three hold, checked in this order:

1. It was on Summoner's Rift (`info.mapId` 11). That covers ranked, normals, Swiftplay and bot games. ARAM is on the Howling Abyss (12) and Arena on the Rings of Wrath (30), where there are no lanes to compare and the replay's walls are wrong. Message: "Only Summoner's Rift games are analyzed."
2. It had 10 players, since everything pairs them into five lanes. Arena has 16 or 18, and a custom game on the Rift can have fewer. Message: "Only 5v5 games are analyzed."
3. It lasted 15 minutes or more (remakes and early surrenders are shorter). Message: "This game ended before 15 minutes, which is too short to analyze."

A game that isn't analyzed shows its scoreboard and the message, and its row on the profile has no "Analysis" link. The share image, recaps, Ask and the MCP server's `analyze_game` all check `isAnalyzable` first. Saved games keep Riot's whole match in `matches.raw`, so games saved before this check have `mapId` too.

### Finding the lane opponent

1. Find the player's `teamPosition` in the match payload.
2. The opponent is the enemy with the same `teamPosition`.
3. Edge cases: `teamPosition` can be empty in remakes or unusual games. Games under 15 minutes aren't analyzed at all (see [Which games are analyzed](#which-games-are-analyzed)). If positions look swapped (e.g. a lane swap), fall back to `individualPosition`, then to "closest average position over minutes 2 to 10".
4. Supports and junglers get the same comparison, but the UI should lean on kill participation and vision for supports, where gold and CS matter less.

### Turning points

1. Build the gold-difference series vs the lane opponent, one value per minute.
2. Slide a window of up to 4 minutes over it and find the swings larger than a threshold (start with 750 gold, tune with real games). Merge overlapping windows; keep the biggest 3.
3. For each window, collect the timeline events between its start and end that involve the player or opponent: deaths, kills, plates, objectives near the lane.
4. Turn them into a sentence with templates: "You died 2× (both ganks)", "Enemy took 3 plates", "You killed your opponent solo". Pick the most important 1 or 2 causes by gold value.

Store a `version` number with each computed insight (the `match_insights.version` column in the scope doc). When the algorithm changes, bump the version and recompute from the stored data without any new API calls.

## Rate limits and caching

### The numbers

| Key | Limits | Expires | Good for |
|---|---|---|---|
| Development | 20 req/s, 100 req/2 min, per region | every 24 h | local tinkering |
| **Personal** | 20 req/s, 100 req/2 min, per region | no | the MVP and a deployed prototype |
| Production | 500 req/10 s, 30,000 req/10 min, per region | no | a public product; needs a working prototype to apply |

Limits are per key **and per region**, so NA and EUW traffic don't share a bucket. There are also per-endpoint "method limits"; the response headers say what they are.

### What a page load costs

| Action | Calls (cold) | Calls (cached) |
|---|---|---|
| Search a new player + profile with 20 matches | 1 + 1 + 1 + 1 + 20 = **24** | 0 to 3 |
| Open one match detail (adds the timeline) | **1** | 0 |
| Insights tab for 20 games (needs all timelines) | up to **20** | 0 |

On a personal key, the worst case (new player, insights tab straight away) is about 44 calls, so two brand-new players every two minutes. That's fine for a portfolio demo, but only with the strategy below.

### Strategy

1. **Matches and timelines never change after the game ends: store them permanently in Postgres** and never fetch the same one twice. This is most of the win.
2. **Fetch timelines lazily.** Profile pages only need match summaries. Fetch a timeline when someone opens that match, and fill the rest in the background for the insights tab, showing "Analyzing 12 of 20 games…" while it works.
3. **Short TTLs for data that does change:** account and summoner info (a day), rank (10 to 30 minutes), match ID list (refreshed when the user clicks "Update", with a 2 minute cooldown per player, like op.gg).
4. **One request queue for all Riot calls**, per region, that:
   - reads `X-App-Rate-Limit`, `X-App-Rate-Limit-Count`, `X-Method-Rate-Limit` and `X-Method-Rate-Limit-Count` from responses instead of hard-coding limits;
   - on a `429`, pauses that region for the seconds in `Retry-After` (Riot can disable keys that ignore this);
   - retries `5xx` errors a couple of times with backoff.
5. **Serverless caveat:** on Vercel each request can run in a separate instance, so an in-memory counter doesn't see the others' calls. Fine for MVP traffic; when it isn't, move the counters to Upstash Redis (already planned in the scope doc). That's a good interview story in itself.
6. **Don't store raw timelines.** A full timeline is large (very roughly several hundred KB of JSON *(estimate; measure on real games)*), and Supabase's free tier is 500 MB. Store a trimmed version instead: per-minute gold, XP, CS, level, position and damage for the 10 players, plus only the event types listed above. Keep the raw match payload (much smaller) as the scope doc plans.

### Data flow

```
search "Name#TAG" (region)
  → account-v1 → PUUID ─┐
                         ├─ summoner-v4, league-v4  (short TTL cache)
                         └─ match ids (refresh on "Update")
                              → for each id not in DB: match-v5 → store
open a match
  → timeline in DB? no → match-v5 timeline → trim → store
  → analyzer (pure functions) → match_insights (with version) → render
```

## Policy notes

- The API key stays on the server (route handlers or server components), never in browser code.
- Riot's developer policies require a "not endorsed by Riot Games" notice on the site, and forbid things like hidden MMR estimates. Post-game analysis of a player's own match history is the standard, allowed use case. Read the policies once before applying for the production key.
- Use Data Dragon for champion and item names and images; it doesn't count toward rate limits.

## Proposed build order for the analyzer

1. Save 3 to 5 real match + timeline JSON files as test fixtures (one per role, plus a remake). Four real games now live in [src/lib/analyzer/fixtures/](../src/lib/analyzer/fixtures/README.md), checked by `golden.test.ts`; the three long enough to analyze are all seen from a jungler, so the other roles still need a real game each.
2. Write the pure analyzer functions with Vitest tests: lane opponent, diff series, @10/@15, death labels, turning points.
3. Timeline fetching, trimming and storage.
4. Match detail UI: the chart, snapshot and turning points.
5. Background timeline fill and the insights tab.
