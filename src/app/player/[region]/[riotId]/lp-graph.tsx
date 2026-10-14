import { GRAPH_DAYS, type GraphPoint } from "@/lib/rank-history";
import { scoreLabel } from "@/lib/tiers";

// The last 30 days of LP, like DeepLoL's "Last 30d" chart. Drawn as steps,
// because a rank stays put between games: the line runs flat until the next
// change, then jumps. Points come from graphPoints() in rank-history.ts.
const WIDTH = 280;
const HEIGHT = 120;
const PAD = { top: 8, right: 8, bottom: 18, left: 28 };

export function LpGraph({ points }: { points: GraphPoint[] }) {
  if (points.length === 0) return null;

  const scores = points.map((p) => p.score);
  // At least one division of height, so a flat line sits mid-graph.
  const low = Math.min(...scores) - 50;
  const high = Math.max(Math.max(...scores) + 50, low + 100);
  const x = (fraction: number) => PAD.left + fraction * (WIDTH - PAD.left - PAD.right);
  const y = (score: number) =>
    PAD.top + (1 - (score - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);

  // Gridlines on division boundaries (every 100), or on tiers (every 400)
  // when the range is too wide for that to stay readable.
  const step = high - low > 600 ? 400 : 100;
  const grid: number[] = [];
  for (let s = Math.ceil(low / step) * step; s <= high; s += step) grid.push(s);

  // Each point holds until the next one; the last holds until today.
  let path = `M ${x(points[0].x)} ${y(points[0].score)}`;
  for (const p of points.slice(1)) path += ` H ${x(p.x)} V ${y(p.score)}`;
  path += ` H ${x(1)}`;

  const first = points[0];
  const last = points.at(-1)!;
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex justify-between text-xs text-faint">
        <span>Last {GRAPH_DAYS} days</span>
        {points.length === 1 && <span>Fills in as you play</span>}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`LP over the last ${GRAPH_DAYS} days: from ${first.label} to ${last.label}`}
        className="w-full"
      >
        {grid.map((s) => (
          <g key={s}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(s)}
              y2={y(s)}
              stroke="var(--color-line-strong)"
              strokeDasharray="2 3"
            />
            <text
              x={PAD.left - 4}
              y={y(s)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-faint font-mono text-[9px]"
            >
              {scoreLabel(s)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-ahead)" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.x)} cy={y(p.score)} r="2.5" fill="var(--color-ahead)">
            <title>{p.label}</title>
          </circle>
        ))}
        <text x={PAD.left} y={HEIGHT - 4} className="fill-faint font-mono text-[9px]">
          {GRAPH_DAYS}d ago
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-faint font-mono text-[9px]"
        >
          Today
        </text>
      </svg>
    </figure>
  );
}
