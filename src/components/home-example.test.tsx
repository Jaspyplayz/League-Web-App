import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { HomeExampleLoading, HomeExamplePanel } from "./home-example";

const example = {
  won: true,
  champion: "Syndra",
  opponent: "Zoe",
  details: "Hide on bush#KR1 · 9/2/10 · Mid · 24:05",
  gold: [
    { minute: 0, diff: 0 },
    { minute: 10, diff: 900 },
    { minute: 20, diff: -300 },
  ],
  description: "Gold difference against Zoe by minute.",
  turn: { minute: 9, clock: "9:12", title: "Killed Zoe", detail: "Solo kill in lane.", ahead: true },
};

// Every state keeps the chart's slot and the button, so the button never moves.
const SLOT = "h-[180px] sm:h-[150px]";

describe("home's example panel", () => {
  it("opens the game from both the chart and the button", () => {
    const html = renderToStaticMarkup(<HomeExamplePanel example={example} />);
    expect(html).toContain("Example game: </span>");
    expect(html).toContain(">Victory</span> as Syndra");
    expect(html).toContain("Hide on bush#KR1 · 9/2/10 · Mid · 24:05");
    expect(html).toContain("Killed Zoe");
    expect(html).toContain(SLOT);
    const links = html.match(new RegExp(`href="${SAMPLE_MATCH_HREF}"`, "g")) ?? [];
    expect(links).toHaveLength(2);
    expect(html).toContain("Open this game</a>");
  });

  it("keeps the chart's slot and the button when the game can't be read", () => {
    const html = renderToStaticMarkup(<HomeExamplePanel example={null} />);
    expect(html).toContain("The example game&#x27;s chart can&#x27;t load right now");
    expect(html).toContain(SLOT);
    expect(html).toContain("Open this game</a>");
  });

  it("keeps the same shape while it loads", () => {
    const html = renderToStaticMarkup(<HomeExampleLoading />);
    expect(html).toContain(SLOT);
    expect(html).toContain("Open this game</a>");
  });
});
