"use client";

import { useState, type ReactNode } from "react";

// How many enemy champions show when a row opens, and how many more each
// "Show more" adds.
const STEP = 5;

// One champion's row in the Champions table, which opens to list the enemy
// champions faced in the same role. The cells are rendered on the server and
// passed in, so this only remembers whether the row is open and how many
// enemies are shown. Each champion gets its own <tbody>, which keeps a row
// and its enemies together.
export function ChampionRowGroup({
  cells,
  opponents,
  columns,
  label,
}: {
  cells: ReactNode; // the row's <td>s, all but the last one (the chevron)
  opponents: ReactNode[]; // one <tr> per enemy champion, most played first
  columns: number; // how many columns the table has, for full-width rows
  label: string; // e.g. "Ahri's games by enemy champion"
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(STEP);

  return (
    <tbody className="border-t border-divider">
      <tr
        // The button has no onClick of its own: its click (including Enter
        // or Space on the keyboard) bubbles up to the row.
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        // Lets the pinned champion cell match the row's background.
        data-open={open}
        // `raised`, not `select`, so the pinned champion cell (which has to be
        // solid) can match it. Fades in 0.12s and out 0.32s, like every hover.
        className={`group cursor-pointer transition-colors duration-320 ease-out hover:bg-raised hover:duration-120 motion-reduce:transition-none ${open ? "bg-raised" : ""}`}
      >
        {cells}
        <td className="px-1 text-right">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${label}`}
            className="rounded-sm p-1 text-quiet hover:text-main"
          >
            <Chevron open={open} />
          </button>
        </td>
      </tr>
      {open && opponents.slice(0, shown)}
      {open && opponents.length === 0 && (
        <tr>
          <td colSpan={columns} className="bg-page px-4 py-3 text-note text-quiet">
            No lane opponent in these games (modes like ARAM have no roles).
          </td>
        </tr>
      )}
      {open && opponents.length > shown && (
        <tr>
          <td colSpan={columns} className="bg-page px-3 py-2">
            {/* Sticky so it stays in view when the table scrolls sideways on a phone. */}
            <button
              type="button"
              onClick={() => setShown((n) => n + STEP)}
              className="sticky left-3 w-full max-w-[calc(100vw-4rem)] rounded-md bg-raised py-2 text-note font-medium text-main hover:bg-divider"
            >
              Show more ({opponents.length - shown} left)
            </button>
          </td>
        </tr>
      )}
    </tbody>
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
