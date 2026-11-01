import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import closeGame from "@/lib/analyzer/fixtures/close.json";
import { analyzeMatch } from "@/lib/analyzer";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import type { Match } from "@/lib/riot/types";
import { AnalysisSections } from "./analysis-sections";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// One of the golden games (src/lib/analyzer/fixtures), seen by its blue-side
// jungler.
const game = closeGame as unknown as { match: Match; timeline: TrimmedTimeline };

// The whole analysis drawn as the match page draws it, but without Data
// Dragon (Riot's item and rune data), as when it fails to load.
function renderWithoutDataDragon(): string {
  const analysis = analyzeMatch(game.match, game.timeline, "golden-player-2")!;
  return renderToStaticMarkup(
    <AnalysisSections
      region="na"
      match={game.match}
      analysis={analysis}
      winChance={null}
      chances={null}
      phases={[]}
      dd={null}
      label={(name) => name}
      builds={{}}
      recap={null}
      notes={null}
      ask={null}
    />,
  );
}

describe("the Stats tab without Data Dragon", () => {
  it("shows the problem panel in Build and runes and keeps the other sections", () => {
    const html = renderWithoutDataDragon();
    expect(html).toContain("Items and runes can&#x27;t load from Riot right now");
    for (const heading of ["Team gold", "Deaths", "Team analysis", "Build and runes"]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
  });
});
