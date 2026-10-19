// The Turnpoint mark: a lead line that dips red (behind), bottoms out at a
// dot, then climbs back blue (ahead). The dot is the turning point the match
// analyzer looks for. Decorative, so screen readers skip it.
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
        stroke="var(--color-line-strong)"
        strokeWidth="2"
      />
      <path
        d="M6 9 L12.5 20.5"
        stroke="var(--color-behind)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M12.5 20.5 L24 7.5"
        stroke="var(--color-ahead)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="12.5" cy="20.5" r="3" fill="var(--color-ink)" />
    </svg>
  );
}
