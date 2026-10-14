import type { PlayerScore } from "@/lib/analyzer/score";

// A player's game score (0 to 100), with MVP or ACE when they were the best
// on their team. Hovering shows what helped and hurt the score most.
export function GameScore({ score, size = "sm" }: { score: PlayerScore; size?: "sm" | "lg" }) {
  const why = [
    score.strengths.length > 0 && `Helped by ${score.strengths.join(" and ")}.`,
    score.weakness && `Held back by ${score.weakness}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={`Score ${score.score} out of 100. ${why}`}
      className="inline-flex items-center gap-1.5 font-mono whitespace-nowrap"
    >
      <span className={size === "lg" ? "text-base text-ink" : "text-[13px] text-ink-soft"}>
        {score.score}
      </span>
      {score.badge && (
        <span
          className={`rounded-full border px-1.5 text-[9px] tracking-[0.1em] ${score.badge === "MVP" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
        >
          {score.badge}
        </span>
      )}
      <span className="sr-only">{why}</span>
    </span>
  );
}
