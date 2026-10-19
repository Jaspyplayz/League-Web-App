// The Turnpoint mark: a white T on a solid blue tile. Blue is the site's
// "you / ahead" color, and one solid shape stays clear even at favicon size.
// The T stays white in both themes because it sits on blue, not on the page.
// Decorative, so screen readers skip it.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" rx="8" fill="var(--color-ahead)" />
      <rect x="8" y="8" width="14" height="3.6" rx="1.2" fill="white" />
      <rect x="13.2" y="8" width="3.6" height="14" rx="1.2" fill="white" />
    </svg>
  );
}
