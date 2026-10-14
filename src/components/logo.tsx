// The Turnpoint mark: a line crossing from your side (blue dot) to your
// opponent's (red dot). Decorative, so screen readers skip it.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="28"
        height="28"
        rx="7"
        fill="none"
        stroke="var(--color-ahead)"
        strokeWidth="2"
      />
      <path d="M7 23 L23 7" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="19" r="2.6" fill="var(--color-ahead)" />
      <circle cx="19" cy="11" r="2.6" fill="var(--color-behind)" />
    </svg>
  );
}
