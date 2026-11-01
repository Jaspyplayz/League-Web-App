import Link from "next/link";
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
// items, game score and both teams' players. Render it inside a <ul>. The
// whole row is one link to the game's match page (`href`); the players' names
// inside it stay links to their own profiles.
export function MatchRow({
  match: m,
  dd,
  now,
  score,
  teams,
  badges = [],
  href,
  id,
}: {
  match: MatchSummary;
  dd: DataDragon | null;
  now: number; // the current time, for "2h ago"
  score?: PlayerScore; // missing for games that aren't scored, like ARAM
  teams?: { region: Region; players: [TeamPlayer[], TeamPlayer[]] };
  badges?: string[]; // highlights like "Double kill", from matchBadges()
  href: string; // the game's match page, e.g. "/player/na/Name-TAG/match/NA1_1"
  id?: string; // so "Show 10 more games" can scroll to the first new row
}) {
  // Victory and Defeat, like the game's own end screen.
  const result = m.remake ? "Remake" : m.win ? "Victory" : "Defeat";
  const resultColor = m.remake ? "text-quiet" : m.win ? "text-ahead" : "text-behind";
  // The champion portrait is framed in the result's color, so the list reads
  // at a glance: blue for a win, red for a loss.
  const portraitFrame = m.remake ? "border-divider" : m.win ? "border-ahead" : "border-behind";
  // The whole row is tinted and outlined in the result's color too, so wins
  // and losses stand apart when scanning the list.
  const tint = m.remake
    ? "border-divider bg-panel"
    : m.win
      ? "border-ahead/50 bg-ahead/10"
      : "border-behind/50 bg-behind/10";
  const champion = championName(dd, m.championName);

  return (
    // `relative`, so the link's cover below spreads over the whole row.
    <li id={id} className={`relative scroll-mt-4 rounded-md border ${tint} px-[18px] py-3.5`}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[18px] gap-y-3.5">
          <div className="flex w-[92px] shrink-0 flex-col text-xs whitespace-nowrap text-quiet">
            <span className={`text-sm font-semibold ${resultColor}`}>{result}</span>
            <span>{m.queue}</span>
            <span className="tabular-nums">
              {timeAgo(m.startedAt, now)} · {formatDuration(m.durationS)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 basis-[130px] items-center gap-3">
            <div className="flex shrink-0 gap-1">
              <ChampionIcon
                dd={dd}
                name={m.championName}
                size={48}
                className={`rounded-md border-2 ${portraitFrame}`}
              />
              <div className="flex flex-col gap-1">
                <SummonerSpellIcon dd={dd} spellId={m.spells[0]} size={22} className="rounded-sm" />
                <SummonerSpellIcon dd={dd} spellId={m.spells[1]} size={22} className="rounded-sm" />
              </div>
            </div>
            <div className="min-w-0">
              {/* The row's one link. Its ::after covers the whole row, so a
                  click anywhere opens the game, and a hover lightens the row.
                  The players' links further on sit above the cover. */}
              <Link
                href={href}
                aria-label={`Open this ${champion} game (${result}, ${timeAgo(m.startedAt, now)})`}
                className="block truncate font-semibold text-main after:absolute after:inset-0 after:rounded-md after:transition-colors after:duration-320 hover:after:bg-select hover:after:duration-120 focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-3 focus-visible:after:outline-ahead/45 motion-reduce:after:transition-none"
              >
                {champion}
              </Link>
              {m.position && <p className="text-note text-quiet">{m.position}</p>}
            </div>
          </div>

          <div className="w-[104px] shrink-0 whitespace-nowrap tabular-nums">
            <p>
              {m.kills} / {m.deaths} / {m.assists}
            </p>
            <p className="text-xs text-quiet">{m.kda.toFixed(1)} KDA</p>
            {badges.length > 0 && (
              <ul aria-label="Highlights" className="mt-1 flex flex-wrap gap-1">
                {badges.map((badge) => (
                  <li
                    key={badge}
                    className="rounded-sm border border-ahead-soft px-1.5 text-xs whitespace-nowrap text-ahead-soft"
                  >
                    {badge}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="w-[84px] shrink-0 whitespace-nowrap tabular-nums">
            <p>{m.cs} CS</p>
            <p className="text-xs text-quiet">{m.csPerMin.toFixed(1)}/min</p>
          </div>

          {/* The score and items sit above the link's cover too, so hovering
              them still shows what helped the score and each item's name. */}
          {score && (
            <div className="relative z-10 flex w-[72px] shrink-0 flex-col gap-1">
              <GameScore score={score} size="lg" />
              {/* The 0 to 100 score as ten blocks, like a health bar. */}
              <SegmentBar
                filled={score.score / 100}
                segments={10}
                on={m.win ? "bg-ahead" : "bg-behind"}
                className="h-1.5 w-full gap-[2px]"
                label={`Score ${score.score} out of 100`}
              />
              <p className="text-xs text-quiet">Score</p>
            </div>
          )}

          <div className="relative z-10">
            <ItemSlots dd={dd} items={m.items} />
          </div>

          {teams && <Teams dd={dd} region={teams.region} players={teams.players} />}
        </div>
        <Chevron />
      </div>
    </li>
  );
}

// Points right, to say the row opens a page.
function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-quiet"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Two columns of five, blue side on the left, like op.gg. Hidden on phones,
// where the row has no room for them; the match page shows everyone.
// `relative z-10` lifts the names above the row link's cover, so each one
// still opens that player's profile; `pointer-events-none` lets a click in
// the gaps between names fall through to the cover and open the game.
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
    <div className="pointer-events-none relative z-10 ml-auto hidden shrink-0 gap-3 sm:flex">
      {players.map((team, side) => (
        <ul
          key={side}
          aria-label={side === 0 ? "Blue side" : "Red side"}
          className="flex w-[108px] flex-col gap-0.5 text-xs"
        >
          {team.map((p, i) => {
            const inner = (
              <>
                <ChampionIcon dd={dd} name={p.championName} size={16} className="rounded-sm" />
                <span className="truncate">{p.name}</span>
              </>
            );
            const look = `flex min-w-0 items-center gap-1.5 ${p.isMe ? "font-semibold text-main" : "text-quiet"}`;
            return (
              <li key={i}>
                {p.riotId ? (
                  <Link
                    href={`/player/${region}/${toSlug(p.riotId)}`}
                    title={`${p.riotId.gameName}#${p.riotId.tagLine}`}
                    className={`${look} pointer-events-auto hover:text-main hover:underline`}
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
