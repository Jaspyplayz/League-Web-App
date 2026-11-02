import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedPlayer, SavedRank } from "@/lib/saved-players";
import { fetchDetails, SavedPlayersBox } from "./saved-players-box";

const faker: SavedPlayer = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const unknown: SavedPlayer = { region: "na", gameName: "Never Seen", tagLine: "NA1" };
const me: SavedPlayer = { region: "euw", gameName: "Jasper", tagLine: "EUW" };

function box({
  recent = [faker, unknown],
  pinned = [faker],
  you = null,
  ranks = { "kr/hide on bush#kr1": { tier: "CHALLENGER", division: "I" }, "na/never seen#na1": null },
  query = "",
}: {
  recent?: SavedPlayer[];
  pinned?: SavedPlayer[];
  you?: SavedPlayer | null;
  ranks?: Record<string, SavedRank | null>;
  query?: string;
} = {}) {
  return renderToStaticMarkup(
    <SavedPlayersBox
      saved={{ recent, pinned, you, ranks, hasAny: true }}
      query={query}
      onPick={() => {}}
      onRowGone={() => {}}
    />,
  );
}

describe("fetchDetails", () => {
  afterEach(() => vi.unstubAllGlobals());
  const serverAnswers = (body: unknown, status = 200) =>
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));

  it("sends the players and gives back the route's answer", async () => {
    const answer = { ranks: { "kr/hide on bush#kr1": { tier: "CHALLENGER", division: "I" } }, you: me };
    serverAnswers(answer);
    expect(await fetchDetails([faker])).toEqual(answer);
    expect(fetch).toHaveBeenCalledWith("/api/saved-players", expect.objectContaining({ body: JSON.stringify([faker]) }));
  });

  // A page open from before a deploy could get one. Null keeps the box's last answer.
  it("gives null for an answer in the wrong shape", async () => {
    serverAnswers({ ranks: { "kr/hide on bush#kr1": { tier: "UNRANKED", division: "I" } }, you: { region: "na" } });
    expect(await fetchDetails([faker])).toBeNull();
  });

  it("gives null for a failed read", async () => {
    serverAnswers(null, 503);
    expect(await fetchDetails([faker])).toBeNull();
  });
});

describe("SavedPlayersBox", () => {
  it("shows the Recent and Pinned tabs with their counts, starting on Recent", () => {
    const html = box();
    expect(html).toMatch(/aria-selected="true"[^>]*>Recent<span[^>]*>2</);
    expect(html).toMatch(/aria-selected="false"[^>]*>Pinned<span[^>]*>1</);
  });

  it("gives each row a badge, Riot ID, region, star and ×", () => {
    const html = box({ recent: [faker] });
    expect(html).toContain('title="Challenger"');
    expect(html).toContain("Hide on bush");
    expect(html).toContain("#KR1");
    expect(html).toContain(">KR<");
    expect(html).toContain('aria-label="Unpin Hide on bush#KR1"');
    expect(html).toContain('aria-label="Remove Hide on bush#KR1 from recent players"');
    expect(html).toContain('href="/player/kr/Hide%20on%20bush-KR1"');
  });

  it("shows a dash for a player with no rank on file", () => {
    expect(box({ recent: [unknown] })).toContain('title="No solo queue rank on file"');
  });

  it("offers to pin a player who isn't pinned", () => {
    expect(box({ recent: [unknown] })).toContain('aria-label="Pin Never Seen#NA1"');
  });

  it("can't pin another player once the list is full", () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ ...faker, gameName: `Pinned ${i}` }));
    expect(box({ recent: [unknown], pinned: full })).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Pin Never Seen#NA1"/,
    );
  });

  it("narrows the rows by what's typed, whatever the capitals", () => {
    const html = box({ query: "  HIDE " });
    expect(html).toContain("Hide on bush");
    expect(html).not.toContain("Never Seen");
  });

  it("says so when nothing matches, keeping the counts", () => {
    const html = box({ query: "nobody" });
    expect(html).toContain("No saved player matches.");
    expect(html).toMatch(/Recent<span[^>]*>2</);
  });

  it("puts the signed-in player's own row on top, with You and no star or ×", () => {
    const html = box({ you: me });
    expect(html.indexOf("Jasper")).toBeLessThan(html.indexOf("Hide on bush"));
    expect(html).toContain(">You<");
    expect(html).not.toContain('aria-label="Pin Jasper#EUW"');
    expect(html).not.toContain('aria-label="Remove Jasper#EUW');
  });

  it("filters the signed-in player's row too", () => {
    expect(box({ you: me, query: "hide" })).not.toContain(">You<");
  });

  it("shows empty badges, not dashes, for players not asked about yet", () => {
    expect(box({ ranks: {} })).not.toContain("No solo queue rank on file");
  });

  it("opens on Pinned when only Pinned has someone", () => {
    expect(box({ recent: [] })).toMatch(/aria-selected="true"[^>]*>Pinned</);
  });

  it("shows a name that's only on the other tab, not a false no match", () => {
    const html = box({ recent: [unknown], pinned: [faker], query: "hide" });
    expect(html).toMatch(/aria-selected="true"[^>]*>Pinned</);
    expect(html).toContain("Hide on bush");
    expect(html).not.toContain("No saved player matches.");
  });

  it("says no match when neither tab has the name", () => {
    expect(box({ recent: [unknown], pinned: [faker], query: "nobody" })).toMatch(
      /aria-selected="true"[^>]*>Recent<[\s\S]*No saved player matches\./,
    );
  });
});
