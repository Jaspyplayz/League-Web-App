import Link from "next/link";
import { ChampionIcon } from "@/components/game-icons";
import { scoreReason } from "@/components/game-score";
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

// One game in the player's match list (JAS-87): the result, the champion, the
// KDA, the game score with its reason, and both teams. Render it inside a
// <ul> marked `@container`: the row lays itself out by the list's width, not
// the screen's, because the list shares the screen with the side column.
//   - under 576px (phones): two lines, the champion, KDA and score, then
//     the result, queue and time;
//   - 576px and up: one line, with the score's reason;
//   - 768px and up: the ten players too.
// The whole row is one link to the game's match page (`href`); the players'
// names inside it stay links to their own profiles.
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
  const result = m.remake ? "Remake" : m.win ? "Win" : "Loss";
  const resultColor = m.remake ? "text-quiet" : m.win ? "text-ahead" : "text-behind";
  // A win is tinted blue and a loss red, over the panel colour: 10% in dark,
  // 7% in light, where the same tint looks stronger. A remake stays plain.
  const tint = m.remake ? "" : m.win ? "bg-ahead/10 light:bg-ahead/7" : "bg-behind/10 light:bg-behind/7";
  const champion = championName(dd, m.championName);

  return (
    // `group`, so hovering anywhere on the row lights up its name and chevron.
    // `relative`, so the link's cover below spreads over the whole row.
    <li id={id} className="group relative scroll-mt-4 rounded-md bg-panel">
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 rounded-md p-3 @xl:grid-cols-[76px_140px_112px_minmax(0,1fr)_16px] @xl:px-3.5 @3xl:grid-cols-[76px_140px_112px_minmax(0,1fr)_176px_16px] ${tint}`}
      >
        {/* Every part sits on the first line except the result, which drops
            to a second line on phones and leads the row on wider lists. */}
        <div className="col-span-3 row-start-2 flex flex-wrap gap-x-1.5 text-note text-quiet @xl:col-span-1 @xl:row-start-1 @xl:flex-col">
          <span className={`font-semibold ${resultColor} @xl:text-body`}>{result}</span>
          <span>{m.queue}</span>
          {/* "15d ago · 16:51" on a phone's one line; two lines on wider
              lists, where the column is narrow. */}
          <span className="tabular-nums">{timeAgo(m.startedAt, now)}</span>
          <span className="tabular-nums">
            <span className="@xl:hidden">· </span>
            {formatDuration(m.durationS)}
          </span>
        </div>

        <div className="row-start-1 flex min-w-0 items-center gap-2.5">
          <ChampionIcon dd={dd} name={m.championName} size={44} className="rounded-md" />
          <div className="min-w-0">
            {/* The row's one link. Its ::after covers the whole row, so a
                click or tap anywhere opens the game. Only the players' links
                further on sit above the cover. */}
            <Link
              href={href}
              aria-label={`Open this ${champion} game (${result}, ${timeAgo(m.startedAt, now)})`}
              className="block truncate font-medium text-main decoration-quiet underline-offset-[3px] group-hover:underline after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-main"
            >
              {champion}
            </Link>
            {m.position && <p className="text-note text-quiet">{m.position}</p>}
          </div>
        </div>

        <div className="row-start-1 text-right whitespace-nowrap tabular-nums @xl:text-left">
          <p className="text-body font-semibold @xl:text-subheading">
            {m.kills} / {m.deaths} / {m.assists}
          </p>
          <p className="text-note text-quiet">{m.kda.toFixed(1)} KDA</p>
          {/* No room for CS beside the champion's name on a phone. */}
          <p className="hidden text-note text-quiet @xl:block">
            {m.cs} CS · {m.csPerMin.toFixed(1)}/min
          </p>
          {/* One line each, since two side by side would run under the score. */}
          {badges.map((badge) => (
            <p key={badge} className="hidden text-note text-quiet @xl:block">
              {badge}
            </p>
          ))}
        </div>

        <div className="row-start-1 flex min-w-0 items-start gap-2.5">
          <span
            // The cover hides hover titles, so the number is named for
            // screen readers and the reason is written out beside it.
            role="img"
            aria-label={score ? `Game score ${score.score} out of 100` : "No game score"}
            className="flex h-8 min-w-10 shrink-0 items-center justify-center rounded-md bg-raised px-1.5 text-base font-bold tabular-nums"
          >
            {score ? score.score : "–"}
          </span>
          {score ? (
            <>
              {/* One line, as drawn: the main thing that helped or held the
                  score back. Screen readers hear the whole reason instead. */}
              <p aria-hidden="true" className="hidden min-w-0 truncate text-note leading-8 text-quiet @xl:block">
                {shortReason(score)}
              </p>
              <p className="sr-only">{scoreReason(score)}</p>
            </>
          ) : (
            <p className="hidden min-w-0 truncate text-note leading-8 text-quiet @xl:block">
              {/* A remake, a game under 10 minutes or a mode without lanes
                  (isScorable in src/lib/analyzer/score.ts) gets no score. */}
              {m.remake ? "No score for a remake" : "No game score for this game"}
            </p>
          )}
        </div>

        {teams && <Teams region={teams.region} players={teams.players} />}

        <Chevron />
      </div>
    </li>
  );
}

// The reason cut to one line: what helped the score most, or else what held
// it back, after MVP or ACE when the player was the best on their team.
// "MVP · Helped by strong KDA"
export function shortReason(score: PlayerScore): string {
  const main = score.strengths[0]
    ? `Helped by ${score.strengths[0]}`
    : score.weakness
      ? `Held back by ${score.weakness}`
      : "";
  return [score.badge, main].filter(Boolean).join(" · ");
}

// Points right, to say the row opens a page. Hidden on phones, as drawn.
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
      className="row-start-1 hidden shrink-0 text-quiet transition-colors duration-320 group-hover:text-main group-hover:duration-120 motion-reduce:transition-none @xl:block"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Two columns of five names, blue side on the left, with the player in the
// text colour. Only on lists 768px and wider; the match page shows everyone.
// `relative z-10` lifts the names above the row link's cover, so each one
// still opens that player's profile; `pointer-events-none` lets a click in
// the gaps between names fall through to the cover and open the game.
function Teams({ region, players }: { region: Region; players: [TeamPlayer[], TeamPlayer[]] }) {
  return (
    <div className="pointer-events-none relative z-10 row-start-1 hidden grid-cols-2 gap-x-3 @3xl:grid">
      {players.map((team, side) => (
        <ul key={side} aria-label={side === 0 ? "Blue side" : "Red side"} className="min-w-0 text-xs leading-normal">
          {team.map((p, i) => {
            const look = `block truncate ${p.isMe ? "font-semibold text-main" : "text-quiet"}`;
            return (
              <li key={i}>
                {p.riotId ? (
                  <Link
                    href={`/player/${region}/${toSlug(p.riotId)}`}
                    title={`${p.riotId.gameName}#${p.riotId.tagLine}`}
                    className={`${look} pointer-events-auto hover:text-main hover:underline`}
                  >
                    {p.name}
                  </Link>
                ) : (
                  <span className={look}>{p.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
