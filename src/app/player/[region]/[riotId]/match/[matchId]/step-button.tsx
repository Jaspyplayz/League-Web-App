// An icon button for stepping through a game: the replay's previous and next,
// and Game review's first, previous, next and last.
export function StepButton({
  label,
  icon,
  disabled = false,
  unavailable,
  onClick,
  className,
}: {
  label: string;
  // The icon's SVG path, drawn in a 24 by 24 box.
  icon: string;
  // A disabled button leaves the tab order. An unavailable one stays in it,
  // marked only with aria-disabled.
  disabled?: boolean;
  unavailable?: boolean;
  onClick: () => void;
  // Its size and fill, one step off what it sits on.
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={unavailable}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center rounded-md ${className}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
    </button>
  );
}
