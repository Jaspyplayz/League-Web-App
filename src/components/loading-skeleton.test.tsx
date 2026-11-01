import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsSkeleton, MatchSkeleton, ProfileSkeleton } from "./loading-skeleton";

describe("loading skeletons", () => {
  it("draws the profile instead of a lookup sentence", () => {
    const html = renderToStaticMarkup(<ProfileSkeleton />);
    expect(html).toContain('aria-label="Looking up player"');
    expect(html).toContain("bg-line-strong");
    expect(html).not.toContain("Looking up player…");
  });

  it("draws the match in layout A's shape, with what's already known for real", () => {
    const html = renderToStaticMarkup(<MatchSkeleton back={<a href="/back">Back</a>} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Analyzing the game");
    expect(html).toContain("bg-divider");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
    for (const known of ["Back", "Summary", "Replay", "Stats"]) expect(html).toContain(known);
  });

  it("draws insights instead of a loading sentence", () => {
    const html = renderToStaticMarkup(<InsightsSkeleton />);
    expect(html).toContain('aria-label="Loading insights"');
    expect(html).toContain("bg-line-strong");
    expect(html).not.toContain("Loading insights…");
  });
});
