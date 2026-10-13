// Geometry for the "you vs your opponent" difference chart (gold, CS, XP...).
// Kept free of React so it can be unit tested: it turns a list of
// per-minute differences into SVG coordinates and path strings.

export type DiffPoint = { minute: number; diff: number };

export type ChartBox = {
  width: number;
  height: number;
  // Space reserved around the plot for axis labels.
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const DEFAULT_BOX: ChartBox = {
  width: 960,
  height: 312,
  left: 64,
  right: 24,
  top: 24,
  bottom: 36,
};

export type DiffChart = {
  x: (minute: number) => number;
  y: (diff: number) => number;
  zeroY: number;
  line: string;
  // Filled area where you are ahead (above zero) and behind (below zero).
  aheadArea: string;
  behindArea: string;
  yTicks: number[];
  xTicks: number[];
};

export function buildDiffChart(points: DiffPoint[], box: ChartBox = DEFAULT_BOX): DiffChart {
  if (points.length < 2) throw new Error("A diff chart needs at least two points.");

  const diffs = points.map((p) => p.diff);
  const step = tickStep(Math.max(...diffs, 0) - Math.min(...diffs, 0));
  // Round the range outward to whole ticks and always include zero.
  const maxDiff = Math.max(step, Math.ceil(Math.max(...diffs) / step) * step);
  const minDiff = Math.min(-step, Math.floor(Math.min(...diffs) / step) * step);
  const firstMinute = points[0].minute;
  const lastMinute = points[points.length - 1].minute;

  const plotLeft = box.left;
  const plotRight = box.width - box.right;
  const plotTop = box.top;
  const plotBottom = box.height - box.bottom;

  const x = (minute: number) =>
    plotLeft + ((minute - firstMinute) / (lastMinute - firstMinute)) * (plotRight - plotLeft);
  const y = (diff: number) =>
    plotTop + ((maxDiff - diff) / (maxDiff - minDiff)) * (plotBottom - plotTop);
  const zeroY = y(0);

  const withCrossings = insertZeroCrossings(points);
  const toPath = (pts: DiffPoint[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(x(p.minute))},${fmt(y(p.diff))}`).join(" ");
  const toArea = (clamp: (d: number) => number) =>
    `${toPath(withCrossings.map((p) => ({ minute: p.minute, diff: clamp(p.diff) })))} ` +
    `L${fmt(x(lastMinute))},${fmt(zeroY)} L${fmt(x(firstMinute))},${fmt(zeroY)} Z`;

  const yTicks: number[] = [];
  for (let v = maxDiff; v >= minDiff; v -= step) yTicks.push(v);

  const xTicks: number[] = [];
  for (let m = Math.ceil(firstMinute / 10) * 10; m <= lastMinute; m += 10) xTicks.push(m);

  return {
    x,
    y,
    zeroY,
    line: toPath(points),
    aheadArea: toArea((d) => Math.max(d, 0)),
    behindArea: toArea((d) => Math.min(d, 0)),
    yTicks,
    xTicks,
  };
}

// Where the line crosses zero, add a point exactly on zero so the blue and
// amber areas meet cleanly instead of overlapping.
export function insertZeroCrossings(points: DiffPoint[]): DiffPoint[] {
  const out: DiffPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.diff < 0 && b.diff > 0) || (a.diff > 0 && b.diff < 0)) {
      const t = a.diff / (a.diff - b.diff);
      out.push({ minute: a.minute + t * (b.minute - a.minute), diff: 0 });
    }
    out.push(b);
  }
  return out;
}

// Short axis label: 1500 -> "+1.5k", -2000 -> "−2k" (with a real minus sign).
export function formatDiff(value: number): string {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  const text = abs >= 1000 ? `${Number((abs / 1000).toFixed(1))}k` : String(abs);
  return sign + text;
}

function tickStep(span: number): number {
  if (span <= 400) return 100;
  if (span <= 2000) return 500;
  if (span <= 6000) return 1000;
  if (span <= 12000) return 2000;
  return 5000;
}

function fmt(n: number): string {
  return Number(n.toFixed(1)).toString();
}
