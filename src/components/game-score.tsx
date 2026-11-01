import type { PlayerScore } from "@/lib/analyzer/score";

// What helped a game score and what held it back, in words:
// "Helped by strong KDA. Held back by little objective damage."
export function scoreReason(score: PlayerScore): string {
  return [
    score.strengths.length > 0 && `Helped by ${score.strengths.join(" and ")}.`,
    score.weakness && `Held back by ${score.weakness}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// A player's game score (0 to 100), with MVP or ACE when they were the best
// on their team. Its hover title gives the reason. The profile's game rows
// don't use this: their link covers the row, which hides hover titles, so
// they write the reason out beside the score instead (match-row.tsx).
export function GameScore({ score }: { score: PlayerScore }) {
  const why = scoreReason(score);

  return (
    <span
      title={`Score ${score.score} out of 100. ${why}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
    >
      <span className="text-note text-main">{score.score}</span>
      {score.badge && (
        <span
          className={`rounded-full border px-1.5 text-xs ${score.badge === "MVP" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
        >
          {score.badge}
        </span>
      )}
      <span className="sr-only">{why}</span>
    </span>
  );
}
