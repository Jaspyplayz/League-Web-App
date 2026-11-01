import { formatGap, type GapOptions } from "@/lib/analyzer/format";

const TONE_CLASS = { better: "text-ahead", worse: "text-behind", even: "text-quiet" };

// "614 behind" in red or "120 ahead" in blue: the gap between your number
// and someone else's, for any table or card that puts the two side by side.
export function Gap({
  you,
  them,
  className = "",
  ...options
}: GapOptions & {
  you: number;
  them: number;
  className?: string;
}) {
  const { text, tone } = formatGap(you, them, options);
  return <span className={`tabular-nums ${TONE_CLASS[tone]} ${className}`}>{text}</span>;
}
