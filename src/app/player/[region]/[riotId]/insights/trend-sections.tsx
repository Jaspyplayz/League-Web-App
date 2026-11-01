import { panelClass } from "@/components/ui/panel";
import { PanelHeading, SubHeading } from "@/components/ui/panel-heading";
import { DEATH_LABEL_TEXT } from "@/lib/analyzer/deaths";
import { plural } from "@/lib/analyzer/format";
import { CS_DROP, type Trends, type WinRecord } from "@/lib/analyzer/trends";

// The three panels that share a row on Overview: win rate when ahead or
// behind, early deaths and CS per minute. Each is one panel with its heading
// inside, like the rest of the Review board.
const sectionClass = `${panelClass} flex min-w-0 flex-col gap-3 p-4 sm:px-5`;

// A thin bar inside a panel, filled to `share` (0 to 1) in `fill`.
function Bar({ share, fill }: { share: number; fill: string }) {
  return (
    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-raised" aria-hidden="true">
      <div className={`h-full rounded-sm ${fill}`} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

// Win rate when ahead vs when behind. "You win 70% when ahead but only 20%
// when behind" tells a player whether their problem is laning or closing out
// games. Each minute gets the two rows you compare (ahead and behind at the
// same minute), with the difference spelled out underneath.
export function LeadsAndDeficits({ conversion }: { conversion: Trends["conversion"] }) {
  return (
    <section aria-labelledby="conversion-heading" className={sectionClass}>
      <PanelHeading id="conversion-heading">Win rate when ahead or behind</PanelHeading>
      <ul className="flex flex-col gap-4">
        {conversion.map(({ minute, ahead, behind }) => {
          const difference = aheadDifference(minute, ahead, behind);
          return (
            <li key={minute} className="flex flex-col gap-2">
              <SubHeading>At {minute} minutes</SubHeading>
              <WinRate title="Ahead" record={ahead} tone="ahead" />
              <WinRate title="Behind" record={behind} tone="behind" />
              {difference && <p className="text-note text-quiet">{difference}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-note text-quiet">
        Ahead or behind means in gold against the enemy in your role.
      </p>
    </section>
  );
}

function WinRate({
  title,
  record,
  tone,
}: {
  title: string;
  record: WinRecord;
  tone: "ahead" | "behind";
}) {
  return (
    <div className="flex items-center gap-2.5 text-note tabular-nums">
      <span
        className={`w-14 flex-none text-sm font-semibold ${tone === "ahead" ? "text-ahead" : "text-behind"}`}
      >
        {title}
      </span>
      <Bar
        share={record.games > 0 ? record.wins / record.games : 0}
        fill={tone === "ahead" ? "bg-ahead" : "bg-behind"}
      />
      <span className="w-32 flex-none whitespace-nowrap">
        {record.games > 0 ? (
          <>
            <span className="font-semibold">{winRate(record)}% won</span>{" "}
            <span className="text-quiet">
              {record.wins} of {record.games}
            </span>
          </>
        ) : (
          <span className="text-quiet">No games</span>
        )}
      </span>
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
// The bars are in a neutral shade: they split your own deaths into kinds, so
// none of them is you against the opponent.
export function EarlyDeaths({
  earlyDeaths,
  games,
}: {
  earlyDeaths: Trends["earlyDeaths"];
  games: number;
}) {
  const { total, perGame, byLabel } = earlyDeaths;
  return (
    <section aria-labelledby="early-deaths-heading" className={sectionClass}>
      <PanelHeading id="early-deaths-heading">Early deaths</PanelHeading>
      <p className="text-note text-quiet">
        {total === 0
          ? `You didn't die before 14:00 in any of these ${games} games.`
          : `${plural(total, "death")} before 14:00 across ${plural(games, "game")}: ${perGame.toFixed(1)} a game.`}
      </p>
      {total > 0 && (
        <ul className="flex flex-col gap-2">
          {byLabel.map(({ label, count }) => (
            <li key={label} className="flex items-center gap-2.5 text-note tabular-nums">
              <span className="w-24 flex-none">{DEATH_LABEL_TEXT[label]}</span>
              <Bar share={count / total} fill="bg-quiet" />
              <span className="w-16 flex-none whitespace-nowrap text-right text-quiet">
                {count} · {Math.round((count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
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
    <section aria-labelledby="cs-phases-heading" className={sectionClass}>
      <PanelHeading id="cs-phases-heading">CS per minute</PanelHeading>
      {early === null ? (
        <p className="text-body text-quiet">
          These were all support games, where farming isn&apos;t the job, so there&apos;s no CS
          trend to show.
        </p>
      ) : (
        <dl className="flex flex-col gap-2">
          {PHASES.map(({ key, label }) => {
            const value = csPerMin[key];
            // Red when you farm noticeably slower than in lane.
            const dropped = value !== null && key !== "early" && value < early * CS_DROP;
            return (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="text-note text-quiet">{label}</dt>
                <dd
                  className={`text-xl font-semibold tabular-nums ${dropped ? "text-behind" : ""}`}
                >
                  {value === null ? "–" : value.toFixed(1)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="text-note text-quiet">Support games are left out.</p>
    </section>
  );
}
