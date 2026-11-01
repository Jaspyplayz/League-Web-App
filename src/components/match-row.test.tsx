import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerScore } from "@/lib/analyzer/score";
import type { MatchSummary } from "@/lib/match-summary";
import { MatchRow, shortReason } from "./match-row";

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

const score: PlayerScore = {
  participantId: 1,
  score: 78,
  badge: "MVP",
  strengths: ["strong KDA"],
  weakness: "little objective damage",
};

function render(match: MatchSummary = game, gameScore?: PlayerScore) {
  return renderToStaticMarkup(
    <ul>
      <MatchRow
        match={match}
        score={gameScore}
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
    expect(link).toContain('aria-label="Open this Ahri game (Win, 2h ago)"');
  });

  it("says Win or Loss, as the mockup does", () => {
    expect(render()).toContain(">Win</span>");
    expect(render({ ...game, win: false })).toContain(">Loss</span>");
  });

  // Blue at 10% for a win and red for a loss, 7% in light, with no outline.
  it("tints the row by its result", () => {
    expect(render()).toContain("bg-ahead/10 light:bg-ahead/7");
    expect(render({ ...game, win: false })).toContain("bg-behind/10 light:bg-behind/7");
    expect(render({ ...game, remake: true })).not.toMatch(/bg-(ahead|behind)\//);
    expect(render()).not.toContain("border-ahead");
  });

  // The row's link covers it, which hides hover titles, so the reason is
  // written out beside the score.
  it("writes the score's reason in one line, and in full for screen readers", () => {
    const html = render(game, score);
    expect(html).toContain('aria-label="Game score 78 out of 100"');
    expect(html).toMatch(/aria-hidden="true"[^>]*truncate[^>]*>MVP · Helped by strong KDA</);
    expect(html).toContain('class="sr-only">Helped by strong KDA. Held back by little objective damage.<');
  });

  it("names what held the score back when nothing helped", () => {
    expect(shortReason({ ...score, badge: null, strengths: [] })).toBe("Held back by little objective damage");
  });

  // Ranked games are scored, so a remake's missing score isn't the mode's fault.
  it("says why a game has no score without blaming the mode", () => {
    expect(render({ ...game, remake: true })).toContain("No score for a remake");
    expect(render()).toContain("No game score for this game");
    expect(render({ ...game, remake: true })).not.toContain("this mode");
  });

  // JAS-87's row has no spells or items; the match page shows them.
  it("leaves the items to the match page", () => {
    expect(render()).not.toContain('aria-label="Items"');
  });

  // The inline expand (Overview, Team analysis, Build, Runes) is gone.
  it("has no button to expand it in place", () => {
    expect(render()).not.toContain("<button");
  });

  it("keeps each player's name a link to their own profile", () => {
    expect(render()).toContain('href="/player/kr/Chovy-KR1"');
  });
});
