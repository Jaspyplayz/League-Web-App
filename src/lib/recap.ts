import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { RecapFacts } from "@/lib/analyzer/recap-facts";

// Writes a short recap of one game with Claude. This is the only file that
// talks to the language model, so switching to another provider means
// changing just this file.
//
// Claude Haiku is the smallest, cheapest Claude model: a recap is about 5,000
// tokens in and a few hundred out, well under a tenth of a cent. Each recap is
// saved (src/lib/recap-store.ts), so a game is only ever written once.
export const RECAP_MODEL = "claude-haiku-5-5";

// `detail` holds the bullet points, one per line. Recaps saved before the
// points existed are a single paragraph, which shows as one point.
export type Recap = { headline: string; detail: string };

// Without the key, the site hides the "Write recap" button.
export function recapsEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Jasper's rule for jungle features: decisions are situational (ganking a
// losing lane can be right when you're up numbers), so describe the
// situation, never grade a decision as good or bad.
const SYSTEM = `You write short recaps of League of Legends games for Turnpoint, a stats site.
You get one player's game as JSON facts worked out by Turnpoint's analyzer.

Rules:
- Use only the facts given. Never invent events, timings, items, or reasons that aren't in the JSON.
- Speak to the player as "you".
- Describe what happened and the situation around it. Don't grade decisions as good or bad, and don't give orders: many calls depend on things the stats can't see, like where the enemy jungler was.
- Lead with what decided the game: the biggest win chance swings and turning points.
- For junglers, mention how much of the early game was spent near lanes that were ahead or behind, how the ganks went, and the farm.
- Plain words a casual player understands. Write times as game clock times like 14:20.

Output:
- points: 3 to 5 bullet points, most important first. Each point is one short sentence of at most 20 words about one thing, with at most two numbers. Start with the game time when there is one, like "12:00: Your team took two towers and a kill, and your win chance rose from 66% to 84%."
- headline: one sentence of at most 12 words that sums up the points. It may only repeat something already said in the points, never a new fact.`;

const SCHEMA = {
  type: "object",
  properties: {
    points: { type: "array", items: { type: "string" } },
    headline: { type: "string" },
  },
  // Points come first so the model writes them before summing them up.
  required: ["points", "headline"],
  additionalProperties: false,
};

// Null when Claude refused, ran out of room, or sent something unexpected.
// Network and API errors are thrown, for the caller to report.
export async function writeRecap(facts: RecapFacts): Promise<Recap | null> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: RECAP_MODEL,
    max_tokens: 4000,
    // Low effort: the facts are already worked out, so this is just writing.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  if (response.stop_reason !== "end_turn") return null;
  const text = response.content.find((block) => block.type === "text")?.text;
  return text ? parseRecap(text) : null;
}

function parseRecap(text: string): Recap | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const { headline, points } = value as Record<string, unknown>;
    if (typeof headline !== "string" || !headline.trim() || !Array.isArray(points)) return null;
    // One line per point, so a point can't contain line breaks of its own.
    const lines = points
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    return { headline: headline.trim(), detail: lines.join("\n") };
  } catch {
    return null;
  }
}
