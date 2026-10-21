import "server-only";

import * as Sentry from "@sentry/nextjs";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { costMicros, gameLabel, HOLD_MICROS, type AskGame } from "@/lib/ask-rules";
import { riotErrorMessage } from "@/lib/mcp/answers";
import { analyzeGameFor, MAX_RECENT_GAMES, recentGamesFor } from "@/lib/mcp/tools";
import type { Region } from "@/lib/regions";
import { RiotApiError } from "@/lib/riot/client";
import type { Account } from "@/lib/riot/types";

// Answers a question about one player's games with Claude, for the Ask tab.
// Claude gets two tools, the same ones the MCP server offers
// (src/lib/mcp/tools.ts): a list of recent games and the analysis of one
// game. It decides which to call, reads the results and writes the answer.
// That back-and-forth is the "agent loop" below: each round, Claude either
// asks for tools (we run them and send the results back) or answers.
//
// Claude Sonnet is the middle Claude model: smart enough to pick which games
// to read and compare them, at half the price of Opus. A question reads a few
// games' analyses, so it costs about 5 to 20 cents (see src/lib/ask-rules.ts
// for the caps that keep that in check).
export const ASK_MODEL = "claude-sonnet-5-5";

// Rounds of tool calls before Claude has to answer with what it has. Each
// round re-sends the conversation so far, so this also caps the cost.
const MAX_ROUNDS = 8;

// Without the key, the Ask tab says it isn't available.
export function askEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// The same rule as recaps (src/lib/recap.ts), plus Riot's: the site may
// describe and explain, never tell the player what to do.
const SYSTEM = `You answer questions about one League of Legends player's games for Turnpoint, a stats site.
The person asking is looking at this player's profile. You can read the player's games with two tools:
- recent_games: their latest games, newest first, with champion, role, result, K/D/A and more. Each has a matchId.
- analyze_game: Turnpoint's analysis of one game: lane gaps at 10 and 15 minutes, turning points, win chance swings, deaths, objectives, the 0 to 100 game score and, for junglers, ganks and pathing.

How to work:
- Start with recent_games, then analyze the games the question is about. Analyze several games when the question is about a pattern, but no more than you need: each one takes time.
- Only this player's games are available. If the question is about someone else, or something the tools can't show (like replays, chat, or a live game), say so briefly.

Rules for the answer:
- Use only what the tools returned. Never invent games, numbers, events or reasons.
- Say how many games your answer is based on, and say so when that's too few to call it a pattern.
- Speak to the player as "you".
- Describe what happened and what the numbers show. Don't grade decisions as good or bad and don't give orders: many calls depend on things the stats can't see.
- Plain words a casual player understands. Write game times like 14:20.
- Plain text only: no headings, bold, tables or links. Short paragraphs or a few lines starting with "- ". At most 150 words.
- Refer to games by champion and date, like "your Lee Sin game on Oct 18". The site lists the games you analyzed under your answer, with links.`;

// `strict` makes Claude's tool inputs always match the schema.
const TOOLS: BetaTool[] = [
  {
    name: "recent_games",
    description: `The player's latest games, newest first, plus totals. Up to ${MAX_RECENT_GAMES} games.`,
    input_schema: {
      type: "object",
      properties: {
        count: { type: "integer", description: `How many games, 1 to ${MAX_RECENT_GAMES}.` },
      },
      required: ["count"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "analyze_game",
    description:
      "Turnpoint's analysis of one of the player's games. Games under 15 minutes have none.",
    input_schema: {
      type: "object",
      properties: {
        matchId: { type: "string", description: 'A matchId from recent_games, like "NA1_5012345678".' },
      },
      required: ["matchId"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export type AskResult = {
  // Null when Claude refused, ran out of room or rounds, or a round failed.
  // The cost still counts.
  answer: string | null;
  games: AskGame[];
  model: string;
  // What the question cost, in millionths of a dollar: the token counts
  // Anthropic reported for each round, plus HOLD_MICROS for each round in
  // which a try may have been billed without a reply (see sendRound).
  costMicros: number;
  // Set when a round failed (Anthropic overloaded, a timeout, no network),
  // for the caller to report. The rounds before it were still paid for, so
  // their cost is in costMicros rather than lost with the error.
  error?: unknown;
};

export async function answerQuestion(
  region: Region,
  account: Account,
  question: string,
): Promise<AskResult> {
  // A minute per try, and two tries per round (see sendRound). A question
  // that runs past the page's time limit (maxDuration in the Ask page) is
  // cut off; it was saved with an estimated cost before it started
  // (src/lib/ask-store.ts), so it still counts.
  const client = new Anthropic({ maxRetries: 0, timeout: 60_000 });
  const messages: BetaMessageParam[] = [{ role: "user", content: question }];
  const tools = new ToolRunner(region, account);
  let model = ASK_MODEL;
  let cost = 0;
  const result = (answer: string | null): AskResult => ({
    answer,
    games: tools.gamesRead(),
    model,
    costMicros: cost,
  });

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const sent = await sendRound(client, {
      model: ASK_MODEL,
      max_tokens: 8000,
      // Saves the conversation so far in Anthropic's cache, so the next
      // round only pays full price for what's new (about a tenth otherwise).
      cache_control: { type: "ephemeral" },
      // Medium effort: enough thinking to pick and compare games without
      // spending tokens on a long think for simple questions.
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: TOOLS,
      // On the last round, no more tools: answer with what you've read.
      tool_choice: { type: round === MAX_ROUNDS ? "none" : "auto" },
      messages,
      // If Claude declines (its safety checks can misfire on game talk like
      // "kill" and "execute"), Anthropic retries on a fallback model it picks.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (sent.mayBeBilled) cost += HOLD_MICROS;
    // Both tries failed. Each earlier round's cost was added as soon as
    // Anthropic replied, so it's still counted.
    if (!sent.ok) return { ...result(null), error: sent.error };

    const response = sent.response;
    model = response.model;
    cost += costMicros(response.model, response.usage);

    if (response.stop_reason === "tool_use") {
      // The whole reply goes back, thinking included, as the API requires.
      messages.push({ role: "assistant", content: response.content });
      const calls = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(calls.map((call) => tools.run(call)));
      // All results in one message, so Claude keeps calling tools in parallel.
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n\n")
      .trim();
    const answered = response.stop_reason === "end_turn" && text !== "";
    return result(answered ? text : null);
  }
  // Unreachable: the last round can't call tools.
  return result(null);
}

// How long to wait before a round's second try, like the SDK's own retry.
const RETRY_PAUSE_MS = 500;

type SentRound =
  | { ok: true; response: BetaMessage; mayBeBilled: boolean }
  | { ok: false; error: unknown; mayBeBilled: boolean };

// Sends one round, and tries once more if the first try fails. The SDK can
// retry on its own, but then only the last try's error is seen, so the
// retry is done here instead, where every try can be checked.
//
// A try Anthropic answered with an error (overloaded, rate limited, a bad
// request) wasn't run, and Anthropic doesn't bill those. A try that timed
// out or lost its connection may have been run anyway, and Anthropic bills a
// request that was on its way to succeeding even if we stopped waiting. We
// can't tell which, so `mayBeBilled` says to count the round as HOLD_MICROS,
// the same estimate as a question still being answered. That also charges
// a network outage that never reached Anthropic, which errs on the safe side.
async function sendRound(
  client: Anthropic,
  request: MessageCreateParamsNonStreaming,
): Promise<SentRound> {
  let mayBeBilled = false;
  for (let attempt = 1; ; attempt++) {
    try {
      return { ok: true, response: await client.beta.messages.create(request), mayBeBilled };
    } catch (error) {
      const turnedDown = error instanceof Anthropic.APIError && error.status !== undefined;
      if (!turnedDown) mayBeBilled = true;
      if (attempt === 2) return { ok: false, error, mayBeBilled };
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    }
  }
}

// Runs Claude's tool calls for one player and remembers which games it read.
class ToolRunner {
  // Labels for every game recent_games showed, by match ID.
  private labels = new Map<string, string>();
  // Games analyze_game was run on, in the order Claude asked.
  private analyzed = new Set<string>();

  constructor(
    private region: Region,
    private account: Account,
  ) {}

  gamesRead(): AskGame[] {
    return [...this.analyzed].map((matchId) => ({
      matchId,
      label: this.labels.get(matchId) ?? "A game",
    }));
  }

  async run(call: BetaToolUseBlock): Promise<BetaToolResultBlockParam> {
    const reply = (content: string, isError = false): BetaToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: call.id,
      content,
      ...(isError ? { is_error: true } : {}),
    });
    // Links in tool answers point at this site; Claude is told not to repeat
    // them, since the page lists the games itself.
    const links = { origin: "" };
    const input = (call.input ?? {}) as Record<string, unknown>;

    try {
      if (call.name === "recent_games") {
        const asked = typeof input.count === "number" ? Math.round(input.count) : 10;
        const count = Math.min(Math.max(asked, 1), MAX_RECENT_GAMES);
        const result = await recentGamesFor(this.region, this.account, count, links);
        if ("message" in result) return reply(String(result.message), true);
        this.remember(result);
        return reply(JSON.stringify(result));
      }
      if (call.name === "analyze_game") {
        const matchId = typeof input.matchId === "string" ? input.matchId : "";
        const result = await analyzeGameFor(this.region, this.account, matchId, links);
        if ("message" in result) return reply(String(result.message), true);
        this.analyzed.add(matchId);
        return reply(JSON.stringify(result));
      }
      return reply(`There's no tool called ${call.name}.`, true);
    } catch (error) {
      if (error instanceof RiotApiError) {
        return reply(riotErrorMessage(error.kind, error.retryAfter), true);
      }
      Sentry.captureException(error);
      return reply("Something went wrong in Turnpoint while reading this.", true);
    }
  }

  private remember(result: object) {
    const games = "games" in result && Array.isArray(result.games) ? result.games : [];
    for (const game of games) {
      if (typeof game?.matchId === "string") this.labels.set(game.matchId, gameLabel(game));
    }
  }
}
