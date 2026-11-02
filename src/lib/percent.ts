// A chance or share from 0 to 1, written as a percent. Whole points where the
// number stands alone, such as the replay's win chance; a tenth of a point
// where it goes with a play's swing, which is often under a point.

// 0.6143 -> "61%".
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// 0.5234 -> "52.3%".
export function formatPercentTenths(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
