"use client";

import { useId, useState, type ReactNode } from "react";

// A row that opens a panel underneath it when clicked, like the match list
// on op.gg. The row and the panel are both rendered on the server and passed
// in, so this component only has to remember one thing: whether it's open.
//
// The whole row is clickable for mouse users, and the chevron is a real
// <button> so keyboard and screen reader users get the same toggle.
export function ExpandableRow({
  row,
  rowClassName,
  label,
  children,
}: {
  row: ReactNode; // what's always visible
  rowClassName: string; // the row's box: border, background, padding
  label: string; // what the button toggles, e.g. "details for this Ahri game"
  children: ReactNode; // the panel
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <div
        // The button below has no onClick of its own: its click (including
        // Enter or Space on the keyboard) bubbles up to this one.
        onClick={(event) => {
          // A link inside the row (like a player's name) goes to its page
          // instead of opening the panel.
          if (event.target instanceof Element && event.target.closest("a")) return;
          setOpen((wasOpen) => !wasOpen);
        }}
        className={`${rowClassName} flex cursor-pointer items-center gap-3 transition-colors hover:bg-surface-hover ${open ? "rounded-t-soft rounded-b-none" : "soft-round"}`}
      >
        {row}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`${open ? "Hide" : "Show"} ${label}`}
          className="soft-round-sm shrink-0 p-1 text-placeholder hover:text-ink"
        >
          <Chevron open={open} />
        </button>
      </div>
      {/* Only rendered while open, so a closed row doesn't load the panel's
          images. */}
      {open && (
        <div
          id={panelId}
          className="rounded-b-soft border border-t-0 border-line-strong bg-page/60 px-[18px] py-4"
        >
          {children}
        </div>
      )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
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
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
