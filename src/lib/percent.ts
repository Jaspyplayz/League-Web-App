// 0.6143 -> "61%".
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// 0.5234 -> "52.3%".
export function formatPercentTenths(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
