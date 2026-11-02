export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatPercentTenths(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
