import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { biggerWindow, NotEnoughGames, TooFewOnChampion } from "./empty-states";

const PATH = "/player/na/Name-TAG/insights";

// The href of the one link in the markup, with &amp; turned back into &.
function linkHref(html: string): string | null {
  const href = html.match(/href="([^"]*)"/)?.[1];
  return href ? href.replaceAll("&amp;", "&") : null;
}

describe("biggerWindow", () => {
  it("steps 20 to 50 to 100, then stops", () => {
    expect(biggerWindow(20)).toBe(50);
    expect(biggerWindow(50)).toBe(100);
    expect(biggerWindow(100)).toBeNull();
  });
});

describe("NotEnoughGames", () => {
  it("says why and offers the next window, keeping the other choices", () => {
    const html = renderToStaticMarkup(
      <NotEnoughGames window={20} skipped={18} insightsPath={PATH} keep={{ view: "habits" }} />,
    );
    expect(html).toContain("Not enough games to spot trends yet");
    expect(html).toContain("at least 3 recent games");
    expect(html).toContain("18 of your last 20 were ARAM, Arena, remakes or similar.");
    expect(html).toContain("Look at the last 50 games");
    expect(linkHref(html)).toBe(`${PATH}?view=habits&games=50`);
  });

  it("leaves out the skipped games when there were none", () => {
    const html = renderToStaticMarkup(
      <NotEnoughGames window={50} skipped={0} insightsPath={PATH} keep={{}} />,
    );
    expect(html).not.toContain("ARAM");
    expect(linkHref(html)).toBe(`${PATH}?games=100`);
  });

  it("has no link at 100 games, the biggest window", () => {
    const html = renderToStaticMarkup(
      <NotEnoughGames window={100} skipped={4} insightsPath={PATH} keep={{}} />,
    );
    expect(html).toContain("Not enough games to spot trends yet");
    expect(linkHref(html)).toBeNull();
  });
});

describe("TooFewOnChampion", () => {
  it("names the champion and the count, and keeps the champion in the link", () => {
    const html = renderToStaticMarkup(
      <TooFewOnChampion
        name="Ahri"
        games={2}
        window={20}
        insightsPath={PATH}
        keep={{ champion: "Ahri" }}
      />,
    );
    expect(html).toContain("Only 2 Ahri games in your last 20");
    expect(html).toContain("Trends need at least 3. Try a bigger window, or pick another champion.");
    expect(linkHref(html)).toBe(`${PATH}?champion=Ahri&games=50`);
  });

  it("says when there are none, and only suggests another champion at 100", () => {
    const html = renderToStaticMarkup(
      <TooFewOnChampion name="Wukong" games={0} window={100} insightsPath={PATH} keep={{}} />,
    );
    expect(html).toContain("No Wukong games in your last 100");
    expect(html).toContain("Try another champion.");
    expect(html).not.toContain("bigger window");
    expect(linkHref(html)).toBeNull();
  });

  it("says game, not games, for one", () => {
    const html = renderToStaticMarkup(
      <TooFewOnChampion name="Ahri" games={1} window={50} insightsPath={PATH} keep={{}} />,
    );
    expect(html).toContain("Only 1 Ahri game in your last 50");
  });
});
