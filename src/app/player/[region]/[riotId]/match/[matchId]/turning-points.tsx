import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock, formatSigned } from "@/lib/analyzer/format";
import { SWING_THRESHOLD, type TurningPoint } from "@/lib/analyzer/turning-points";

// Numbered list next to the chart; the numbers match the circles on it.
export function TurningPoints({ points }: { points: TurningPoint[] }) {
  return (
    <aside
      aria-labelledby="turning-points"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-3"
    >
      <PanelHeading id="turning-points">Turning points</PanelHeading>
      {points.length === 0 ? (
        <p className="rounded-[14px] border border-line-strong bg-surface px-4 py-3.5 text-[15px] text-muted">
          No big swings: the gold difference never moved more than{" "}
          {SWING_THRESHOLD.toLocaleString("en-US")} in a few minutes. This one was decided slowly.
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {points.map((p, i) => {
            const ahead = p.swing > 0;
            const color = ahead ? "text-ahead-soft border-ahead" : "text-behind border-behind";
            return (
              <li
                key={p.startMs}
                className="flex items-start gap-3.5 rounded-[14px] border border-line-strong bg-surface px-4 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-7 flex-none items-center justify-center rounded-full border-2 font-mono text-[13px] font-medium ${color}`}
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <p className="text-[15px] font-semibold">
                      <span className="font-mono font-medium text-muted">
                        {formatClock(p.timestamp)}
                      </span>{" "}
                      {p.title}
                    </p>
                    <span className={`flex-none font-mono text-[13px] ${color}`}>
                      {formatSigned(p.swing)}
                      <span className="sr-only"> gold</span>
                    </span>
                  </div>
                  <p className="text-sm text-muted">{p.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
