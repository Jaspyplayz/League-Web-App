// The saved or just-written recap: the headline, its points as a list (one
// per line of `detail`, see src/lib/recap.ts), and a note that AI wrote it.
export function RecapText({ headline, detail }: { headline: string; detail: string }) {
  const points = detail.split("\n").filter((line) => line.trim() !== "");
  return (
    <>
      <p className="text-body font-semibold text-ink">{headline}</p>
      <ul className="flex flex-col gap-2 text-ink-soft">
        {points.map((point, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ahead" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="text-note text-faint">
        Written by AI (Claude) from the stats on this page. It can get things wrong.
      </p>
    </>
  );
}
