# Ask (ask your history)

A player profile's **Ask** tab lets anyone signed in type a question about that player's games, like "What do my losses have in common?". Claude reads the games through Turnpoint's own tools and answers in a few sentences, with links to the games it read.

## How it works

1. The Ask button calls `askAction` (`src/app/account/actions.ts`). It checks the question (up to 300 characters), the sign-in cookie and the player from the page address.
2. `src/lib/ask-store.ts` checks the limits (below), then calls `answerQuestion` in `src/lib/ask.ts`.
3. `src/lib/ask.ts` runs an **agent loop** with Claude Sonnet (`claude-sonnet-5-5`). Claude gets two tools, the same ones the MCP server offers (`src/lib/mcp/tools.ts`):
   - `recent_games`: the player's latest games (up to 20) with champion, result, K/D/A and a match ID each.
   - `analyze_game`: the analyzer's facts for one game (lane gaps, win chance swings, deaths, objectives, game score, ganks).

   Each round, Claude either asks for tools, which the server runs and sends back, or writes the answer. After 8 rounds it must answer with what it has. The tools are tied to the player on the page, so Claude can't read anyone else's games.
4. The question, answer, games read, model and cost are saved in `ask_questions` (migration 0018). Only the account that asked sees them.

The prompt follows the recap rules: use only what the tools returned, say how many games the answer rests on, describe instead of telling the player what to do, plain text.

## Limits and cost

A question usually costs 5 to 20 cents: Sonnet is $2 per million tokens in and $10 out (checked 2026-10-20), and a question reads a few games' analyses over several rounds. Prompt caching makes the repeated part of each round cost a tenth.

- **Signed in only**, so the daily cap can't be dodged.
- **10 questions per account per 24 hours** (`QUESTIONS_PER_DAY` in `src/lib/ask-rules.ts`). Questions Claude couldn't answer still count.
- **$20 a month for the whole site** (`MONTHLY_BUDGET_USD`). Each answer's cost is worked out from the token counts Anthropic reports (`costMicros`) and saved; when the month's total reaches the budget, Ask pauses until the 1st.
- If Claude declines a question, Anthropic retries it on a fallback model (`fallbacks: "default"`). Unknown models are priced high, so the budget errs on the safe side.
- Set a monthly spend limit in the Anthropic console as a second guard.

## Setup

Uses the same `ANTHROPIC_API_KEY` as recaps, plus sign-in and the database. Without any of them the tab says Ask isn't available. Apply the migration with `npm run db:migrate`.

## Ask from your own Claude instead

The MCP server (`/api/mcp`, see [mcp.md](mcp.md)) offers the same tools to anyone's Claude app. Asking there uses the person's own Claude plan, so it costs Turnpoint nothing.
