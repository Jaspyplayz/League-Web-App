import { PanelHeading } from "@/components/ui/panel-heading";
import { DEATH_LABEL_TEXT } from "@/lib/analyzer/deaths";
import { plural } from "@/lib/analyzer/format";
import { CS_DROP, type Trends, type WinRecord } from "@/lib/analyzer/trends";
import { panelClass } from "@/components/ui/panel";


// Win rate when ahead vs when behind. "You win 70% when ahead but only 20%
// when behind" tells a player whether their problem is laning or closing out
// games. One card per minute, so the two numbers you compare (ahead and
// behind at the same minute) sit side by side, with the difference spelled
// out underneath.
export function LeadsAndDeficits({ conversion }: { conversion: Trends["conversion"] }) {
  return (
    <section aria-labelledby="conversion-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="conversion-heading">Win rate when ahead or behind</PanelHeading>
      <ul className="grid gap-3 sm:grid-cols-2">
        {conversion.map(({ minute, ahead, behind }) => {
          const difference = aheadDifference(minute, ahead, behind);
          return (
            <li key={minute} className={`flex flex-col gap-3 px-5 py-4 ${panelClass}`}>
              <h3 className="font-mono text-label uppercase tracking-[0.12em] text-faint">
                At {minute} minutes
              </h3>
              <div className="grid grid-cols-2">
                <WinRate title="Ahead" record={ahead} tone="ahead" />
                <WinRate
                  title="Behind"
                  record={behind}
                  tone="behind"
                  className="border-l border-line pl-5"
                />
              </div>
              {difference && (
                <p className="border-t border-line pt-2.5 text-note text-muted">{difference}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] text-faint">
        Ahead or behind means in gold against the enemy in your role.
      </p>
    </section>
  );
}

function WinRate({
  title,
  record,
  tone,
  className = "",
}: {
  title: string;
  record: WinRecord;
  tone: "ahead" | "behind";
  className?: string;
}) {
  const color = tone === "ahead" ? "text-ahead" : "text-behind";
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className={`text-sm ${color}`}>{title}</span>
      {record.games > 0 ? (
        <>
          <span className="font-mono text-2xl font-medium">
            {winRate(record)}% won
          </span>
          <span className="font-mono text-xs text-faint">
            {record.wins} of {plural(record.games, "game")}
          </span>
        </>
      ) : (
        <span className="text-sm text-faint">No games</span>
      )}
    </div>
  );
}

const winRate = (r: WinRecord) => Math.round((r.wins / r.games) * 100);

// "Being ahead at 10 adds 45 points to your win rate." Null when one side has
// no games, since there's nothing to compare.
function aheadDifference(minute: number, ahead: WinRecord, behind: WinRecord): string | null {
  if (ahead.games === 0 || behind.games === 0) return null;
  const points = winRate(ahead) - winRate(behind);
  if (points > 0) return `Being ahead at ${minute} adds ${points} points to your win rate.`;
  if (points < 0) return `You won ${-points} points more often when behind at ${minute}.`;
  return `You won just as often ahead or behind at ${minute}.`;
}

// Deaths before 14:00, split by kind. "Most of your early deaths are ganks" is
// a concrete thing to work on (ward, or back off when the jungler's missing).
export function EarlyDeaths({
  earlyDeaths,
  games,
}: {
  earlyDeaths: Trends["earlyDeaths"];
  games: number;
}) {
  const { total, perGame, byLabel } = earlyDeaths;
  return (
    <section
      aria-labelledby="early-deaths-heading"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5"
    >
      <PanelHeading id="early-deaths-heading">Early deaths</PanelHeading>
      <div className={`flex flex-col gap-4 p-5 ${panelClass}`}>
        <p className="text-[15px] text-muted">
          {total === 0
            ? `You didn't die before 14:00 in any of these ${games} games.`
            : `${plural(total, "death")} before 14:00 across ${plural(games, "game")}: ${perGame.toFixed(1)} a game.`}
        </p>
        {total > 0 && (
          <ul className="flex flex-col gap-2.5">
            {byLabel.map(({ label, count }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="w-28 flex-none text-ink-soft">{DEATH_LABEL_TEXT[label]}</span>
                <div className="h-2 flex-1 rounded-sm bg-line" aria-hidden="true">
                  <div
                    className="h-2 rounded-sm bg-behind"
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </div>
                <span className="w-24 flex-none whitespace-nowrap text-right font-mono text-faint">
                  {count} · {Math.round((count / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const PHASES = [
  { key: "early", label: "0 to 10 min" },
  { key: "mid", label: "10 to 20 min" },
  { key: "late", label: "20 min +" },
] as const;

// Your own CS per minute in each phase. Most players farm well in lane and
// then drop off once fights start; seeing it is a classic coaching point.
export function CsPhases({ csPerMin }: { csPerMin: Trends["csPerMin"] }) {
  const early = csPerMin.early;
  return (
    <section
      aria-labelledby="cs-phases-heading"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5"
    >
      <PanelHeading id="cs-phases-heading">CS per minute</PanelHeading>
      {early === null ? (
        <p className={`px-5 py-4 text-[15px] text-muted ${panelClass}`}>
          These were all support games, where farming isn&apos;t the job, so there&apos;s no CS
          trend to show.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {PHASES.map(({ key, label }) => {
            const value = csPerMin[key];
            // Amber when you farm noticeably slower than in lane.
            const dropped = value !== null && key !== "early" && value < early * CS_DROP;
            return (
              <li
                key={key}
                className={`flex min-w-0 flex-[1_1_120px] flex-col gap-1 px-5 py-[18px] ${panelClass}`}
              >
                <span className="text-sm text-muted">{label}</span>
                <span className={`font-mono text-2xl font-medium ${dropped ? "text-behind" : ""}`}>
                  {value === null ? "–" : value.toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-faint">Support games are left out.</p>
    </section>
  );
}
