import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MatchSummary } from "@/lib/match-summary";
import { MatchRow } from "./match-row";

const game: MatchSummary = {
  matchId: "KR_1",
  queue: "Ranked Solo/Duo",
  startedAt: 0,
  durationS: 1800,
  remake: false,
  win: true,
  championName: "Ahri",
  position: "Mid",
  kills: 5,
  deaths: 1,
  assists: 7,
  kda: 12,
  cs: 250,
  csPerMin: 8.3,
  killParticipation: 0.6,
  items: [0, 0, 0, 0, 0, 0, 0],
  spells: [4, 14],
};

function render() {
  return renderToStaticMarkup(
    <ul>
      <MatchRow
        match={game}
        dd={null}
        now={2 * 60 * 60 * 1000}
        href="/player/kr/Faker-KR1/match/KR_1"
        teams={{
          region: "kr",
          players: [
            [{ name: "Faker", championName: "Ahri", isMe: true, riotId: { gameName: "Faker", tagLine: "KR1" } }],
            [{ name: "Chovy", championName: "Azir", isMe: false, riotId: { gameName: "Chovy", tagLine: "KR1" } }],
          ],
        }}
      />
    </ul>,
  );
}

describe("MatchRow", () => {
  it("opens the game's match page", () => {
    const link = render().match(/<a [^>]*href="\/player\/kr\/Faker-KR1\/match\/KR_1"[^>]*>/)?.[0];
    expect(link).toContain('aria-label="Open this Ahri game (Victory, 2h ago)"');
  });

  // The inline expand (Overview, Team analysis, Build, Runes) is gone.
  it("has no button to expand it in place", () => {
    expect(render()).not.toContain("<button");
  });

  it("keeps each player's name a link to their own profile", () => {
    expect(render()).toContain('href="/player/kr/Chovy-KR1"');
  });
});
