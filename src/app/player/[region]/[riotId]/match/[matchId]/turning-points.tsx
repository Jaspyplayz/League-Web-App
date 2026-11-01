import type { ReactNode } from "react";
import { SubHeading } from "@/components/ui/panel-heading";
import { formatClock, formatSigned } from "@/lib/analyzer/format";
import type { TurningPoint } from "@/lib/analyzer/turning-points";

// Numbered list in "How the game went"; the numbers match the circles on the
// board's gold chart.
export function TurningPoints({ points }: { points: TurningPoint[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SubHeading id="turning-points">Turning points</SubHeading>
      <ol aria-labelledby="turning-points" className="flex flex-col">
        {points.map((p, i) => (
          <MomentRow
            key={p.startMs}
            symbol={String(i + 1)}
            good={p.swing > 0}
            clock={formatClock(p.timestamp)}
            title={p.title}
            change={
              <>
                {formatSigned(p.swing)}
                <span className="sr-only"> gold</span>
              </>
            }
            detail={p.detail}
          />
        ))}
      </ol>
    </div>
  );
}

// One moment in the Turning points or Biggest swings list: its number or
// letter in a circle (blue when it went your way, red when it didn't), when it
// happened, what happened and how much it moved things.
export function MomentRow({
  symbol,
  good,
  clock,
  title,
  change,
  detail,
}: {
  symbol: string;
  good: boolean;
  clock: string;
  title: string;
  change: ReactNode;
  detail: string | null;
}) {
  const color = good ? "text-ahead-soft border-ahead" : "text-behind border-behind";
  return (
    <li className="flex items-start gap-3 border-b border-divider py-2.5 last:border-b-0">
      <span
        aria-hidden="true"
        className={`flex size-6 flex-none items-center justify-center rounded-full border-2 text-xs font-medium tabular-nums ${color}`}
      >
        {symbol}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <p className="text-sm font-semibold">
            <span className="font-medium text-quiet tabular-nums">{clock}</span> {title}
          </p>
          <span className={`flex-none text-note tabular-nums ${color}`}>{change}</span>
        </div>
        {detail && <p className="text-note text-quiet">{detail}</p>}
      </div>
    </li>
  );
}
