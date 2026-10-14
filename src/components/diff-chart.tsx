import {
  buildDiffChart,
  DEFAULT_BOX,
  formatDiff,
  type ChartRange,
  type DiffPoint,
} from "@/lib/diff-chart";

export type TurningPointMarker = {
  minute: number;
  label: string;
  // "behind" (red) when the moment cost you the lead, "ahead" (blue) when it won it.
  tone: "ahead" | "behind";
};

type Props = {
  points: DiffPoint[];
  markers?: TurningPointMarker[];
  // Read aloud by screen readers in place of the picture, so describe the shape.
  description: string;
  // A fixed y range and how to label its ticks, instead of fitting the data
  // and labelling "+1.5k".
  range?: ChartRange;
  formatTick?: (value: number) => string;
};

const TONE_COLOR = { ahead: "var(--color-ahead)", behind: "var(--color-behind)" };

// Line chart of "you minus your opponent" over a game. Blue fill is time
// spent ahead, red fill is time spent behind. Numbered circles mark the
// turning points, matching the numbered list next to the chart.
export function DiffChart({
  points,
  markers = [],
  description,
  range,
  formatTick = formatDiff,
}: Props) {
  const chart = buildDiffChart(points, DEFAULT_BOX, range);
  const { width, height, left, right } = DEFAULT_BOX;
  const diffAt = (minute: number) =>
    points.reduce((best, p) =>
      Math.abs(p.minute - minute) < Math.abs(best.minute - minute) ? p : best,
    ).diff;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={description}
      className="block font-mono"
    >
      <g stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="4 6">
        {chart.yTicks
          .filter((v) => v !== 0)
          .map((v) => (
            <line key={v} x1={left} x2={width - right} y1={chart.y(v)} y2={chart.y(v)} />
          ))}
      </g>
      <g fontSize="22" fill="var(--color-faint)" textAnchor="end">
        {chart.yTicks.map((v) => (
          <text key={v} x={left - 12} y={chart.y(v) + 7}>
            {formatTick(v)}
          </text>
        ))}
      </g>

      <path d={chart.aheadArea} fill="var(--color-ahead)" fillOpacity="0.35" />
      <path d={chart.behindArea} fill="var(--color-behind)" fillOpacity="0.3" />
      <line
        x1={left}
        x2={width - right}
        y1={chart.zeroY}
        y2={chart.zeroY}
        stroke="var(--color-faint)"
        strokeWidth="1.5"
      />
      <path
        d={chart.line}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      <g fontSize="19" fontWeight="500" textAnchor="middle">
        {markers.map((m, i) => (
          <g key={m.minute}>
            <title>{m.label}</title>
            <circle
              cx={chart.x(m.minute)}
              cy={chart.y(diffAt(m.minute))}
              r="18"
              fill="var(--color-page)"
              stroke={TONE_COLOR[m.tone]}
              strokeWidth="3"
            />
            <text
              x={chart.x(m.minute)}
              y={chart.y(diffAt(m.minute)) + 6.5}
              fill={TONE_COLOR[m.tone]}
            >
              {i + 1}
            </text>
          </g>
        ))}
      </g>

      <g fontSize="22" fill="var(--color-faint)" textAnchor="middle">
        {chart.xTicks.map((m, i) => {
          const isLast = i === chart.xTicks.length - 1;
          // Keep the last label ("30 min") inside the picture at the right edge.
          const nearEdge = chart.x(m) > width - right - 30;
          return (
            <text
              key={m}
              x={isLast && nearEdge ? width : chart.x(m)}
              y={height - 4}
              textAnchor={isLast && nearEdge ? "end" : undefined}
            >
              {isLast ? `${m} min` : m}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
