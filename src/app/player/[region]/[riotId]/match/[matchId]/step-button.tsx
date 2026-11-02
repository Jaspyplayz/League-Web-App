import type { ReactNode } from "react";

// An icon button: the replay's previous and next, and Game review's first,
// previous, next and last. `children` is the icon's SVG path, drawn in a 24
// by 24 box. `className` sets its size and fill, one step off what it sits
// on; the default is the replay's, on its raised play bar.
export function StepButton({
  label,
  disabled = false,
  unavailable,
  onClick,
  className = "size-10 bg-panel text-main hover:bg-divider disabled:opacity-40 disabled:hover:bg-panel",
  children,
}: {
  label: string;
  // A disabled button leaves the tab order. An unavailable one stays in it
  // and is only marked as unavailable, so stepping onto the last play doesn't
  // lose your keyboard focus.
  disabled?: boolean;
  unavailable?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
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
        {children}
      </svg>
    </button>
  );
}
