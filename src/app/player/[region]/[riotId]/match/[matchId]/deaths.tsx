import { PanelHeading } from "@/components/ui/panel-heading";
import { DEATH_LABEL_TEXT, type Death } from "@/lib/analyzer/deaths";
import { formatClock, listNames, plural } from "@/lib/analyzer/format";
import { panelClass } from "@/components/ui/panel";

// Every death with its time, what kind of death it was, and who was involved,
// in one panel beside Team gold on the Stats tab.
export function Deaths({ deaths, name }: { deaths: Death[]; name: (id: number) => string }) {
  const early = deaths.filter((d) => d.early).length;

  return (
    <section
      aria-labelledby="deaths-heading"
      className={`${panelClass} flex min-w-0 flex-[1_1_340px] flex-col gap-3 p-6`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PanelHeading id="deaths-heading">Deaths</PanelHeading>
        {deaths.length > 0 && (
          <span className="text-note text-quiet tabular-nums">
            {plural(deaths.length, "death")}, {early} before 14:00
          </span>
        )}
      </div>
      {deaths.length === 0 ? (
        <p className="text-body text-quiet">You didn&apos;t die this game.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-divider">
          {deaths.map((d) => (
            <li key={d.timestamp} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="w-12 text-body text-quiet tabular-nums">
                {formatClock(d.timestamp)}
              </span>
              <span className="rounded-sm bg-raised px-2 py-0.5 text-note font-medium">
                {DEATH_LABEL_TEXT[d.label]}
              </span>
              <span className="min-w-0 flex-1 text-sm text-quiet">
                {d.enemyIds.length > 0
                  ? `by ${listNames(d.enemyIds.map(name))}`
                  : "by a tower or minions"}
              </span>
              {/* Red as in "behind": an early death cost you the most. */}
              {d.early && <span className="text-note font-semibold text-behind">Early</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="text-note text-quiet">
        Deaths before 14:00 cost the most: everyone has less gold, so the gold and XP you miss while
        dead matter more.
      </p>
    </section>
  );
}
