import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DeathRecap } from "@/lib/analyzer/death-recap";
import type { HabitReport } from "@/lib/analyzer/habit-trends";
import { AnalysisProgress } from "./analysis-progress";
import { DeathRecapSection } from "./death-recap";
import { HabitsSection } from "./habits";
import { NoRanks } from "./tier-comparison";

// The Data Dragon helpers are server-only; with dd = null nothing is fetched.
vi.mock("server-only", () => ({}));
// The progress bar refreshes the page through the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// Portraits are a shared component; these tests are about Insights' markup.
vi.mock("@/components/game-icons", () => ({ ChampionIcon: () => <span /> }));

// Blue and red mean you and the opponent, so neutral parts use neither.
const BLUE_OR_RED = /\b(bg|text)-(ahead|behind)\b/;

describe("HabitsSection with nothing to show", () => {
  // A champion picked that you played in two roles: 2 mid games is fewer than
  // any habit needs, so compareHabits returns no habits at all.
  const empty: HabitReport = {
    position: "MIDDLE",
    games: 2,
    rankGames: 0,
    backBy: 200,
    backFrom: "you",
    habits: [],
  };

  it("keeps its heading and says why", () => {
    const html = renderToStaticMarkup(<HabitsSection report={empty} tier={null} />);
    expect(html).toContain(">Habits</h2>");
    expect(html).toContain("Each habit needs at least 3 of your games in your most-played role (mid)");
    expect(html).not.toContain("<ul");
  });

  it("says the same with no report at all", () => {
    const html = renderToStaticMarkup(<HabitsSection report={null} tier={null} />);
    expect(html).toContain(">Habits</h2>");
    expect(html).toContain("Each habit needs at least 3 of your games");
  });
});

describe("NoRanks", () => {
  it("keeps the rank comparison's heading and says why it's empty", () => {
    const html = renderToStaticMarkup(<NoRanks />);
    expect(html).toContain('id="benchmark-heading"');
    expect(html).toContain("You vs other ranks");
    expect(html).toContain("hasn&#x27;t collected games from any rank yet");
  });
});

describe("What keeps killing you", () => {
  const recap: DeathRecap = {
    deaths: 10,
    championDeaths: 10,
    undetailed: 0,
    towerDeaths: 0,
    damage: { physical: 45, magic: 48, true: 7 },
    threats: [
      {
        championName: "Viego",
        deaths: 7,
        damage: 1,
        share: 0.4,
        abilities: [{ ability: "Q", spellName: "", deaths: 7, damage: 1 }],
      },
    ],
    respect: null,
  };

  it("splits the damage in neutral shades, not blue and red", async () => {
    const html = renderToStaticMarkup(await DeathRecapSection({ recap, dd: null }));
    expect(html).toContain('aria-label="Physical 45%, Magic 48%, True 7%"');
    expect(html).not.toMatch(BLUE_OR_RED);
  });
});

describe("AnalysisProgress", () => {
  it("fills the bar in the text colour, not blue", () => {
    const html = renderToStaticMarkup(<AnalysisProgress analyzed={12} total={20} retryAfterS={null} />);
    expect(html).toContain("Analyzing your games: 12 of 20 done");
    expect(html).toContain("bg-main");
    expect(html).not.toMatch(BLUE_OR_RED);
  });
});
