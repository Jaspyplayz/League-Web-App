// Text versions of the charts, read aloud by screen readers in place of the
// picture.

import type { DiffPoint } from "@/lib/diff-chart";
import { formatSigned } from "./format";

// "Gold difference against Syndra by minute. Ended −2,900. Biggest lead +650
// at minute 23. Furthest behind −2,900 at minute 31."
export function describeDiff(points: DiffPoint[], subject: string): string {
  if (points.length === 0) return `${subject}: no data.`;
  const best = points.reduce((a, b) => (b.diff > a.diff ? b : a));
  const worst = points.reduce((a, b) => (b.diff < a.diff ? b : a));
  const end = points[points.length - 1];
  const parts = [`${subject} by minute.`, `Ended ${formatSigned(end.diff)}.`];
  if (best.diff > 0) {
    parts.push(`Biggest lead ${formatSigned(best.diff)} at minute ${Math.floor(best.minute)}.`);
  }
  if (worst.diff < 0) {
    parts.push(
      `Furthest behind ${formatSigned(worst.diff)} at minute ${Math.floor(worst.minute)}.`,
    );
  }
  return parts.join(" ");
}
