# MCP server

Turnpoint is also an **MCP server**. MCP (Model Context Protocol) is a standard way for AI apps like Claude to call tools on a website. Once it's connected, you can ask Claude something like "how did my last 10 jungle games go?" or "what decided my last loss?" and Claude asks Turnpoint for the answer instead of guessing.

Address: `https://league-web-app.vercel.app/api/mcp`

## The tools

| Tool | Takes | Gives back |
|---|---|---|
| `look_up_player` | region, Riot ID | Rank (solo and flex), totals over the last 10 games, top 3 champions, profile link |
| `recent_games` | region, Riot ID, how many games (1 to 20, default 10) | Each game's champion, role, result, K/D/A, CS per minute, kill participation, match ID and link, plus totals |
| `analyze_game` | region, Riot ID, match ID | The analyzer's facts for that game: lane gaps at 10 and 15, turning points, win chance swings, deaths, objectives, the 0 to 100 game score, and ganks and pathing for junglers |

`analyze_game` returns the same facts the AI match recap is written from ([match-recap.md](match-recap.md)), loaded by `src/lib/match-facts.ts`, which both features share. So Claude reads Turnpoint's tested numbers, not the raw match.

## How it works

1. **`src/app/api/mcp/route.ts`** is a Next.js route handler. The `mcp-handler` package (by Vercel, built on the official MCP SDK) handles the protocol: Claude sends a JSON-RPC request like `tools/list` or `tools/call` as an HTTP POST, and gets the answer back in the response. Nothing is kept between requests, so it runs fine as a Vercel function. The route lists the three tools, with a `zod` schema for each one's inputs. The SDK turns those schemas into the JSON descriptions Claude reads, and rejects bad input before our code runs.
2. **`src/lib/mcp/tools.ts`** does the work with the same loaders as the website: `loadProfile`, `loadMatches`, `loadMatch` and `loadMatchFacts`. Anything already saved in Postgres costs no Riot calls.
3. **`src/lib/mcp/answers.ts`** shapes the results into small JSON answers with clear field names (`winRatePercent`, `minutes`). It's pure, so it has unit tests.
4. When Riot refuses (busy, key expired), the tool returns a plain message marked as an error, so Claude can tell the person what happened instead of making something up. Other errors go to Sentry.
5. **The smoke test covers the route.** `e2e/mcp.spec.ts` runs on every Vercel preview with the rest of `e2e/`. It sends `initialize` and then `tools/list` to the preview's `/api/mcp` and fails unless exactly these three tools come back (a new tool goes into its `TOOLS` list too), so an `mcp-handler` or MCP SDK update that breaks the route at runtime shows up on its PR. Each request gets 15 seconds, so a route that hangs fails quickly instead of waiting out Vercel's 300 s limit (JAS-44). It doesn't call the tools, since that would spend Riot calls.

## Guarding the Riot rate limit

The MCP server shares the website's Riot key and its 100 requests per 2 minutes.

- Saved data first: finished games are cached forever and a profile for a day, the same as on the website.
- At most 10 games that aren't saved yet are fetched per tool call (`NEW_MATCHES_PER_CALL`). The answer says how many weren't loaded (`notLoadedYet`), and asking again loads the rest.
- At most 20 games per `recent_games` call (`MAX_RECENT_GAMES`).
- `analyze_game` checks the match ID belongs to that region before calling Riot, so a made-up ID costs nothing.
- Every call still goes through the rate-limited client in `src/lib/riot/client.ts`.

## What it doesn't do (yet)

- **No sign-in.** Everything is read-only and public, the same as the website without signing in. Linking it to your Turnpoint account (to read your notes or Focus goals) would need OAuth, a bigger job.
- **No new data is stored**, beyond what opening the same pages on the website would save. Questions and answers go to whichever AI app the person connected, under that app's privacy policy.
- **Riot policy:** it only uses the official Riot API, like the rest of the site. Mention it in the production key application.

## Trying it

**In Claude:** add a custom connector with the address above (look under Connectors in Claude's settings). Then ask "Look up Faker#KR1 on kr with Turnpoint."

**In Claude Code:**

```bash
claude mcp add --transport http turnpoint https://league-web-app.vercel.app/api/mcp
```

**Locally:** run `npm run dev`, then open the official MCP Inspector and connect it to `http://localhost:3000/api/mcp` (transport: Streamable HTTP):

```bash
npx @modelcontextprotocol/inspector
```

Or check it by hand. This should list the three tools:

```bash
curl -s http://localhost:3000/api/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
