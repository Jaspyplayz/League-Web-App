"use client";

// A panel heading with a "How to read this" button beside it, and the
// explanation that opens under them. Keeps long explanations one click away
// so the panel's content comes first, like the replay's own toggle.

import { useId, useState, type ReactNode } from "react";

export function HowToRead({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-note text-muted hover:text-ink"
        >
          How to read this
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={open ? "rotate-180" : ""}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div id={id} hidden={!open} className="flex flex-col gap-2 text-sm text-muted">
        {children}
      </div>
    </>
  );
}
