import { describe, expect, it } from "vitest";
import robots from "./robots";

// Which paths robots.txt asks one crawler to skip. A crawler follows the
// group that names it, and only falls back to the "*" group when none does.
function disallowedFor(bot: string): string[] {
  const { rules } = robots();
  const groups = [rules].flat();
  const names = (group: (typeof groups)[number]) => [group.userAgent ?? []].flat();
  const own = groups.find((g) => names(g).includes(bot));
  const group = own ?? groups.find((g) => names(g).includes("*"));
  return [group?.disallow ?? []].flat();
}

function allowed(bot: string, path: string): boolean {
  return !disallowedFor(bot).some((prefix) => path.startsWith(prefix));
}

const MATCH_PAGE = "/player/na/Jaspy-CA1/match/NA1_5012345678";

describe("robots.txt", () => {
  it("asks crawlers to stay out of player pages and the API", () => {
    expect(allowed("Googlebot", "/player/na/Jaspy-CA1")).toBe(false);
    expect(allowed("Googlebot", MATCH_PAGE)).toBe(false);
    expect(allowed("Googlebot", "/api/mcp")).toBe(false);
  });

  it("leaves the home and info pages open", () => {
    for (const path of ["/", "/how-it-works", "/privacy", "/terms"]) {
      expect(allowed("Googlebot", path)).toBe(true);
    }
  });

  it("lets link preview bots open a pasted match link and its card, but not the API", () => {
    for (const bot of ["Twitterbot", "LinkedInBot", "Slackbot"]) {
      expect(allowed(bot, MATCH_PAGE)).toBe(true);
      expect(allowed(bot, `${MATCH_PAGE}/opengraph-image`)).toBe(true);
      expect(allowed(bot, "/api/mcp")).toBe(false);
    }
  });
});
