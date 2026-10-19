import Link from "next/link";
import type { ReactNode } from "react";
import { ExpandableRow } from "@/components/expandable-row";
import { ChampionIcon, ItemSlots, SummonerSpellIcon } from "@/components/game-icons";
import { GameScore } from "@/components/game-score";
import { SegmentBar } from "@/components/ui/segment-bar";
import type { PlayerScore } from "@/lib/analyzer/score";
import { championName, type DataDragon } from "@/lib/ddragon";
import {
  formatDuration,
  timeAgo,
  type MatchSummary,
  type TeamPlayer,
} from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import { toSlug } from "@/lib/riot-id";

// One game in the player's match list: result, champion and spells, KDA, CS,
// items, game score and both teams' players (each linking to their profile). Render it inside a <ul>. Pass `details` (for example both
// teams' scoreboard) to make the row open a panel with it when clicked;
// without it the row is plain content.
export function MatchRow({
  match: m,
  dd,
  now,
  score,
  teams,
  badges = [],
  details,
  id,
}: {
  match: MatchSummary;
  dd: DataDragon | null;
  now: number; // the current time, for "2h ago"
  score?: PlayerScore; // missing for games that aren't scored, like ARAM
  teams?: { region: Region; players: [TeamPlayer[], TeamPlayer[]] };
  badges?: string[]; // highlights like "Double kill", from matchBadges()
  details?: ReactNode;
  id?: string; // so "Show 10 more games" can scroll to the first new row
}) {
  // VICTORY and DEFEAT, like the game's own end screen.
  const result = m.remake ? "Remake" : m.win ? "Victory" : "Defeat";
  const resultColor = m.remake ? "text-faint" : m.win ? "text-ahead" : "text-behind";
  // The champion portrait is framed in the result's color, so the list reads
  // at a glance: blue for a win, red for a loss.
  const portraitFrame = m.remake ? "border-line-strong" : m.win ? "border-ahead" : "border-behind";
  // The whole row is tinted and outlined in the result's color too, so wins
  // and losses stand apart when scanning the list.
  const tint = m.remake
    ? "border-line-strong bg-surface"
    : m.win
      ? "border-ahead/50 bg-ahead/10"
      : "border-behind/50 bg-behind/10";
  const box = `hud-cut border ${tint} px-[18px] py-3.5`;

  const content = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[18px] gap-y-3.5">
      <div className="flex w-[92px] shrink-0 flex-col text-xs whitespace-nowrap text-faint">
        <span className={`font-mono text-sm font-semibold tracking-[0.14em] uppercase ${resultColor}`}>
          {result}
        </span>
        <span>{m.queue}</span>
        <span className="font-mono">
          {timeAgo(m.startedAt, now)} · {formatDuration(m.durationS)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 basis-[130px] items-center gap-3">
        <div className="flex shrink-0 gap-1">
          <ChampionIcon
            dd={dd}
            name={m.championName}
            size={48}
            className={`hud-cut-sm border-2 ${portraitFrame}`}
          />
          <div className="flex flex-col gap-1">
            <SummonerSpellIcon dd={dd} spellId={m.spells[0]} size={22} />
            <SummonerSpellIcon dd={dd} spellId={m.spells[1]} size={22} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{championName(dd, m.championName)}</p>
          {m.position && <p className="text-[13px] text-faint">{m.position}</p>}
        </div>
      </div>

      <div className="w-[104px] shrink-0 font-mono whitespace-nowrap">
        <p>
          {m.kills} / {m.deaths} / {m.assists}
        </p>
        <p className="text-xs text-faint">{m.kda.toFixed(1)} KDA</p>
        {badges.length > 0 && (
          <ul aria-label="Highlights" className="mt-1 flex flex-wrap gap-1 font-sans">
            {badges.map((badge) => (
              <li
                key={badge}
                className="hud-cut-sm border border-ahead-soft px-1.5 text-[10px] whitespace-nowrap text-ahead-soft"
              >
                {badge}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-[84px] shrink-0 font-mono whitespace-nowrap">
        <p>{m.cs} CS</p>
        <p className="text-xs text-faint">{m.csPerMin.toFixed(1)}/min</p>
      </div>

      {score && (
        <div className="flex w-[72px] shrink-0 flex-col gap-1">
          <GameScore score={score} size="lg" />
          {/* The 0 to 100 score as ten blocks, like a health bar. */}
          <SegmentBar
            filled={score.score / 100}
            segments={10}
            on={m.win ? "bg-ahead" : "bg-behind"}
            className="h-1.5 w-full gap-[2px]"
            label={`Score ${score.score} out of 100`}
          />
          <p className="text-xs text-faint">Score</p>
        </div>
      )}

      <ItemSlots dd={dd} items={m.items} />

      {teams && <Teams dd={dd} region={teams.region} players={teams.players} />}
    </div>
  );

  return (
    <li id={id} className="scroll-mt-4">
      {details ? (
        <ExpandableRow
          row={content}
          rowClassName={box}
          label={`details for this ${championName(dd, m.championName)} game`}
        >
          {details}
        </ExpandableRow>
      ) : (
        <div className={box}>{content}</div>
      )}
    </li>
  );
}

// Two columns of five, blue side on the left, like op.gg. Hidden on phones,
// where the row has no room for them; the panel under the row shows everyone.
function Teams({
  dd,
  region,
  players,
}: {
  dd: DataDragon | null;
  region: Region;
  players: [TeamPlayer[], TeamPlayer[]];
}) {
  return (
    <div className="ml-auto hidden shrink-0 gap-3 sm:flex">
      {players.map((team, side) => (
        <ul
          key={side}
          aria-label={side === 0 ? "Blue side" : "Red side"}
          className="flex w-[108px] flex-col gap-0.5 text-xs"
        >
          {team.map((p, i) => {
            const inner = (
              <>
                <ChampionIcon dd={dd} name={p.championName} size={16} className="rounded-[4px]" />
                <span className="truncate">{p.name}</span>
              </>
            );
            const look = `flex min-w-0 items-center gap-1.5 ${p.isMe ? "font-semibold text-ink" : "text-faint"}`;
            return (
              <li key={i}>
                {p.riotId ? (
                  <Link
                    href={`/player/${region}/${toSlug(p.riotId)}`}
                    title={`${p.riotId.gameName}#${p.riotId.tagLine}`}
                    className={`${look} hover:text-ink hover:underline`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span className={look}>{inner}</span>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
