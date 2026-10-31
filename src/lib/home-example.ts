// What home's example game panel shows, worked out from one saved game.
// Kept apart from the database read (readSavedGame in match-store.ts) so it
// can be unit tested on the golden games.

import { analyzeMatch, findPlayerByRiotId } from "@/lib/analyzer";
import { describeDiff } from "@/lib/analyzer/describe";
import { formatClock } from "@/lib/analyzer/format";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import type { DiffPoint } from "@/lib/diff-chart";
import { formatDuration, gameDurationSeconds, positionName } from "@/lib/match-summary";
import type { Match } from "@/lib/riot/types";

export type HomeExample = {
  won: boolean;
  champion: string;
  opponent: string;
  // "Hide on bush#KR1 · 9/2/10 · Mid · 24:05", the line beside the title.
  details: string;
  gold: DiffPoint[];
  // Read aloud in place of the chart.
  description: string;
  // The turning point that moved the gold lead most, either way.
  turn: { minute: number; clock: string; title: string; detail: string; ahead: boolean } | null;
};

// Null when the player isn't in the game or has no opponent in their role,
// since then there's no chart to show.
export function summarizeExample(
  match: Match,
  timeline: TrimmedTimeline,
  riotId: { gameName: string; tagLine: string },
  label: (championName: string) => string = (name) => name,
): HomeExample | null {
  const me = findPlayerByRiotId(match, riotId.gameName, riotId.tagLine);
  if (!me) return null;
  const analysis = analyzeMatch(match, timeline, me.puuid, label);
  if (!analysis?.series || !analysis.opponent) return null;

  const biggest = analysis.turningPoints.reduce<(typeof analysis.turningPoints)[number] | null>(
    (best, t) => (!best || Math.abs(t.swing) > Math.abs(best.swing) ? t : best),
    null,
  );
  const opponent = label(analysis.opponent.championName);
  const details = [
    `${riotId.gameName}#${riotId.tagLine}`,
    `${me.kills}/${me.deaths}/${me.assists}`,
    positionName(me.teamPosition),
    formatDuration(gameDurationSeconds(match.info)),
  ].filter(Boolean);

  return {
    won: me.win,
    champion: label(me.championName),
    opponent,
    details: details.join(" · "),
    gold: analysis.series.gold,
    description: describeDiff(analysis.series.gold, `Gold difference against ${opponent}`),
    turn: biggest && {
      minute: biggest.timestamp / 60_000,
      clock: formatClock(biggest.timestamp),
      title: biggest.title,
      detail: biggest.detail,
      ahead: biggest.swing > 0,
    },
  };
}
