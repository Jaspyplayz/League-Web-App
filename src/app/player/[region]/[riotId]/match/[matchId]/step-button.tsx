import type { ReactNode } from "react";

// A square icon button, like the replay's previous, play and next buttons.
// `children` is the icon's SVG path, drawn in a 24 by 24 box.
export function StepButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-[10px] border border-line-strong bg-page text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
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
