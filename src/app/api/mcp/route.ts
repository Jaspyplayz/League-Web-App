import * as Sentry from "@sentry/nextjs";
import { createMcpHandler, getPublicOrigin } from "mcp-handler";
import { z } from "zod";
import { riotErrorMessage } from "@/lib/mcp/answers";
import { analyzeGame, lookUpPlayer, MAX_RECENT_GAMES, recentGames } from "@/lib/mcp/tools";
import { REGIONS, type Region } from "@/lib/regions";
import { RiotApiError } from "@/lib/riot/client";

// Turnpoint's MCP server. MCP (Model Context Protocol) is a standard way for
// AI apps like Claude to call tools on a website. Add this address
// (https://league-web-app.vercel.app/api/mcp) as a connector in Claude, and
// Claude can look players up and read the analyzer's results for a game.
// See docs/mcp.md.
//
// The mcp-handler package speaks the protocol; this file only lists the
// tools. Each tool's work lives in src/lib/mcp/tools.ts. Everything is
// read-only and public: the same data anyone can see on the website.

const regionSchema = z
  .enum(Object.keys(REGIONS) as [Region, ...Region[]])
  .describe("The player's server: na, euw, eune, kr, jp, br, lan, las, oce, tr or ru.");
const riotIdSchema = z.string().describe('The Riot ID with its tag, like "Faker#KR1".');

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "look_up_player",
      {
        title: "Look up a player",
        description:
          "A League of Legends player's rank, win rate over their last 10 games and most-played champions.",
        inputSchema: z.object({ region: regionSchema, riotId: riotIdSchema }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ region, riotId }, ctx) =>
        answer(() => lookUpPlayer(region, riotId, links(ctx.http?.req))),
    );

    server.registerTool(
      "recent_games",
      {
        title: "Recent games",
        description:
          "A player's latest games, newest first: champion, role, result, K/D/A, CS per minute and kill participation, plus totals. Each game has a matchId for analyze_game.",
        inputSchema: z.object({
          region: regionSchema,
          riotId: riotIdSchema,
          count: z
            .number()
            .int()
            .min(1)
            .max(MAX_RECENT_GAMES)
            .default(10)
            .describe(`How many games, up to ${MAX_RECENT_GAMES}.`),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ region, riotId, count }, ctx) =>
        answer(() => recentGames(region, riotId, count, links(ctx.http?.req))),
    );

    server.registerTool(
      "analyze_game",
      {
        title: "Analyze a game",
        description:
          "Turnpoint's analysis of one game from one player's side: gold, CS and XP gaps against the lane opponent at 10 and 15 minutes, turning points, the biggest win chance swings, deaths, objectives, the 0 to 100 game score and, for junglers, ganks and pathing. Only Summoner's Rift games of 15 minutes or more are analyzed, so ARAM, Arena and remakes have none.",
        inputSchema: z.object({
          region: regionSchema,
          riotId: riotIdSchema,
          matchId: z.string().describe('A match ID from recent_games, like "NA1_5012345678".'),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ region, riotId, matchId }, ctx) =>
        answer(() => analyzeGame(region, riotId, matchId, links(ctx.http?.req))),
    );
  },
  {
    serverInfo: { name: "Turnpoint", version: "1.0.0" },
    instructions:
      "Turnpoint analyzes League of Legends games. Start with look_up_player or recent_games, then analyze_game on a matchId. Answers include links to the game's page on Turnpoint; share them.",
  },
);

export { handler as GET, handler as POST };

// Links in answers point at whichever copy of the site was asked (the live
// site, a preview or localhost).
function links(req: Request | undefined) {
  return { origin: req ? getPublicOrigin(req) : "https://league-web-app.vercel.app" };
}

// Sends a tool's result to Claude as JSON text. Expected failures (a typo in
// a Riot ID, Riot being busy) become a message Claude can pass on, marked as
// an error so it doesn't treat it as data; anything else is a bug and goes
// to Sentry.
async function answer(run: () => Promise<object>) {
  try {
    const result = await run();
    if ("message" in result && typeof result.message === "string") return failed(result.message);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    if (error instanceof RiotApiError) return failed(riotErrorMessage(error.kind, error.retryAfter));
    Sentry.captureException(error);
    return failed("Something went wrong in Turnpoint. Try again in a moment.");
  }
}

function failed(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
