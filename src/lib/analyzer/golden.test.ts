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
import { matchWinChance } from "@/lib/win-chance";
import closeGame from "./fixtures/close.json";
import comebackGame from "./fixtures/comeback.json";
import remakeGame from "./fixtures/remake.json";
import stompGame from "./fixtures/stomp.json";
import { formatClock } from "./format";
import { analyzeMatch, isAnalyzable, type MatchAnalysis } from "./index";
import type { Snapshot } from "./matchup";
import { GRADES, playSwing, replayChances, type Grade, type Play } from "./plays";
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

// Each turning point as the stretch of game clock it covers, and who gained
// gold in it.
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

describe("anonymized", () => {
  // The repo is public, so no fixture may point at a real player or game.
  // These are the fields fixtures/README.md says were replaced, read from the
  // files as they are, including ones the site's Match type leaves out.
  type SavedIds = {
    metadata: { matchId: string; participants: string[] };
    info: {
      gameId: number;
      gameName: string;
      gameCreation: number;
      participants: {
        participantId: number;
        puuid: string;
        riotIdGameName: string;
        riotIdTagline: string;
        summonerName: string;
        summonerId: string;
        profileIcon: number;
        summonerLevel: number;
      }[];
    };
  };
  const fixtures = { stomp: stompGame, comeback: comebackGame, close: closeGame, remake: remakeGame };

  for (const [name, game] of Object.entries(fixtures)) {
    it(`leaves no real names or IDs in ${name}.json`, () => {
      const { metadata, info } = game.match as SavedIds;
      expect(metadata.matchId).toMatch(/^GOLDEN_[A-Z]+$/);
      expect(info.gameId).toBe(0);
      expect(info.gameName).toBe("");
      expect(info.gameCreation).toBe(Date.UTC(2026, 0, 1));
      expect(metadata.participants).toEqual(
        info.participants.map((p) => `golden-player-${p.participantId}`),
      );
      for (const p of info.participants) {
        expect(p.puuid).toBe(`golden-player-${p.participantId}`);
        expect(p.riotIdGameName).toBe(`Player ${p.participantId}`);
        expect(p.riotIdTagline).toBe("GOLD");
        expect([p.summonerName, p.summonerId]).toEqual(["", ""]);
        expect([p.profileIcon, p.summonerLevel]).toEqual([0, 0]);
      }
      // A real PUUID is 78 letters, digits, - and _. Nothing that long is
      // left anywhere in the file, timeline included.
      expect(JSON.stringify(game)).not.toMatch(/[\w-]{78}/);
    });
  }
});

describe("play grades", () => {
  // The replay's graded plays from one player's side, with the base win
  // chance model (no rank). The thresholds in plays.ts were picked on these
  // games (decision record 0023), so a change to them, to how plays are
  // grouped, or to the model shows here.
  function playsOf(game: Game, participantId: number): Play[] {
    const analysis = analyze(game, participantId);
    const me = game.match.info.participants.find((p) => p.participantId === participantId)!;
    const winChance = matchWinChance(game.match, game.timeline, me.teamId, null);
    if (!winChance) throw new Error("No win chance for this game");
    return replayChances(game.timeline, analysis.replay, winChance.model, participantId)!.plays;
  }

  // How many of the plays they were in got each grade.
  function gradeCounts(game: Game, participantId: number): Record<Grade, number> {
    const mine = playsOf(game, participantId).filter((play) => play.mine);
    return counts(...GRADES.map((grade) => mine.filter((play) => play.grade === grade).length));
  }
  const counts = (...n: number[]) =>
    Object.fromEntries(GRADES.map((grade, i) => [grade, n[i]])) as Record<Grade, number>;

  it("grades each jungler's plays, with no Brilliant in any of them", () => {
    //                                                 Bri Gre Exc Goo Eve Ina Mis Blu
    expect(gradeCounts(closeGame as Game, 2)).toEqual(counts(0, 1, 7, 4, 3, 0, 0, 2));
    expect(gradeCounts(closeGame as Game, 7)).toEqual(counts(0, 2, 1, 4, 0, 4, 6, 1));
    expect(gradeCounts(comebackGame as Game, 2)).toEqual(counts(0, 2, 5, 3, 1, 1, 2, 0));
    expect(gradeCounts(comebackGame as Game, 7)).toEqual(counts(0, 0, 5, 5, 0, 4, 1, 2));
    expect(gradeCounts(stompGame as Game, 2)).toEqual(counts(0, 0, 0, 0, 2, 4, 0, 0));
    expect(gradeCounts(stompGame as Game, 7)).toEqual(counts(0, 0, 0, 5, 2, 0, 0, 0));
  });

  it("gives the comeback's Baron fight a Great from one side and a Blunder from the other", () => {
    const at2510 = (participantId: number) => {
      const plays = playsOf(comebackGame as Game, participantId);
      const play = plays.find((p) => formatClock(p.from) === "25:10")!;
      return { grade: play.grade, swing: playSwing(play) };
    };
    expect(at2510(2)).toEqual({ grade: "Great", swing: 37.1 });
    expect(at2510(7)).toEqual({ grade: "Blunder", swing: -37.1 });
  });
});
