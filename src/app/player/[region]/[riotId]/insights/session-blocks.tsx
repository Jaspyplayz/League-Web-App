import { PanelHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";
import { plural } from "@/lib/analyzer/format";
import {
  FEW_GAMES,
  LATER_FROM,
  SESSION_GAP_MS,
  type GroupStats,
  type LengthGroup,
  type SessionReport,
} from "@/lib/analyzer/sessions";

const GAP_MINUTES = SESSION_GAP_MS / 60_000;

// "Session blocks": win rate and game score by how long a block of games
// was, and by where in the block a game came (src/lib/analyzer/sessions.ts).
// Like Habits, the numbers aren't colored blue or red: this describes a
// pattern, it doesn't grade anyone for playing a 6th game.
export function SessionBlocks({
  report,
  champion,
}: {
  report: SessionReport | null;
  // The champion picked in the filter bar, if any. Blocks count every game
  // played, so they aren't split by champion.
  champion: string | null;
}) {
  return (
    <section
      aria-labelledby="sessions-heading"
      className="flex flex-col gap-3.5"
    >
      <PanelHeading id="sessions-heading">Session blocks</PanelHeading>
      {!report ? (
        <p className="text-[15px] text-muted">
          None of these games has a game score yet, so there are no blocks to
          compare.
        </p>
      ) : (
        <>
          <p className="text-[15px] text-muted">
            Your {plural(report.games, "scored game")} in{" "}
            {plural(report.sessions, "block")}. A block is games with less than{" "}
            {GAP_MINUTES} minutes between one ending and the next starting.
            {champion &&
              " It counts every champion you played, not only the one picked above."}
          </p>
          <p className={`px-5 py-4 text-[15px] ${panelClass}`}>
            {headline(report)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <GroupTable
              title="By block length"
              first="Block"
              rows={report.byLength}
              showSessions
            />
            <GroupTable
              title="By game in the block"
              first="Game"
              rows={report.byNumber}
            />
          </div>
        </>
      )}
      <p className="text-[13px] text-faint">
        Rows marked * have fewer than {FEW_GAMES} games, so a couple of results
        either way could swing them: treat them as luck until more games come
        in. Later games going worse isn&apos;t always tiredness either: a losing
        streak is also what keeps people queuing.
      </p>
    </section>
  );
}

// The comparison the section is for: the 4th game onward against games 1
// to 3, in words.
function headline({ later }: SessionReport): string {
  const nth = ordinal(LATER_FROM);
  if (!later) {
    return `None of your blocks reached a ${nth} game, so there's nothing to compare yet.`;
  }
  const { before, after } = later;
  const points = after.averageScore! - before.averageScore!;
  const score =
    points === 0
      ? `Your ${nth} game onward in a block averages the same game score as games 1 to ${LATER_FROM - 1} (${after.averageScore})`
      : `Your ${nth} game onward in a block averages ${plural(Math.abs(points), "point")} ${points > 0 ? "higher" : "lower"} in game score than games 1 to ${LATER_FROM - 1} (${after.averageScore} against ${before.averageScore})`;
  const wins = `, and was won ${after.winRate}% of the time against ${before.winRate}%.`;
  const luck =
    after.few || before.few
      ? ` That's from only ${plural(Math.min(after.games, before.games), "game")} on one side, so it could be luck.`
      : "";
  return score + wins + luck;
}

function GroupTable({
  title,
  first,
  rows,
  showSessions = false,
}: {
  title: string;
  first: string;
  rows: (GroupStats | LengthGroup)[];
  showSessions?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 px-4 py-4 sm:px-5 ${panelClass}`}
    >
      <h3 className="font-mono text-label uppercase tracking-[0.12em] text-faint">
        {title}
      </h3>
      <table className="w-full text-left">
        <thead>
          <tr className="whitespace-nowrap font-mono text-label uppercase tracking-[0.12em] text-faint">
            <th scope="col" className="pb-1 font-normal">
              {first}
            </th>
            {showSessions && (
              <th scope="col" className="pb-1 pl-2.5 text-right font-normal">
                Blocks
              </th>
            )}
            <th scope="col" className="pb-1 pl-2.5 text-right font-normal">
              Games
            </th>
            <th scope="col" className="pb-1 pl-2.5 text-right font-normal">
              Won
            </th>
            <th scope="col" className="pb-1 pl-2.5 text-right font-normal">
              Avg score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <th
                scope="row"
                className="whitespace-nowrap py-1.5 text-sm font-normal text-ink-soft"
              >
                {row.label}
                {row.games > 0 && row.few && (
                  <span
                    className="text-faint"
                    title={`Fewer than ${FEW_GAMES} games`}
                  >
                    {" "}
                    *
                  </span>
                )}
              </th>
              {showSessions && (
                <td className="py-1.5 pl-2.5 text-right font-mono text-sm">
                  {"sessions" in row ? row.sessions : null}
                </td>
              )}
              <td className="py-1.5 pl-2.5 text-right font-mono text-sm">
                {row.games}
              </td>
              <td className="py-1.5 pl-2.5 text-right font-mono text-sm">
                {row.winRate === null ? (
                  <span className="text-faint">–</span>
                ) : (
                  `${row.winRate}%`
                )}
              </td>
              <td className="py-1.5 pl-2.5 text-right font-mono text-sm">
                {row.averageScore ?? <span className="text-faint">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 4 -> "4th". Only small numbers come up here.
function ordinal(n: number): string {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}
