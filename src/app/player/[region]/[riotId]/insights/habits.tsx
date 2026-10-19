import { PanelHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";
import { formatClock, plural } from "@/lib/analyzer/format";
import {
  EARLY_GANK_S,
  type HabitId,
  type HabitReport,
  type HabitResult,
  type HabitSplit,
} from "@/lib/analyzer/habit-trends";
import type { WinRecord } from "@/lib/analyzer/trends";
import { positionName } from "@/lib/match-summary";
import { tierName, type Tier } from "@/lib/tiers";

const clock = (seconds: number) => formatClock(seconds * 1000);

// Each habit's name and what it counts, in words.
function describe(id: HabitId, report: HabitReport, rankName: string | null) {
  switch (id) {
    case "level-6-first":
      return { title: "Level 6 first", detail: "You hit level 6 before your opponent." };
    case "first-scuttles":
      return {
        title: "First scuttles",
        detail: "You took more of the two 3:30 scuttle crabs than the enemy jungler.",
      };
    case "early-gank":
      return {
        title: `Lane takedown before ${clock(EARLY_GANK_S)}`,
        detail: "A kill or assist in a lane. Ganks that got nothing don't show up in Riot's data.",
      };
    case "early-back": {
      const whose = report.backFrom === "rank" && rankName ? `${rankName}'s` : "your";
      return {
        title: `First back before ${clock(report.backBy)}`,
        detail: `${clock(report.backBy)} is ${whose} usual first back. Backs after dying aren't counted.`,
      };
    }
  }
}

// "Habits": a few early-game habits (src/lib/analyzer/habits.ts), how often
// you had each, and how often games with and without it were won, by you and
// by players of the rank picked in "You vs [rank]". These are patterns, not a
// verdict on any game, and the note under the cards says so.
export function HabitsSection({ report, tier }: { report: HabitReport; tier: Tier | null }) {
  const role = positionName(report.position)?.toLowerCase() ?? "";
  const rankName = tier && report.rankGames > 0 ? tierName(tier) : null;
  return (
    <section aria-labelledby="habits-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="habits-heading">Habits</PanelHeading>
      <p className="text-[15px] text-muted">
        Your {plural(report.games, `${role} game`)}
        {rankName &&
          `, next to ${report.rankGames.toLocaleString("en-US")} ${rankName} ${role} games`}
        .
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {report.habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            rankName={rankName}
            {...describe(habit.id, report, rankName)}
          />
        ))}
      </ul>
      <p className="text-[13px] text-faint">
        These are patterns across games, not advice for any one of them. A habit that goes with
        winning doesn&apos;t always cause it: players who are already ahead hit 6 first more often,
        for one.
      </p>
    </section>
  );
}

function HabitCard({
  habit,
  rankName,
  title,
  detail,
}: {
  habit: HabitResult;
  rankName: string | null;
  title: string;
  detail: string;
}) {
  const { you, rank } = habit;
  const yourGames = you.with.games + you.without.games;
  // The early-back split is at the rank's usual time, so the rank does it in
  // about half its games by definition. That number says nothing, so it's
  // left out.
  const showRankRate = rank && rankName && habit.id !== "early-back";
  const difference =
    rank && rankName ? winDifference(rank, `${rankName} games`) : winDifference(you, "You");
  return (
    <li className={`flex flex-col gap-3 px-5 py-4 ${panelClass}`}>
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-label uppercase tracking-[0.12em] text-faint">{title}</h3>
        <p className="text-note text-muted">{detail}</p>
      </div>
      <p className="text-sm">
        You: {you.with.games} of {plural(yourGames, "game")} ({share(you)}%)
        {showRankRate && (
          <span className="text-muted">
            {" "}
            · {rankName}: {share(rank)}%
          </span>
        )}
      </p>
      <table className="w-full text-left">
        <thead>
          <tr className="font-mono text-label uppercase tracking-[0.12em] text-faint">
            <th scope="col" className="pb-1 font-normal">
              <span className="sr-only">Games</span>
            </th>
            <th scope="col" className="pb-1 font-normal">
              You
            </th>
            {rank && rankName && (
              <th scope="col" className="pb-1 font-normal">
                {rankName}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {(["with", "without"] as const).map((side) => (
            <tr key={side} className="border-t border-line">
              <th scope="row" className="py-1.5 text-sm font-normal text-ink-soft">
                {side === "with" ? "With it" : "Without"}
              </th>
              <WinCell record={you[side]} />
              {rank && rankName && <WinCell record={rank[side]} />}
            </tr>
          ))}
        </tbody>
      </table>
      {difference && (
        <p className="border-t border-line pt-2.5 text-note text-muted">{difference}</p>
      )}
    </li>
  );
}

function WinCell({ record }: { record: WinRecord }) {
  return (
    <td className="py-1.5">
      {record.games > 0 ? (
        <span className="flex flex-col">
          <span className="font-mono text-base font-medium">{winRate(record)}% won</span>
          <span className="font-mono text-xs text-faint">
            {record.wins} of {plural(record.games, "game")}
          </span>
        </span>
      ) : (
        <span className="text-sm text-faint">No games</span>
      )}
    </td>
  );
}

const winRate = (r: WinRecord) => Math.round((r.wins / r.games) * 100);
const share = (s: HabitSplit) =>
  Math.round((s.with.games / (s.with.games + s.without.games)) * 100);

// "Diamond games with it were won 11 points more often." Null when one side
// has no games.
function winDifference(split: HabitSplit, who: string): string | null {
  if (split.with.games === 0 || split.without.games === 0) return null;
  const points = winRate(split.with) - winRate(split.without);
  const subject = who === "You" ? "You won" : `${who} were won`;
  if (points === 0) return `${subject} just as often with or without it.`;
  return `${subject} ${Math.abs(points)} points ${points > 0 ? "more" : "less"} often with it.`;
}
