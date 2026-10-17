// A thick bar with its number written inside, like op.gg's Team analysis.
// Every bar in a group should get the same `max`, so lengths can be compared
// across rows: a bar twice as long is twice the value.
//
// `tone` follows the team rule: the winning team's bars are blue ("ahead")
// and the losing team's red ("behind").
export function StatBar({
  value,
  max,
  label,
  tone,
  className = "",
}: {
  value: number;
  max: number;
  label: string; // the number as shown, like "11.5k"
  tone: "ahead" | "behind";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-line ${className}`}>
      <div
        className={`h-full ${tone === "ahead" ? "bg-ahead" : "bg-behind"}`}
        style={{ width: `${pct}%` }}
      />
      {/* A see-through backdrop in the page color keeps the number readable
          where it sits on top of the bar, in both themes. */}
      <span className="absolute inset-y-0 right-1 flex items-center">
        <span className="rounded-sm bg-page/75 px-1 font-mono text-xs leading-4 text-ink">
          {label}
        </span>
      </span>
    </div>
  );
}
