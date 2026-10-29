"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";

// A row that opens a panel underneath it when clicked, like the match list
// on op.gg. The row is rendered on the server and passed in. The panel is
// asked for the first time the row opens (`loadPanel`, a Server Action), not
// sent with the page: a match panel is a few hundred KB of page data, and a
// list of 50 games sent every closed panel along, about 12 MB in all. Once
// loaded, it stays, so closing and opening again costs nothing.
//
// The whole row is clickable for mouse users, and the chevron is a real
// <button> so keyboard and screen reader users get the same toggle.
export function ExpandableRow({
  row,
  rowClassName,
  label,
  loadPanel,
}: {
  row: ReactNode; // what's always visible
  rowClassName: string; // the row's box: border, background, padding
  label: string; // what the button toggles, e.g. "details for this Ahri game"
  loadPanel: () => Promise<ReactNode>; // renders the panel on the server
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<ReactNode>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  function load() {
    setFailed(false);
    startLoading(async () => {
      try {
        const loaded = await loadPanel();
        // A state change after an await isn't part of the transition unless
        // it's wrapped again. Unwrapped, a panel still fetching its code
        // would swap the whole match list for its loading skeleton.
        startLoading(() => setPanel(loaded));
      } catch {
        // Riot or the database didn't answer, or the site was updated since
        // this page loaded; the panel offers a retry.
        startLoading(() => setFailed(true));
      }
    });
  }

  function retry() {
    // The "Try again" button disappears while loading, so keyboard focus
    // goes back to the row's toggle instead of being lost.
    toggle.current?.focus();
    load();
  }

  return (
    <>
      <div
        // The button below has no onClick of its own: its click (including
        // Enter or Space on the keyboard) bubbles up to this one.
        onClick={(event) => {
          // A link inside the row (like a player's name) goes to its page
          // instead of opening the panel.
          if (event.target instanceof Element && event.target.closest("a")) return;
          if (!open && panel === null && !loading) load();
          setOpen(!open);
        }}
        className={`${rowClassName} flex cursor-pointer items-center gap-3 transition-colors hover:bg-surface-hover ${open ? "rounded-t-soft rounded-b-none" : "soft-round"}`}
      >
        {row}
        <button
          ref={toggle}
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
          images either. */}
      {open && (
        <div
          id={panelId}
          className="rounded-b-soft border border-t-0 border-line-strong bg-page/60 px-[18px] py-4"
        >
          {panel ??
            (failed ? (
              <p className="text-sm text-muted">
                Couldn&rsquo;t load this game&rsquo;s details.{" "}
                <button type="button" onClick={retry} className="text-ink underline hover:text-ahead">
                  Try again
                </button>
                , or refresh the page if it keeps failing.
              </p>
            ) : (
              <p aria-hidden="true" className="text-sm text-faint">
                Loading details…
              </p>
            ))}
        </div>
      )}
      {/* Always on the page, so screen readers announce what goes into it:
          a live region that appears with its text already inside is often
          skipped. */}
      <p role="status" className="sr-only">
        {open && panel === null
          ? failed
            ? "Couldn't load this game's details."
            : "Loading details…"
          : ""}
      </p>
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
