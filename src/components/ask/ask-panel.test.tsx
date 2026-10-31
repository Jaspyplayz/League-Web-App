import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { checkAllowance, readQuestions } from "@/lib/ask-store";
import { AskContent } from "./ask-panel";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/player/kr/Faker-KR1/match/KR_1" }));
vi.mock("@/app/account/actions", () => ({ askAction: vi.fn() }));
vi.mock("@/lib/ask", () => ({ askEnabled: () => true }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "user-1" }) }));
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

describe("AskContent", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.mocked(readQuestions).mockResolvedValue({ ok: true, questions: [] });
    vi.mocked(checkAllowance).mockResolvedValue({ ok: true, left: 10 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("offers questions that name this game with its match ID", async () => {
    const html = await render();
    expect(html).toContain("What decided my Syndra game on Oct 18 (KR_1)?");
    expect(html).toContain("10 questions left today");
  });

  // The panel is on every match page now, so a failed read must not take
  // the analysis down with it (the old Ask page showed the error page).
  it("says Ask couldn't load when the allowance read fails", async () => {
    vi.mocked(checkAllowance).mockRejectedValue(new Error("pooler timeout"));
    const html = await render();
    expect(html).toContain("Couldn&#x27;t load Ask. Reload to try again.");
    expect(html).not.toContain("ask-question");
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
