# Ask (ask your history)

A player profile's **Ask** tab lets anyone signed in type a question about that player's games, like "What do my losses have in common?". Claude reads the games through Turnpoint's own tools and answers in a few sentences, with links to the games it read.

## How it works

1. The Ask button calls `askAction` (`src/app/account/actions.ts`). It checks the question (up to 300 characters), the sign-in cookie and the player from the page address.
2. `src/lib/ask-store.ts` checks the limits (below) and saves the question with an estimated cost, then calls `answerQuestion` in `src/lib/ask.ts`.
3. `src/lib/ask.ts` runs an **agent loop** with Claude Sonnet (`claude-sonnet-5-5`). Claude gets two tools, the same ones the MCP server offers (`src/lib/mcp/tools.ts`):
   - `recent_games`: the player's latest games (up to 20) with champion, result, K/D/A and a match ID each.
   - `analyze_game`: the analyzer's facts for one game (lane gaps, win chance swings, deaths, objectives, game score, ganks).

   Each round, Claude either asks for tools, which the server runs and sends back, or writes the answer. After 8 rounds it must answer with what it has. The tools are tied to the player on the page, so Claude can't read anyone else's games.
4. The answer, games read, model and cost replace the estimate in `ask_questions` (migration 0018), and the cost in `ask_spend` (0019). Only the account that asked sees its questions.

### Why the question is saved before Claude answers

An answer takes up to a few minutes. If the question were saved only at the end, ten questions sent at the same moment would all pass the check while none of them was counted yet, and could spend far past the caps. So `reserve()` in `ask-store.ts` runs one short transaction: it takes a lock the whole site shares (`pg_advisory_xact_lock`), checks the limits, and saves the question with a 50-cent estimate (`HOLD_MICROS`). The next question waits for that lock, so its check sees the first one. The lock is let go before Claude is called. When the answer is in, `settle()` swaps the estimate for the cost.

Each round gets two tries. `sendRound` in `ask.ts` makes the second try itself, instead of leaving it to Anthropic's SDK, so it can see what happened to both:

- A try Anthropic answered with an error (overloaded, rate limited) wasn't run, and Anthropic doesn't bill those.
- A try that timed out or lost its connection may still have been run, and Anthropic bills a request that was on its way to succeeding even if we stopped waiting. We can't tell, so that round adds the 50-cent estimate, once. A network outage that never reached Anthropic is charged the same way, which errs on the safe side.

If both tries of a round fail, `answerQuestion` stops and returns what the question cost so far, and that is what's charged. A question whose first round Anthropic turned down on both tries cost nothing, so it's deleted and doesn't count. If the server is stopped mid-answer (the page's 3-minute limit), the estimate saved at the start stays.

The reasons and the options considered are in [decision record 0005](adr/0005-ask-budget.md).

The prompt follows the recap rules: use only what the tools returned, say how many games the answer rests on, describe instead of telling the player what to do, plain text.

## Limits and cost

A question usually costs 5 to 20 cents: Sonnet is $2 per million tokens in and $10 out (checked 2026-10-20), and a question reads a few games' analyses over several rounds. Prompt caching makes the repeated part of each round cost a tenth.

- **Signed in only**, so the caps belong to an account. Making a second Google or Discord account is free, which is why the site-wide budget below is the real limit.
- **10 questions per account per 24 hours** (`QUESTIONS_PER_DAY` in `src/lib/ask-rules.ts`). Questions Claude couldn't answer still count; ones Anthropic turned down before Claude's first reply don't (see above).
- **$5 per account per calendar month** (`ACCOUNT_MONTHLY_BUDGET_USD`, picked 2026-10-21), so one account can't use up the whole budget and pause Ask for everyone.
- **$20 a month for the whole site** (`MONTHLY_BUDGET_USD`). Each answer's cost is worked out from the token counts Anthropic reports (`costMicros`), plus the 50-cent estimate for a round with a try that timed out. It's saved twice: with the question, and in `ask_spend`, which has no account on it, so deleting an account doesn't hand its spending back to the month. When `ask_spend`'s total for the month reaches the budget, Ask pauses until the 1st.
- If Claude declines a question, Anthropic retries it on a fallback model (`fallbacks: "default"`). Unknown models are priced high, so the budget errs on the safe side.
- Set a monthly spend limit in the Anthropic console as a second guard.

## Setup

Uses the same `ANTHROPIC_API_KEY` as recaps, plus sign-in and the database. Without any of them the tab says Ask isn't available. Apply the migrations with `npm run db:migrate` (0018 makes `ask_questions`, 0019 `ask_spend`, and 0020 copies the costs saved before `ask_spend` existed into it).

## Ask from your own Claude instead

The MCP server (`/api/mcp`, see [mcp.md](mcp.md)) offers the same tools to anyone's Claude app. Asking there uses the person's own Claude plan, so it costs Turnpoint nothing.
