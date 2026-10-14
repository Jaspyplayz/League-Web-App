import Link from "next/link";
import type { ReactNode } from "react";
import { ExpandableRow } from "@/components/expandable-row";
import { ChampionIcon, ItemSlots, SummonerSpellIcon } from "@/components/game-icons";
import { GameScore } from "@/components/game-score";
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
}: {
  match: MatchSummary;
  dd: DataDragon | null;
  now: number; // the current time, for "2h ago"
  score?: PlayerScore; // missing for games that aren't scored, like ARAM
  teams?: { region: Region; players: [TeamPlayer[], TeamPlayer[]] };
  badges?: string[]; // highlights like "Double kill", from matchBadges()
  details?: ReactNode;
}) {
  const result = m.remake ? "Remake" : m.win ? "Win" : "Loss";
  const resultColor = m.remake ? "text-faint" : m.win ? "text-ahead" : "text-behind";
  // A colored edge on the left shows the result at a glance, like op.gg's
  // blue and red rows: blue for a win, red for a loss.
  const edge = m.remake ? "border-l-line-strong" : m.win ? "border-l-ahead" : "border-l-behind";
  const box = `rounded-[14px] border border-l-4 border-line-strong ${edge} bg-surface px-[18px] py-3.5`;

  const content = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[18px] gap-y-3.5">
      <div className="flex w-[92px] shrink-0 flex-col text-xs whitespace-nowrap text-faint">
        <span className={`font-display text-xl font-bold tracking-wider uppercase ${resultColor}`}>
          {result}
        </span>
        <span>{m.queue}</span>
        <span className="font-mono">
          {timeAgo(m.startedAt, now)} · {formatDuration(m.durationS)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 basis-[130px] items-center gap-3">
        <div className="flex shrink-0 gap-1">
          <ChampionIcon dd={dd} name={m.championName} size={48} />
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
                className="rounded-full border border-ahead-soft px-1.5 text-[10px] whitespace-nowrap text-ahead-soft"
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
        <div className="w-[72px] shrink-0">
          <GameScore score={score} size="lg" />
          <p className="text-xs text-faint">Score</p>
        </div>
      )}

      <ItemSlots dd={dd} items={m.items} />

      {teams && <Teams dd={dd} region={teams.region} players={teams.players} />}
    </div>
  );

  return (
    <li>
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
