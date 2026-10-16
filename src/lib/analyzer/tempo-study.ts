// The tempo study: checks the tempo timeline (tempo.ts) against real games.
// scripts/collect-tempo-games.ts downloads games into a local folder, and
// scripts/study-tempo.ts runs the checks in this file on them and prints a
// report. See docs/tempo.md for what was checked and what came out.
//
// Everything here is pure, like the rest of the analyzer: games in, numbers
// out, so each check has a unit test.

import type { Match, Timeline } from "@/lib/riot/types";
import { isAnalyzable } from "./index";
import { playedPosition } from "./matchup";
import { trimTimeline, type TrimmedTimeline } from "./trim";

// Where the collector saves games, one JSON file each. Git ignores .cache.
export const STUDY_FOLDER = ".cache/tempo-study";

// One downloaded game, with only what the study reads. No names or PUUIDs.
export type StudyGame = {
  matchId: string;
  region: string;
  // The rank of the player whose match history the game came from. The other
  // nine players are usually close to it.
  tier: string;
  patch: string; // "16.20"
  durationS: number;
  participants: StudyParticipant[];
  timeline: TrimmedTimeline;
  // A few per-minute numbers the site doesn't keep, so the study can test
  // whether they would help: extra[frame][participantId - 1].
  extra: StudyExtra[][];
};

export type StudyParticipant = {
  participantId: number;
  teamId: number;
  position: string; // "JUNGLE", ...
  championName: string;
  win: boolean;
};

export type StudyExtra = {
  health: number;
  healthMax: number;
  // Monsters only. The site's cs counts minions and monsters together.
  jungleCs: number;
};

// Ranked solo/duo games of 15 minutes or more with exactly one jungler on
// each side. Null for anything else.
export function toStudyGame(
  match: Match,
  timeline: Timeline,
  tier: string,
  region: string,
): StudyGame | null {
  if (match.info.queueId !== 420 || !isAnalyzable(match)) return null;
  const { participants } = match.info;
  const junglers = participants.filter((p) => playedPosition(p) === "JUNGLE");
  const sides = new Set(junglers.map((p) => p.teamId));
  if (junglers.length !== 2 || sides.size !== 2) return null;

  return {
    matchId: match.metadata.matchId,
    region,
    tier,
    patch: match.info.gameVersion.split(".").slice(0, 2).join("."),
    durationS: match.info.gameDuration,
    participants: participants.map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      position: playedPosition(p),
      championName: p.championName,
      win: p.win,
    })),
    timeline: trimTimeline(timeline),
    extra: timeline.info.frames.map((frame) =>
      Array.from({ length: 10 }, (_, i) => {
        const p = frame.participantFrames[String(i + 1)] as
          | (Record<string, unknown> & { jungleMinionsKilled?: number })
          | undefined;
        const stats = (p?.championStats ?? {}) as Record<string, unknown>;
        return {
          health: num(stats.health),
          healthMax: num(stats.healthMax),
          jungleCs: num(p?.jungleMinionsKilled),
        };
      }),
    ),
  };
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
