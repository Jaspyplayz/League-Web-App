import { PanelHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";
import { formatClock, plural } from "@/lib/analyzer/format";
import {
  habitLabel,
  MIN_HABIT_GAMES,
  type HabitId,
  type HabitReport,
  type HabitResult,
  type HabitSplit,
} from "@/lib/analyzer/habit-trends";
import { isRankHabit } from "@/lib/analyzer/skill";
import type { WinRecord } from "@/lib/analyzer/trends";
import { positionName } from "@/lib/match-summary";
import { tierName, type Tier } from "@/lib/tiers";

const clock = (seconds: number) => formatClock(seconds * 1000);

// Each habit's name and what it counts, in words.
function describe(id: HabitId, report: HabitReport, rankName: string | null) {
  switch (id) {
    case "level-6-first":
      return { title: habitLabel(id), detail: "You hit level 6 before your opponent." };
    case "first-scuttles":
      return {
        title: habitLabel(id),
        detail: "You took more of the two 3:30 scuttle crabs than the enemy jungler.",
      };
    case "early-gank":
      return {
        title: habitLabel(id),
        detail: "A kill or assist in a lane. Ganks that got nothing don't show up in Riot's data.",
      };
    case "early-back": {
      const whose = report.backFrom === "rank" && rankName ? `${rankName}'s` : "your";
      return {
        title: habitLabel(id, report.backBy),
        detail: `${clock(report.backBy)} is ${whose} usual first back. Backs after dying aren't counted.`,
      };
    }
  }
}

// "Habits": a few early-game habits (src/lib/analyzer/habits.ts), how often
// you had each, and how often games with and without it were won, by you and
// by players of the rank picked in "You vs [rank]". These are patterns, not a
// verdict on any game, and the note under them says so. Like Session blocks,
// the numbers aren't coloured blue or red.
export function HabitsSection({ report, tier }: { report: HabitReport | null; tier: Tier | null }) {
  const role = report ? (positionName(report.position)?.toLowerCase() ?? "") : "";
  // No habit had enough of your games to count, such as with a champion
  // picked that you played in two roles. The heading stays and says why.
  if (!report || report.habits.length === 0) {
    return (
      <section
        aria-labelledby="habits-heading"
        className={`${panelClass} flex flex-col gap-1.5 p-4 sm:px-5`}
      >
        <PanelHeading id="habits-heading">Habits</PanelHeading>
        <p className="text-body text-quiet">
          Each habit needs at least {MIN_HABIT_GAMES} of your games in your most-played role
          {role && ` (${role})`}, and these games don&apos;t have that many yet. Try more games, or
          all champions.
        </p>
      </section>
    );
  }
  const rankName = tier && report.rankGames > 0 ? tierName(tier) : null;
  return (
    <section aria-labelledby="habits-heading" className={`${panelClass} flex flex-col gap-5 p-4 sm:px-5`}>
      <div className="flex flex-col gap-1">
        <PanelHeading id="habits-heading">Habits</PanelHeading>
        <p className="text-body text-quiet">
          Your {plural(report.games, `${role} game`)}
          {rankName &&
            `, next to ${report.rankGames.toLocaleString("en-US")} ${rankName} ${role} games`}
          .
        </p>
      </div>
      <ul className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {report.habits.map((habit) => (
          <Habit
            key={habit.id}
            habit={habit}
            rankName={rankName}
            {...describe(habit.id, report, rankName)}
          />
        ))}
      </ul>
      <p className="text-note text-quiet">
        These are patterns across games, not advice for any one of them. A habit that goes with
        winning doesn&apos;t always cause it: players who are already ahead hit 6 first more often,
        for one.
      </p>
    </section>
  );
}

function Habit({
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
  const showRankRate = rank && rankName && isRankHabit(habit.id);
  const difference =
    rank && rankName ? winDifference(rank, `${rankName} games`) : winDifference(you, "You");
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col">
        <h3 className="text-body font-semibold">{title}</h3>
        <p className="text-note text-quiet">{detail}</p>
      </div>
      <p className="text-sm tabular-nums">
        You: {you.with.games} of {plural(yourGames, "game")} ({share(you)}%)
        {showRankRate && (
          <span className="text-quiet">
            {" "}
            · {rankName}: {share(rank)}%
          </span>
        )}
      </p>
      <table className="w-full text-left tabular-nums">
        <thead>
          <tr className="text-note text-quiet">
            <th scope="col" className="w-24 pb-1.5 font-medium">
              Games
            </th>
            <th scope="col" className="pb-1.5 font-medium">
              You
            </th>
            {rank && rankName && (
              <th scope="col" className="pb-1.5 font-medium">
                {rankName}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {(["with", "without"] as const).map((side) => (
            <tr key={side} className="border-t border-divider">
              <th scope="row" className="py-1.5 text-note font-normal text-quiet">
                {side === "with" ? "With it" : "Without"}
              </th>
              <WinCell record={you[side]} />
              {rank && rankName && <WinCell record={rank[side]} />}
            </tr>
          ))}
        </tbody>
      </table>
      {difference && <p className="text-note text-quiet">{difference}</p>}
    </li>
  );
}

function WinCell({ record }: { record: WinRecord }) {
  return (
    <td className="py-1.5 text-sm">
      {record.games > 0 ? (
        <>
          <span className="font-semibold">{winRate(record)}% won</span>{" "}
          <span className="text-quiet">
            {record.wins} of {plural(record.games, "game")}
          </span>
        </>
      ) : (
        <span className="text-quiet">No games</span>
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
