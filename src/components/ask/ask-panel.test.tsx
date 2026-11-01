import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { askEnabled } from "@/lib/ask";
import { allowance, QUESTIONS_PER_DAY } from "@/lib/ask-rules";
import { checkAllowance, readQuestions } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { AskContent } from "./ask-panel";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/player/kr/Faker-KR1/match/KR_1" }));
vi.mock("@/app/account/actions", () => ({ askAction: vi.fn() }));
vi.mock("@/lib/ask", () => ({ askEnabled: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ask-store", () => ({ readQuestions: vi.fn(), checkAllowance: vi.fn() }));

const props = {
  region: "kr",
  riotId: "Faker-KR1",
  puuid: "puuid-1",
  playerPath: "/player/kr/Faker-KR1",
  game: "Syndra game on Oct 18 (KR_1)",
};

async function render() {
  return renderToStaticMarkup(await AskContent(props));
}

// Problems and limits are in the text colours: red only means the opponent.
function expectNoRed(html: string) {
  expect(html).not.toMatch(/text-behind|bg-behind|border-behind/);
}

describe("AskContent", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.mocked(askEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getCurrentUser>
    >);
    vi.mocked(readQuestions).mockResolvedValue({ ok: true, questions: [] });
    vi.mocked(checkAllowance).mockResolvedValue({ ok: true, left: 10 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("offers questions that name this game with its match ID", async () => {
    const html = await render();
    expect(html).toContain("What decided my Syndra game on Oct 18 (KR_1)?");
    expect(html).toContain("10 questions left today");
    expect(html).toContain('id="ask-question"');
  });

  it("asks a signed-out visitor to sign in, with an example answer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("to ask questions about this player&#x27;s games");
    expect(html).toContain('href="/sign-in?next=');
    expect(html).toContain("Illustration · not a real game");
    expect(html).not.toContain("ask-question");
  });

  it("says Ask isn't available when it isn't set up", async () => {
    vi.mocked(askEnabled).mockReturnValue(false);
    const html = await render();
    expect(html).toContain("Ask isn&#x27;t available right now.");
    expect(html).not.toContain("ask-question");
  });

  // The panel is on every match page now, so a failed read must not take
  // the analysis down with it (the old Ask page showed the error page).
  it("says Ask couldn't load when the allowance read fails", async () => {
    vi.mocked(checkAllowance).mockRejectedValue(new Error("pooler timeout"));
    const html = await render();
    expect(html).toContain("Couldn&#x27;t load Ask.");
    expect(html).toContain("Reload the page to try again.");
    expect(html).not.toContain("ask-question");
    expectNoRed(html);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  // Each limit's own words, from the real allowance() rules, in place of the
  // question box.
  it.each([
    ["the account's day", { askedToday: QUESTIONS_PER_DAY, accountSpent: 0, siteSpent: 0 }],
    ["the account's month", { askedToday: 0, accountSpent: 1e12, siteSpent: 0 }],
    ["the site's month", { askedToday: 0, accountSpent: 0, siteSpent: 1e12 }],
  ])("shows %s limit instead of the question box", async (_, used) => {
    const limited = allowance(used);
    if (limited.ok) throw new Error("expected a limit");
    vi.mocked(checkAllowance).mockResolvedValue(limited);
    const html = await render();
    expect(html).toContain(limited.message.replaceAll("'", "&#x27;"));
    expect(html).not.toContain("ask-question");
    expectNoRed(html);
  });

  it("keeps the past questions under a limit", async () => {
    vi.mocked(checkAllowance).mockResolvedValue(
      allowance({ askedToday: QUESTIONS_PER_DAY, accountSpent: 0, siteSpent: 0 }),
    );
    vi.mocked(readQuestions).mockResolvedValue({
      ok: true,
      questions: [{ id: "q1", question: "Why do I lose?", answer: "You die early.", games: [], askedAt: new Date() }],
    });
    const html = await render();
    expect(html).toContain("Why do I lose?");
  });
});
