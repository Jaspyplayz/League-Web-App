import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { GankLog } from "@/lib/analyzer/ganks";
import type { Pathing } from "@/lib/analyzer/pathing";
import { GANKS_HELP, GankLists, gankSummary } from "./ganks";
import { HowToRead } from "./how-to-read";
import { PATHING_HELP, PathingGrid, pathingSummary } from "./pathing";

// "Early jungle" on the Deep dive tab, for junglers: one line on the early
// game, then early pathing on the left and both junglers' early ganks on the
// right. What the grid and lists mean sits behind "How to read this". It
// used to be two panels, Early pathing and Early ganks, each with its own
// explanation; the content is the same.
export function EarlyJungle({
  pathing,
  ganks,
  enemyJungler,
}: {
  pathing: Pathing | null;
  // Null without an enemy jungler to compare with.
  ganks: GankLog | null;
  enemyJungler: string | null;
}) {
  const path = pathing && pathing.minutes.length > 0 ? pathing : null;
  const gankLog = ganks && enemyJungler ? ganks : null;
  if (!path && !gankLog) return null;

  const summary = [
    path && pathingSummary(path),
    gankLog && enemyJungler && gankSummary(gankLog, enemyJungler),
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="early-jungle-heading"
      className={`${panelClass} flex flex-col gap-4 p-6`}
    >
      <HowToRead heading={<PanelHeading id="early-jungle-heading">Early jungle</PanelHeading>}>
        {path && <p>{PATHING_HELP}</p>}
        {gankLog && <p>{GANKS_HELP}</p>}
      </HowToRead>
      <p className="text-body text-ink-soft">{summary.join(" ")}</p>
      <div
        className={`grid gap-x-8 gap-y-6 ${path && gankLog ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]" : ""}`}
      >
        {path && <PathingGrid pathing={path} />}
        {gankLog && enemyJungler && <GankLists ganks={gankLog} enemyJungler={enemyJungler} />}
      </div>
    </section>
  );
}
