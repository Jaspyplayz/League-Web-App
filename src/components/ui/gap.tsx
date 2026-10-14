import { formatGap } from "@/lib/analyzer/format";

const TONE_CLASS = { better: "text-ahead", worse: "text-behind", even: "text-muted" };

// "614 behind" in amber or "120 ahead" in blue: the gap between your number
// and someone else's, for any table or card that puts the two side by side.
export function Gap({
  you,
  them,
  decimals,
  lowerIsBetter,
  className = "",
}: {
  you: number;
  them: number;
  decimals?: number;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  const { text, tone } = formatGap(you, them, { decimals, lowerIsBetter });
  return <span className={`font-mono ${TONE_CLASS[tone]} ${className}`}>{text}</span>;
}
