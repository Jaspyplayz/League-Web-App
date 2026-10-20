import { panelClass } from "@/components/ui/panel";
import { Gap } from "@/components/ui/gap";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { Metric, Snapshot } from "@/lib/analyzer/matchup";

const ROW_LABELS: Record<Metric, string> = {
  gold: "Gold",
  cs: "CS",
  xp: "XP",
  damage: "Damage to champions",
};

// "You vs your opponent at 10 and 15 minutes": one table with a row per stat
// and, for each minute, your number, theirs and the gap in words. It used to
// be eight tiles in two rows; one table puts the same numbers side by side so
// you can see a lead grow or shrink from 10 to 15.
export function SnapshotTable({
  snapshots,
  opponentName,
}: {
  // At 10 and at 15, whichever the game reached.
  snapshots: Snapshot[];
  opponentName: string;
}) {
  if (snapshots.length === 0) return null;
  const minutes = snapshots.map((s) => s.minute).join(" and ");
  const divider = "border-l border-line";

  return (
    <section
      aria-labelledby="snapshots-heading"
      className={`${panelClass} flex flex-col gap-4 p-6`}
    >
      <PanelHeading id="snapshots-heading">
        You vs {opponentName} at {minutes} minutes
      </PanelHeading>
      {/* On phones the table keeps a readable size and scrolls sideways.
          "relative" keeps the screen-reader-only caption inside the box. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] whitespace-nowrap text-left text-sm">
          <caption className="sr-only">
            Your stats and {opponentName}&apos;s at {minutes} minutes, with the gap
          </caption>
          <thead className="text-note text-faint">
            <tr>
              <td />
              {snapshots.map((s) => (
                <th
                  key={s.minute}
                  scope="colgroup"
                  colSpan={3}
                  className={`px-3 pb-1 font-mono text-label font-medium uppercase tracking-[0.12em] text-muted ${divider}`}
                >
                  At {s.minute} minutes
                </th>
              ))}
            </tr>
            <tr className="border-b border-line">
              <th scope="col" className="py-1.5 font-normal">
                Stat
              </th>
              {snapshots.map((s) => [
                <th
                  key={`you-${s.minute}`}
                  scope="col"
                  className={`px-3 py-1.5 font-normal ${divider}`}
                >
                  You
                </th>,
                <th key={`them-${s.minute}`} scope="col" className="px-3 py-1.5 font-normal">
                  {opponentName}
                </th>,
                <th key={`gap-${s.minute}`} scope="col" className="px-3 py-1.5 font-normal">
                  Gap
                </th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(ROW_LABELS) as Metric[]).map((metric) => (
              <tr key={metric}>
                <th scope="row" className="py-2.5 pr-3 font-normal text-ink-soft">
                  {ROW_LABELS[metric]}
                </th>
                {snapshots.map((s) => {
                  const you = Math.round(s.you[metric]);
                  const them = Math.round(s.opponent[metric]);
                  return [
                    <td key={`you-${s.minute}`} className={`px-3 py-2.5 font-mono ${divider}`}>
                      {you.toLocaleString("en-US")}
                    </td>,
                    <td key={`them-${s.minute}`} className="px-3 py-2.5 font-mono text-muted">
                      {them.toLocaleString("en-US")}
                    </td>,
                    <td key={`gap-${s.minute}`} className="px-3 py-2.5">
                      <Gap you={you} them={them} />
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
