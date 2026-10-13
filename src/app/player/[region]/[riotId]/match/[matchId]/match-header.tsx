import { ChampionIcon } from "@/components/game-icons";
import { formatSigned } from "@/lib/analyzer/format";
import type { Snapshot } from "@/lib/analyzer/matchup";
import { playedPosition } from "@/lib/analyzer/matchup";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatDuration, gameDurationSeconds, queueName, timeAgo } from "@/lib/match-summary";
import type { Match, Participant } from "@/lib/riot/types";

const POSITION_NAMES: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

// Result, queue, length and kill score: the top of the page.
export function MatchHeader({ match, me, now }: { match: Match; me: Participant; now: number }) {
  const { info } = match;
  const durationS = gameDurationSeconds(info);
  const remake = me.gameEndedInEarlySurrender ?? durationS < 5 * 60;
  const kills = (teamId: number) =>
    info.participants.filter((p) => p.teamId === teamId).reduce((sum, p) => sum + p.kills, 0);
  const enemyTeamId = me.teamId === 100 ? 200 : 100;
  // "16.20.712.3456" -> "16.20"
  const patch = info.gameVersion.split(".").slice(0, 2).join(".");

  const result = remake ? "Remake" : me.win ? "Victory" : "Defeat";
  const resultColor = remake ? "text-faint" : me.win ? "text-ahead" : "text-behind";

  return (
    <section
      aria-label="Match summary"
      className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4"
    >
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[13px] text-faint">
          {queueName(info.queueId)} · {formatDuration(durationS)} · Patch {patch} ·{" "}
          {timeAgo(info.gameStartTimestamp, now)}
        </p>
        <h1
          className={`font-display text-[clamp(52px,8vw,72px)] font-bold uppercase leading-[0.95] tracking-[0.01em] ${resultColor}`}
        >
          {result}
        </h1>
      </div>
      <p className="flex items-center gap-4 font-display text-[40px] font-bold leading-none">
        <span className="font-mono text-xs font-normal uppercase tracking-[0.12em] text-faint">
          Kills
        </span>
        <span className="text-ahead">{kills(me.teamId)}</span>
        <span className="text-placeholder" aria-label="to">
          –
        </span>
        <span>{kills(enemyTeamId)}</span>
      </p>
    </section>
  );
}

// "You vs your opponent" panel with a verdict in the middle.
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
    <section
      aria-label="Matchup"
      className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-[18px] border border-line-strong bg-surface p-6"
    >
      <PlayerSide dd={dd} player={me} side="you" />
      <Verdict at15={at15} finalGoldDiff={finalGoldDiff} hasOpponent={opponent !== null} />
      {opponent ? (
        <PlayerSide dd={dd} player={opponent} side="opponent" />
      ) : (
        <p className="flex-[1_1_260px] text-right text-muted">
          No single enemy played your role this game, so there&apos;s no head-to-head comparison.
        </p>
      )}
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
    even: "border-line-strong bg-page text-muted",
  }[tone];

  return (
    <div className="flex flex-[0_1_auto] flex-col items-center gap-2 text-center max-sm:basis-full">
      <span
        className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${pill}`}
      >
        {text}
      </span>
      <span className="text-sm text-muted">
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

  const text = (
    <div className={isYou ? "" : "text-right"}>
      <p
        className={`font-mono text-[11px] uppercase tracking-[0.12em] ${isYou ? "text-ahead-soft" : "text-behind"}`}
      >
        {isYou ? "You" : "Your opponent"}
      </p>
      <p className="text-lg font-semibold">
        {championName(dd, p.championName)}{" "}
        <span className="text-[15px] font-normal text-faint">
          {[riotName, position].filter(Boolean).join(" · ")}
        </span>
      </p>
      <p className="font-mono text-[15px] text-ink-soft">
        {p.kills} / {p.deaths} / {p.assists} · {p.totalMinionsKilled + p.neutralMinionsKilled} CS
      </p>
    </div>
  );

  return (
    <div className={`flex flex-[1_1_260px] items-center gap-4 ${isYou ? "" : "justify-end"}`}>
      {isYou && <Portrait dd={dd} name={p.championName} tone="ahead" />}
      {text}
      {!isYou && <Portrait dd={dd} name={p.championName} tone="behind" />}
    </div>
  );
}

function Portrait({
  dd,
  name,
  tone,
}: {
  dd: DataDragon | null;
  name: string;
  tone: "ahead" | "behind";
}) {
  return (
    <ChampionIcon
      dd={dd}
      name={name}
      size={64}
      className={`rounded-2xl border-2 ${tone === "ahead" ? "border-ahead" : "border-behind"}`}
    />
  );
}
