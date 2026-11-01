import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsTabs } from "./insights-tabs";

const PATH = "/player/na/Name-TAG/insights";

describe("InsightsTabs", () => {
  const html = renderToStaticMarkup(
    <InsightsTabs insightsPath={PATH} current="others" keep={{ games: "50", champion: "Ahri" }} />,
  );
  const links = [...html.matchAll(/<a [^>]*>[^<]*<\/a>/g)].map((m) => m[0]);

  it("links the three views in order, keeping the filters", () => {
    expect(links.map((l) => l.match(/>([^<]*)</)?.[1])).toEqual([
      "Overview",
      "You vs others",
      "Habits and sessions",
    ]);
    expect(links[2]).toContain(`href="${PATH}?games=50&amp;champion=Ahri&amp;view=habits"`);
  });

  it("marks only the open view as the current page", () => {
    expect(links.filter((l) => l.includes('aria-current="page"'))).toHaveLength(1);
    expect(links[1]).toContain('aria-current="page"');
  });
});
