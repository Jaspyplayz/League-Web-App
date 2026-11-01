import type { PhaseRating } from "@/lib/analyzer/phase-score";
import type { PlayerScore } from "@/lib/analyzer/score";
import { PanelHeading } from "@/components/ui/panel-heading";

// "Game by phase": your early, mid and late ratings, then your game score as
// the overall one. Each is 0 to 100, ranked against saved games of the same
// role, so they're performance numbers, not grades of your decisions. It sits
// under "You vs your opponent", in the same panel, with a line between them.
export function PhaseRatings({
  phases,
  overall,
}: {
  phases: PhaseRating[];
  overall: PlayerScore | null;
}) {
  const playedLate = phases.some((p) => p.phase === "late");
  return (
    <section
      aria-labelledby="phase-ratings"
      className="flex min-w-0 flex-col gap-3 border-t border-divider p-5"
    >
      <PanelHeading id="phase-ratings">Game by phase</PanelHeading>
      <ul className="grid grid-cols-2 gap-2">
        {overall && (
          <Tile
            label="Overall"
            span="Whole game"
            score={overall.score}
            badge={overall.badge}
            why="Your game score, as on the match row"
          />
        )}
        {phases.map((p) => (
          <Tile
            key={p.phase}
            label={p.label}
            span={phaseSpan(p)}
            score={p.score}
            why={whyLine(p)}
          />
        ))}
      </ul>
      <p className="text-note text-quiet">
        Each phase is ranked against the same role&apos;s saved games for that phase: 71 means
        higher than 71% of them.
        {!playedLate && " Games that end before 30 minutes have no late game rating."}
      </p>
    </section>
  );
}

// When a phase ran: "14 to 25 min", or "25 to end min" for the late game.
export function phaseSpan(p: Pick<PhaseRating, "phase" | "fromMinute" | "toMinute">): string {
  return `${p.fromMinute} to ${p.phase === "late" ? "end" : p.toMinute} min`;
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
  span,
  score,
  why,
  badge = null,
}: {
  label: string;
  span: string;
  score: number;
  why: string | null;
  badge?: PlayerScore["badge"];
}) {
  // Blue at 50 or more (better than most), red below, as everywhere else.
  const bar = score >= 50 ? "bg-ahead" : "bg-behind";
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-md bg-raised px-3 py-2.5">
      <span className="flex flex-col">
        <span className="text-note">{label}</span>
        <span className="text-xs text-quiet">{span}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-title font-bold tabular-nums">{score}</span>
        {badge && (
          <span
            className={`rounded-full border px-1.5 text-xs ${badge === "MVP" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
          >
            {badge}
          </span>
        )}
      </span>
      <div className="h-1.5 rounded-sm bg-divider" aria-hidden="true">
        <div className={`h-1.5 rounded-sm ${bar}`} style={{ width: `${score}%` }} />
      </div>
      {why && <span className="text-xs text-quiet">{why}</span>}
    </li>
  );
}
