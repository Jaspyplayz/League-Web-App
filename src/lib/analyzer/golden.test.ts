// Golden tests: the analyzer run on real recorded games, to check that it
// gives sensible answers on real data and not only on the small made-up games
// in test-fixtures.ts. fixtures/README.md says why each game was picked and
// how the players in it were anonymized.
//
// Each analyzed game is seen from a jungler's point of view. The expected
// values are what the analyzer gave when the games were saved, each checked by
// hand against the gold numbers. If a change to the analyzer makes one fail,
// first check that the new answer still makes sense for that game, then
// update the value.

import { describe, expect, it } from "vitest";
import type { Match } from "@/lib/riot/types";
import closeGame from "./fixtures/close.json";
import comebackGame from "./fixtures/comeback.json";
import remakeGame from "./fixtures/remake.json";
import stompGame from "./fixtures/stomp.json";
import { formatClock } from "./format";
import { analyzeMatch, isAnalyzable, type MatchAnalysis } from "./index";
import type { Snapshot } from "./matchup";
import type { TrimmedTimeline } from "./trim";

// A saved game: Riot's match data and the timeline as the site stores it.
// TypeScript works out a JSON import's type from the file itself, so each
// fixture is told what it holds with `as Game`.
type Game = { match: Match; timeline: TrimmedTimeline };

// The fixtures' PUUIDs were replaced with "golden-player-<participantId>".
// Participants 1 to 5 are blue side, 6 to 10 red side, and 2 and 7 are the
// junglers in all of these games.
function analyze(game: Game, participantId: number): MatchAnalysis {
  const analysis = analyzeMatch(game.match, game.timeline, `golden-player-${participantId}`);
  if (!analysis) throw new Error(`Participant ${participantId} isn't in this game`);
  return analysis;
}

// Your gold minus your opponent's: above 0 means you're ahead.
function goldLead(snapshot: Snapshot | null): number | null {
  return snapshot ? snapshot.you.gold - snapshot.opponent.gold : null;
}

// The turning points as the match page shows them: the stretch of game clock
// each one covers, and who gained gold in it.
function windows(analysis: MatchAnalysis) {
  return analysis.turningPoints.map((p) => ({
    from: formatClock(p.startMs),
    to: formatClock(p.endMs),
    gained: p.swing > 0 ? "you" : "opponent",
  }));
}

// Your team's gold minus the enemy team's, once a minute.
function teamLead(analysis: MatchAnalysis): number[] {
  return analysis.teamGold.map((p) => p.diff);
}

describe("stomp", () => {
  // Red was ahead from the first minute and blue surrendered at 15:16, as soon
  // as the game allows. Seen from Talon, red's jungler, who went 6/0/2 while
  // Graves died 7 times.
  const analysis = analyze(stompGame as Game, 7);

  it("has red ahead in team gold at every minute after the start", () => {
    expect(teamLead(analysis).slice(1).every((lead) => lead > 0)).toBe(true);
  });

  it("has Talon ahead of Graves at 10 and 15 minutes", () => {
    expect(analysis.opponent?.championName).toBe("Graves");
    expect(goldLead(analysis.at10)).toBe(1712);
    expect(goldLead(analysis.at15)).toBe(3378);
  });

  it("picks the two stretches where Talon pulled further ahead", () => {
    expect(windows(analysis)).toEqual([
      { from: "6:00", to: "10:00", gained: "you" },
      { from: "11:00", to: "15:00", gained: "you" },
    ]);
  });
});

describe("comeback", () => {
  // The biggest comeback saved: blue was 8,401 gold behind as a team at 21:00,
  // won fights at 22 and 25 minutes, took Baron, and red surrendered at 32:58.
  // Seen from Naafiri, blue's jungler.
  const analysis = analyze(comebackGame as Game, 2);

  it("has blue win from 8,401 gold behind", () => {
    expect(Math.min(...teamLead(analysis))).toBe(-8401);
    expect(analysis.me.win).toBe(true);
  });

  it("has Naafiri behind Qiyana at 10 minutes and just ahead at 15", () => {
    expect(analysis.opponent?.championName).toBe("Qiyana");
    expect(goldLead(analysis.at10)).toBe(-719);
    expect(goldLead(analysis.at15)).toBe(78);
  });

  it("picks the fights that won the game back", () => {
    expect(windows(analysis)).toEqual([
      { from: "21:00", to: "23:00", gained: "you" },
      { from: "25:00", to: "29:00", gained: "you" },
      // The last frame is the end of the game, so this one is under a minute.
      { from: "32:00", to: "32:58", gained: "you" },
    ]);
  });
});

describe("close game", () => {
  // The closest saved game of 25 minutes or more: neither team was ever more
  // than 3,337 gold ahead, and the lead changed sides several times before red
  // surrendered at 32:53. Seen from Elise, red's jungler, so one of these games
  // has turning points that went against you.
  const analysis = analyze(closeGame as Game, 7);

  it("never has either team more than 3,337 gold ahead", () => {
    expect(Math.max(...teamLead(analysis).map((lead) => Math.abs(lead)))).toBe(3337);
  });

  it("has Elise just ahead of Qiyana at 10 minutes and behind at 15", () => {
    expect(analysis.opponent?.championName).toBe("Qiyana");
    expect(goldLead(analysis.at10)).toBe(135);
    expect(goldLead(analysis.at15)).toBe(-703);
  });

  it("picks the stretches where Qiyana pulled ahead", () => {
    expect(windows(analysis)).toEqual([
      { from: "10:00", to: "14:00", gained: "opponent" },
      { from: "22:00", to: "26:00", gained: "opponent" },
      { from: "30:00", to: "32:00", gained: "opponent" },
    ]);
  });
});

describe("remake", () => {
  // The shortest saved game: blue's bot laner was AFK, so blue voted to remake
  // at 1:05. The site shows only the scoreboard for games under 15 minutes and
  // never downloads their timeline, so this fixture has none.
  it("is too short to analyze", () => {
    expect(isAnalyzable(remakeGame.match as Match)).toBe(false);
  });
});
