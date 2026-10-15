import { formatClock } from "@/lib/analyzer/format";
import { scoreGame } from "@/lib/game-score";
import { formatDuration, gameDurationSeconds, positionName } from "@/lib/match-summary";
import type { Match, Participant } from "@/lib/riot/types";
import { describeSwing, type MatchWinChance } from "@/lib/win-chance";

// Everything the shareable match card (the preview image Discord or X shows
// for a match link) says about one player's game. Kept apart from the image
// code so it can be tested like the rest of the analyzer.
export type MatchCard = {
  riotId: string;
  champion: string;
  // "Mid · 24:27"
  details: string;
  result: "Victory" | "Defeat" | "Remake";
  kda: string;
  // The 0 to 100 game score and MVP/ACE badge, when the game can be scored.
  score: { value: number; badge: "MVP" | "ACE" | null } | null;
  // The one minute that moved the win chance most, like
  // { clock: "27:10", from: 41, to: 68, title: "Your team took Baron" }.
  swing: { clock: string; from: number; to: number; title: string } | null;
  // Your team's win chance at every minute, 0 to 100, for the little graph.
  chances: number[];
};

export function matchCard(
  match: Match,
  me: Participant,
  // From the URL, so it reads exactly as the link someone shared.
  riotId: string,
  champion: string,
  winChance: MatchWinChance | null,
): MatchCard {
  const durationS = gameDurationSeconds(match.info);
  const remake = me.gameEndedInEarlySurrender ?? durationS < 5 * 60;
  const role = positionName(me.teamPosition);
  const score = scoreGame(match).get(me.participantId);

  // biggestSwings keeps them in time order, so pick the largest here.
  const swings = winChance?.swings ?? [];
  const biggest = swings.length
    ? swings.reduce((a, b) => (Math.abs(b.to - b.from) > Math.abs(a.to - a.from) ? b : a))
    : null;

  return {
    riotId,
    champion,
    details: [role, formatDuration(durationS)].filter(Boolean).join(" · "),
    result: remake ? "Remake" : me.win ? "Victory" : "Defeat",
    kda: `${me.kills} / ${me.deaths} / ${me.assists}`,
    score: score ? { value: score.score, badge: score.badge } : null,
    swing: biggest
      ? {
          clock: formatClock(biggest.timestamp),
          from: Math.round(biggest.from * 100),
          to: Math.round(biggest.to * 100),
          title: describeSwing(biggest).title,
        }
      : null,
    chances: winChance?.chances.map((c) => Math.round(c.chance * 100)) ?? [],
  };
}
