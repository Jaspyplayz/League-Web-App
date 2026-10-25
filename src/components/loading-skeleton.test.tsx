import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsSkeleton, MatchSkeleton, ProfileSkeleton } from "./loading-skeleton";

// What a player gets in the HTML while a page is still loading. The shape is
// grey blocks with a name for assistive tech, not a lone "Loading…" sentence.

describe("loading skeletons", () => {
  it("draws the profile instead of a lookup sentence", () => {
    const html = renderToStaticMarkup(<ProfileSkeleton />);
    expect(html).toContain('aria-label="Looking up player"');
    expect(html).toContain("bg-line-strong");
    expect(html).not.toContain("Looking up player…");
  });

  it("draws the match instead of an analyzing sentence", () => {
    const html = renderToStaticMarkup(<MatchSkeleton />);
    expect(html).toContain('aria-label="Analyzing match"');
    expect(html).toContain("bg-line-strong");
    expect(html).not.toContain("Analyzing match…");
  });

  it("draws insights instead of a loading sentence", () => {
    const html = renderToStaticMarkup(<InsightsSkeleton />);
    expect(html).toContain('aria-label="Loading insights"');
    expect(html).toContain("bg-line-strong");
    expect(html).not.toContain("Loading insights…");
  });
});
