// A bar split into small blocks, like a health bar in League's HUD. `filled`
// is how much is lit (0 to 1), rounded to whole blocks. Lit blocks take
// `on`, the rest `off` (Tailwind background classes), so a win rate can be
// blue wins over red losses and a score blue over plain grey.
export function SegmentBar({
  filled,
  segments,
  on = "bg-ahead",
  off = "bg-line-strong",
  className = "h-2 gap-[3px]",
  label,
}: {
  filled: number;
  segments: number;
  on?: string;
  off?: string;
  className?: string; // height, width and the gap between blocks
  label: string; // what the bar shows, for screen readers
}) {
  const lit = Math.round(Math.min(Math.max(filled, 0), 1) * segments);
  return (
    <div role="img" aria-label={label} className={`flex ${className}`}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={`flex-1 ${i < lit ? on : off}`} />
      ))}
    </div>
  );
}
