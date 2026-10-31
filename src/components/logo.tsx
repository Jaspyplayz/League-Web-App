// The Turnpoint mark: a T on a rounded tile. The tile takes the text color and
// the T the page color, like the main button, so it flips with the theme
// (JAS-78). It isn't blue, because blue only means you, ahead or a win.
// Decorative, so screen readers skip it; the link around it carries the name.
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="30" height="30" rx="8" fill="var(--color-main)" />
      <rect x="8" y="8" width="14" height="3.6" rx="1.2" fill="var(--color-page)" />
      <rect x="13.2" y="8" width="3.6" height="14" rx="1.2" fill="var(--color-page)" />
    </svg>
  );
}
