import { PanelHeading } from "@/components/ui/panel-heading";
import { listNames, plural } from "@/lib/analyzer/format";
import { LANES, type LaneTone } from "@/lib/analyzer/jungle-replay";
import { PATHING_FROM_MINUTE, PATHING_TO_MINUTE, type Pathing } from "@/lib/analyzer/pathing";
import { LegendSwatch } from "./legend-swatch";
import { panelClass } from "@/components/ui/panel";

// Early pathing for junglers: a grid with one row per lane and one column per
// minute from 3:00 to 14:00. Each cell is tinted by how that lane was doing,
// and a dot marks the lane you were playing near. It shows where you spent
// your early game next to where the leads were, without grading it.
export function PathingGrid({ pathing }: { pathing: Pathing }) {
  const { minutes } = pathing;
  if (minutes.length === 0) return null;

  return (
    <section
      aria-labelledby="pathing-heading"
      className={`${panelClass} flex flex-col gap-[18px] p-6`}
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="pathing-heading">Early pathing</PanelHeading>
        <p className="text-[15px] text-ink-soft">{summary(pathing)}</p>
        <p className="text-sm text-muted">
          Which lane you were playing near each minute, against how each lane was doing (gold + XP).
          Jungle and river count toward the lane on the same side of the map.
        </p>
      </div>

      {/* On phones the grid keeps a readable size and scrolls sideways.
          "relative" keeps the screen-reader-only labels inside the scrolling
          box; otherwise they'd stretch the whole page sideways. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 font-mono text-[13px]">
          <caption className="sr-only">
            Lane leads and your position, {PATHING_FROM_MINUTE}:00 to {PATHING_TO_MINUTE}:00
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-12">
                <span className="sr-only">Lane</span>
              </th>
              {minutes.map((m) => (
                <th key={m.minute} scope="col" className="font-normal text-faint">
                  {m.minute}:00
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LANES.map((lane) => (
              <tr key={lane}>
                <th
                  scope="row"
                  className="pr-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-faint"
                >
                  {lane}
                </th>
                {minutes.map((m) => {
                  const tone = m.lanes[lane];
                  const here = m.nearLane === lane;
                  return (
                    <td key={m.minute} className={`h-9 rounded-md ${CELL_COLOR[tone]}`}>
                      <span className="flex items-center justify-center">
                        {here && <span className="size-3 rounded-full bg-ink" aria-hidden="true" />}
                        <span className="sr-only">
                          {tone}
                          {here ? ", you were here" : ""}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] text-muted">
        <LegendSwatch className="bg-ahead">Lane ahead</LegendSwatch>
        <LegendSwatch className="bg-behind">Lane behind</LegendSwatch>
        <LegendSwatch className="bg-line-strong">Even</LegendSwatch>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-ink" aria-hidden="true" />
          You were near this lane
        </span>
      </div>
    </section>
  );
}

const CELL_COLOR: Record<LaneTone, string> = {
  ahead: "bg-ahead/35",
  behind: "bg-behind/35",
  even: "bg-line-strong",
};

// "From 3:00 to 14:00 you spent 7 minutes near lanes that were ahead,
// 3 minutes near lanes that were behind and 1 minute near even lanes."
function summary({ minutes, nearAhead, nearBehind, nearEven }: Pathing): string {
  const last = minutes.at(-1)!.minute;
  const parts: string[] = [];
  if (nearAhead > 0) parts.push(`${plural(nearAhead, "minute")} near lanes that were ahead`);
  if (nearBehind > 0) parts.push(`${plural(nearBehind, "minute")} near lanes that were behind`);
  if (nearEven > 0) parts.push(`${plural(nearEven, "minute")} near even lanes`);
  const from = `From ${PATHING_FROM_MINUTE}:00 to ${last}:00`;
  if (parts.length === 0) return `${from}, Riot didn't record where you were.`;
  return `${from} you spent ${listNames(parts)}.`;
}
