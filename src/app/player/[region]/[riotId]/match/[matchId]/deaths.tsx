import { PanelHeading } from "@/components/ui/panel-heading";
import { DEATH_LABEL_TEXT, type Death } from "@/lib/analyzer/deaths";
import { formatClock, listNames, plural } from "@/lib/analyzer/format";
import { panelClass } from "@/components/ui/panel";

// Every death with its time, what kind of death it was, and who was involved.
export function Deaths({ deaths, name }: { deaths: Death[]; name: (id: number) => string }) {
  const early = deaths.filter((d) => d.early).length;

  return (
    <section
      aria-labelledby="deaths-heading"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PanelHeading id="deaths-heading">Deaths</PanelHeading>
        {deaths.length > 0 && (
          <span className="font-mono text-[13px] text-faint">
            {plural(deaths.length, "death")}, {early} before 14:00
          </span>
        )}
      </div>
      {deaths.length === 0 ? (
        <p className={`${panelClass} px-4 py-3.5 text-[15px] text-muted`}>
          You didn&apos;t die this game.
        </p>
      ) : (
        <ol className={`${panelClass} flex flex-col divide-y divide-line`}>
          {deaths.map((d) => (
            <li key={d.timestamp} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="w-12 font-mono text-[15px] text-muted">
                {formatClock(d.timestamp)}
              </span>
              <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {DEATH_LABEL_TEXT[d.label]}
              </span>
              <span className="min-w-0 flex-1 text-sm text-muted">
                {d.enemyIds.length > 0
                  ? `by ${listNames(d.enemyIds.map(name))}`
                  : "by a tower or minions"}
              </span>
              {d.early && (
                <span className="rounded-full border border-behind/40 bg-behind/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-behind">
                  Early
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-[13px] text-faint">
        Deaths before 14:00 cost the most: everyone has less gold, so the gold and XP you miss while
        dead matter more.
      </p>
    </section>
  );
}
