import { recapPoints } from "@/lib/recap-points";

// The saved or just-written recap: the headline, then its points in game
// order with the time in its own column, and a note that AI wrote it.
export function RecapText({ headline, detail }: { headline: string; detail: string }) {
  const points = recapPoints(detail);
  return (
    <>
      <p className="text-body font-semibold text-ink">{headline}</p>
      <ul className="flex flex-col divide-y divide-line">
        {points.map((point, i) => (
          <li key={i} className="flex gap-4 py-2">
            {point.time && (
              <span className="w-24 shrink-0 font-mono text-sm leading-6 text-ahead-soft tabular-nums">
                {point.time}
              </span>
            )}
            <span className="text-ink-soft">{point.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-note text-faint">
        Written by AI (Claude) from the stats on this page. It can get things wrong.
      </p>
    </>
  );
}
