import { ChampionIcon } from "@/components/game-icons";
import { formatSigned } from "@/lib/analyzer/format";
import type { Snapshot } from "@/lib/analyzer/matchup";
import { findOpponent, playedPosition } from "@/lib/analyzer/matchup";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatDuration, gameDurationSeconds, queueName, timeAgo } from "@/lib/match-summary";
import type { Match, Participant } from "@/lib/riot/types";

export const POSITION_NAMES: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

// The top of the page: "Victory as Syndra vs Zoe", the result in blue or red,
// then your KDA, role, queue, length, patch and when it was played.
export function MatchHeader({
  match,
  me,
  dd,
  now,
}: {
  match: Match;
  me: Participant;
  dd: DataDragon | null;
  now: number;
}) {
  const { info } = match;
  const durationS = gameDurationSeconds(info);
  const remake = me.gameEndedInEarlySurrender ?? durationS < 5 * 60;
  const opponent = findOpponent(info.participants, me);
  const position = POSITION_NAMES[playedPosition(me)];
  // "16.20.712.3456" -> "16.20"
  const patch = info.gameVersion.split(".").slice(0, 2).join(".");

  const result = remake ? "Remake" : me.win ? "Victory" : "Defeat";
  const resultColor = remake ? "text-quiet" : me.win ? "text-ahead" : "text-behind";

  return (
    <section
      aria-label="Match summary"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
    >
      <h1 className="text-title font-semibold">
        <span className={resultColor}>{result}</span> as {championName(dd, me.championName)}
        {opponent && (
          <span className="text-quiet"> vs {championName(dd, opponent.championName)}</span>
        )}
      </h1>
      <p className="text-quiet tabular-nums">
        {[
          `${me.kills}/${me.deaths}/${me.assists}`,
          position,
          queueName(info.queueId),
          formatDuration(durationS),
          `Patch ${patch}`,
          timeAgo(info.gameStartTimestamp, now),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </section>
  );
}

// "You vs your opponent": both players and a verdict, stacked in the Summary's
// narrow column: verdict on top, then you, then your opponent. With nobody else
// in your role there's no verdict or opponent, and the board says why.
export function Matchup({
  dd,
  me,
  opponent,
  at15,
  finalGoldDiff,
}: {
  dd: DataDragon | null;
  me: Participant;
  opponent: Participant | null;
  at15: Snapshot | null;
  finalGoldDiff: number | null;
}) {
  return (
    <section aria-label="Matchup" className="min-w-0 p-5">
      <div className="flex flex-col gap-4">
        <PlayerSide dd={dd} player={me} side="you" />
        <Verdict at15={at15} finalGoldDiff={finalGoldDiff} hasOpponent={opponent !== null} />
        {opponent && <PlayerSide dd={dd} player={opponent} side="opponent" />}
      </div>
    </section>
  );
}

// Won at 15 if 500+ gold ahead, lost if 500+ behind. Falls back to the end of
// the game for games that ended before 15 minutes.
const VERDICT_MARGIN = 500;

function Verdict({
  at15,
  finalGoldDiff,
  hasOpponent,
}: {
  at15: Snapshot | null;
  finalGoldDiff: number | null;
  hasOpponent: boolean;
}) {
  if (!hasOpponent) return null;
  const diff = at15 ? at15.you.gold - at15.opponent.gold : finalGoldDiff;
  if (diff === null) return null;

  const tone =
    diff >= VERDICT_MARGIN ? "ahead" : diff <= -VERDICT_MARGIN ? "behind" : ("even" as const);
  const text = { ahead: "Won the matchup", behind: "Lost the matchup", even: "Even matchup" }[tone];
  const pill = {
    ahead: "border-ahead/40 bg-ahead/10 text-ahead-soft",
    behind: "border-behind/40 bg-behind/10 text-behind",
    even: "border-divider bg-page text-quiet",
  }[tone];

  return (
    <div className="order-first flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className={`rounded-full border px-3 py-1 text-note font-medium ${pill}`}>{text}</span>
      <span className="text-sm text-quiet tabular-nums">
        {formatSigned(diff)} gold {at15 ? "at 15 min" : "at the end"}
      </span>
    </div>
  );
}

function PlayerSide({
  dd,
  player: p,
  side,
}: {
  dd: DataDragon | null;
  player: Participant;
  side: "you" | "opponent";
}) {
  const isYou = side === "you";
  const position = POSITION_NAMES[playedPosition(p)];
  const riotName = p.riotIdGameName ?? "";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <ChampionIcon
        dd={dd}
        name={p.championName}
        size={48}
        className={`flex-none rounded-md border-2 ${isYou ? "border-ahead" : "border-behind"}`}
      />
      <div className="min-w-0">
        <p className={`text-note font-medium ${isYou ? "text-ahead-soft" : "text-behind"}`}>
          {isYou ? "You" : "Your opponent"}
        </p>
        <p className="font-semibold">
          {championName(dd, p.championName)}{" "}
          <span className="text-note font-normal text-quiet">
            {[riotName, position].filter(Boolean).join(" · ")}
          </span>
        </p>
        <p className="text-note tabular-nums">
          {p.kills} / {p.deaths} / {p.assists} · {p.totalMinionsKilled + p.neutralMinionsKilled} CS
        </p>
      </div>
    </div>
  );
}
