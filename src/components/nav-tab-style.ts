// The header tab's look, shared by NavTab and the plain link the header shows
// while NavTab loads. Active tabs get a blue line along the header's bottom.
export function navTabClass(active: boolean): string {
  return `-mb-px flex items-center border-b-2 px-3.5 font-display text-[17px] font-semibold tracking-[0.08em] uppercase transition-colors ${
    active ? "border-ahead text-ink" : "border-transparent text-faint hover:text-ink"
  }`;
}
