import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChampionLine, ChampionStats } from "@/lib/champion-stats";
import type { DataDragon } from "@/lib/ddragon";
import { ChampionRows } from "./champion-search";
import { ChampionTable } from "./champion-table";

// The portraits are a shared component that other pages restyle; these tests
// are about the Champions tab's own markup.
vi.mock("@/components/game-icons", () => ({ ChampionIcon: () => <span /> }));

// A champion's line with made-up numbers; only the name matters here.
function line(championName: string): ChampionLine {
  return {
    championName,
    games: 10,
    wins: 6,
    kills: 5,
    deaths: 4,
    assists: 6,
    kda: 2.75,
    killParticipation: 0.5,
    score: 61,
    csLeadAt10: 4.2,
    aheadAt10: 0.7,
    damagePerMin: 900,
    damageShare: 0.25,
    wardsPlaced: 10,
    wardsKilled: 3,
    controlWards: 3,
    cs: 210,
    csPerMin: 8.1,
    gold: 11_500,
    goldPerMin: 440,
    doubleKills: 4,
    tripleKills: 1,
    quadraKills: 0,
    pentaKills: 0,
  };
}

const stats: ChampionStats = {
  all: line("All"),
  champions: ["Ahri", "KaiSa", "MonkeyKing"].map((name) => ({ ...line(name), opponents: [] })),
};

// Enough of Data Dragon for the names and portraits.
const dd = {
  version: "15.20.1",
  champions: {
    ahri: { id: "Ahri", name: "Ahri" },
    kaisa: { id: "Kaisa", name: "Kai'Sa" },
    monkeyking: { id: "MonkeyKing", name: "Wukong" },
  },
} as unknown as DataDragon;

const html = renderToStaticMarkup(<ChampionTable stats={stats} dd={dd} heading={<h2>Season 2026</h2>} />);

describe("the Champions table", () => {
  it("names its columns in sentence case, with their meaning on hover", () => {
    expect(html).toContain("Search a champion");
    expect(html).toMatch(/<th[^>]*title="Wins and losses, and the win rate"[^>]*>Played<\/th>/);
    expect(html).toMatch(/<th[^>]*title="Double kills"[^>]*>2×<\/th>/);
    expect(html).toMatch(/<th[^>]*>Champion<\/th>/);
  });

  // The Review board's rules (.claude/rules/design.md): no all-caps, no
  // monospace or display font, and none of the old colour or corner names.
  it("uses only the Review board's names", () => {
    const classes = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(classes).not.toMatch(/\b(?:uppercase|tracking-wide\S*|font-mono|font-display|text-label)\b/);
    expect(classes).not.toMatch(
      /\b(?:\S+:)?(?:text|bg|border)-(?:surface|surface-hover|line|line-strong|ink|ink-soft|muted|faint|frame)\b/,
    );
    expect(classes).not.toMatch(/\bsoft-round\S*|\brounded(?:-lg|-xl)?\b(?!-)/);
  });
});

describe("searching the Champions table", () => {
  const champions = stats.champions.map((c) => ({
    name: dd.champions[c.championName.toLowerCase()].name,
    group: <tbody key={c.championName} data-champion={c.championName} />,
  }));
  const rows = (query: string) =>
    renderToStaticMarkup(
      <ChampionRows head={<thead />} champions={champions} query={query} onClear={() => {}} />,
    );

  it("keeps only the champions whose name matches, however it's spelled", () => {
    const found = rows("kai sa");
    expect(found).toContain('data-champion="KaiSa"');
    expect(found).not.toContain('data-champion="Ahri"');
    // Players search the name they see, not Riot's id for it.
    expect(rows("wukong")).toContain('data-champion="MonkeyKing"');
  });

  it("shows every champion with nothing typed", () => {
    expect(rows("").match(/data-champion=/g)).toHaveLength(3);
  });

  it("shows the empty panel, with a way back, when nothing matches", () => {
    const none = rows("Teemo");
    expect(none).not.toContain("<table");
    expect(none).toContain("No champion matches “Teemo”");
    expect(none).toContain("Clear search");
  });
});
