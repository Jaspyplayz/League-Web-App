import type { PhaseRating } from "@/lib/analyzer/phase-score";
import type { PlayerScore } from "@/lib/analyzer/score";
import { PanelHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";

// "Game by phase": your early, mid and late ratings, then your game score as
// the overall one. Each is 0 to 100, ranked against saved games of the same
// role, so they're performance numbers, not grades of your decisions.
export function PhaseRatings({
  phases,
  overall,
}: {
  phases: PhaseRating[];
  overall: PlayerScore | null;
}) {
  const playedLate = phases.some((p) => p.phase === "late");
  return (
    <section aria-labelledby="phase-ratings" className="flex flex-col gap-3.5">
      <PanelHeading id="phase-ratings">Game by phase</PanelHeading>
      <ul className="flex flex-wrap gap-3">
        {phases.map((p) => (
          <Tile
            key={p.phase}
            label={`${p.label} · ${p.fromMinute} to ${p.phase === "late" ? "end" : p.toMinute} min`}
            score={p.score}
            why={whyLine(p)}
          />
        ))}
        {overall && (
          <Tile
            label="Overall · whole game"
            score={overall.score}
            badge={overall.badge}
            why="Your game score, as on the match row"
            outlined
          />
        )}
      </ul>
      <p className="text-note text-muted">
        Each phase is ranked against the same role&apos;s saved games for that phase: 71 means
        higher than 71% of them.
        {!playedLate && " Games that end before 30 minutes have no late game rating."}
      </p>
    </section>
  );
}

// The stat that moved the rating most: what helped it most when it's 50 or
// more, what held it back most below that.
function whyLine(p: PhaseRating): string | null {
  if (p.score >= 50 && p.strengths.length > 0) return `Helped by ${p.strengths[0]}`;
  if (p.weakness) return `Held back by ${p.weakness}`;
  return p.strengths.length > 0 ? `Helped by ${p.strengths[0]}` : null;
}

function Tile({
  label,
  score,
  why,
  badge = null,
  outlined = false,
}: {
  label: string;
  score: number;
  why: string | null;
  badge?: PlayerScore["badge"];
  outlined?: boolean;
}) {
  // Blue at 50 or more (better than most), red below, as everywhere else.
  const bar = score >= 50 ? "bg-ahead" : "bg-behind";
  return (
    <li
      className={`${panelClass} flex min-w-0 flex-[1_1_180px] flex-col gap-2.5 px-5 py-[18px] ${outlined ? "outline outline-1 outline-ahead" : ""}`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-2xl font-medium text-ink">{score}</span>
        {badge && (
          <span
            className={`rounded-full border px-1.5 font-mono text-[9px] tracking-[0.1em] ${badge === "MVP" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
          >
            {badge}
          </span>
        )}
      </span>
      <div className="h-1.5 rounded-sm bg-line" aria-hidden="true">
        <div className={`h-1.5 rounded-sm ${bar}`} style={{ width: `${score}%` }} />
      </div>
      {why && <span className="text-note text-muted">{why}</span>}
    </li>
  );
}
