import { DiffChart } from "@/components/diff-chart";
import { PanelHeading } from "@/components/ui/panel-heading";
import { describeDiff } from "@/lib/analyzer/describe";
import { formatClock } from "@/lib/analyzer/format";
import { OBJECTIVE_NAMES, type Objective, type ObjectiveKind } from "@/lib/analyzer/objectives";
import { buildDiffChart, DEFAULT_BOX, type DiffPoint } from "@/lib/diff-chart";
import { LegendSwatch } from "./legend-swatch";
import { panelClass } from "@/components/ui/panel";
import { SwipeHint } from "@/components/ui/swipe-hint";

// Your team's gold minus the enemy team's, with the objectives each team
// took lined up underneath. Shows whether the game was won or lost as a team,
// whatever happened in your own matchup.
export function TeamGold({ points, objectives }: { points: DiffPoint[]; objectives: Objective[] }) {
  return (
    <section
      aria-labelledby="team-gold-heading"
      className={`${panelClass} flex min-w-0 flex-[999_1_600px] flex-col gap-[18px] p-6`}
    >
      <PanelHeading id="team-gold-heading">Team gold</PanelHeading>
      <div className="flex flex-wrap gap-[18px] text-[13px] text-muted">
        <LegendSwatch className="bg-ahead">Your team ahead</LegendSwatch>
        <LegendSwatch className="bg-behind">Enemy team ahead</LegendSwatch>
      </div>
      {/* On phones the chart keeps a readable size and scrolls sideways. */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[600px] flex-col gap-[18px]">
          <DiffChart
            points={points}
            description={describeDiff(points, "Your team's gold minus the enemy team's")}
          />
          {objectives.length > 0 && <ObjectiveStrip points={points} objectives={objectives} />}
        </div>
      </div>
      <SwipeHint />
    </section>
  );
}

const ROW_HEIGHT = 34;
const RADIUS = 14;
// Closer than this and two circles would overlap, so the second one moves
// to the next row.
const MIN_GAP = RADIUS * 2 + 4;
const MAX_ROWS_PER_TEAM = 3;

type Placed = Objective & { x: number; row: number };

// Spreads circles over a few rows so objectives taken close together don't
// cover each other.
function placeRows(objectives: Objective[], x: (minute: number) => number): Placed[] {
  const lastX: number[] = [];
  return objectives.map((o) => {
    const ox = x(o.timestamp / 60_000);
    let row = lastX.findIndex((prev) => ox - prev >= MIN_GAP);
    if (row === -1) row = lastX.length < MAX_ROWS_PER_TEAM ? lastX.length : MAX_ROWS_PER_TEAM - 1;
    lastX[row] = ox;
    return { ...o, x: ox, row };
  });
}

function ObjectiveStrip({ points, objectives }: { points: DiffPoint[]; objectives: Objective[] }) {
  // The same x scale as the chart above, so each circle sits under its minute.
  const { x } = buildDiffChart(points);
  const { width, left, right } = DEFAULT_BOX;
  const ours = placeRows(
    objectives.filter((o) => o.ours),
    x,
  );
  const theirs = placeRows(
    objectives.filter((o) => !o.ours),
    x,
  );
  const ourRows = Math.max(1, ...ours.map((o) => o.row + 1));
  const theirRows = Math.max(1, ...theirs.map((o) => o.row + 1));
  const top = 8;
  const dividerY = top + ourRows * ROW_HEIGHT;
  const height = dividerY + theirRows * ROW_HEIGHT + 8;
  const kindsUsed = [...new Set(objectives.map((o) => o.kind))];

  const circle = (o: Placed, y: number, tone: "ahead" | "behind") => (
    <g key={`${o.timestamp}-${o.kind}-${tone}`}>
      <title>
        {`${tone === "ahead" ? "Your team" : "Enemy team"}: ${OBJECTIVE_NAMES[o.kind].name}${o.count > 1 ? ` ×${o.count}` : ""} at ${formatClock(o.timestamp)}`}
      </title>
      <circle
        cx={o.x}
        cy={y}
        r={RADIUS}
        fill="var(--color-page)"
        stroke={`var(--color-${tone})`}
        strokeWidth="2.5"
      />
      <text x={o.x} y={y + 6} fill={`var(--color-${tone === "ahead" ? "ahead-soft" : "behind"})`}>
        {OBJECTIVE_NAMES[o.kind].short}
      </text>
    </g>
  );

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`Objectives. ${summarize(objectives, true, "Your team")} ${summarize(objectives, false, "The enemy team")}`}
        className="block font-mono"
      >
        <g fontSize="15" fill="var(--color-faint)" textAnchor="end">
          <text x={left - 12} y={top + ROW_HEIGHT / 2 + 5}>
            You
          </text>
          <text x={left - 12} y={dividerY + ROW_HEIGHT / 2 + 5}>
            Enemy
          </text>
        </g>
        <line
          x1={left}
          x2={width - right}
          y1={dividerY}
          y2={dividerY}
          stroke="var(--color-line-strong)"
          strokeWidth="1.5"
        />
        <g fontSize="15" fontWeight="500" textAnchor="middle">
          {ours.map((o) => circle(o, top + ROW_HEIGHT / 2 + o.row * ROW_HEIGHT, "ahead"))}
          {theirs.map((o) => circle(o, dividerY + ROW_HEIGHT / 2 + o.row * ROW_HEIGHT, "behind"))}
        </g>
      </svg>
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-faint" aria-hidden="true">
        {kindsUsed.map((kind) => (
          <span key={kind}>
            {OBJECTIVE_NAMES[kind].short} {OBJECTIVE_NAMES[kind].name}
          </span>
        ))}
      </p>
    </div>
  );
}

// "Your team took 3 Dragons, 1 Baron and 7 Towers."
function summarize(objectives: Objective[], ours: boolean, who: string): string {
  const counts = new Map<ObjectiveKind, number>();
  for (const o of objectives) {
    if (o.ours === ours) counts.set(o.kind, (counts.get(o.kind) ?? 0) + o.count);
  }
  if (counts.size === 0) return `${who} took no objectives.`;
  const parts = [...counts].map(([kind, n]) => `${n} ${OBJECTIVE_NAMES[kind].name}`);
  return `${who} took ${parts.join(", ")}.`;
}
