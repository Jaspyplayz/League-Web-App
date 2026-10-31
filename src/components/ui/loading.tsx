"use client";

import { useEffect, useState, type ReactNode } from "react";

// The one loading pattern (JAS-93's states canvas): grey blocks in the shape
// of what's coming, so nothing jumps when it arrives, and one quiet line
// saying what's being fetched. Anything already known (a back link, the tab
// names, the player's name) should show for real, outside the blocks.

// Most lookups answer in a second or two. Past 8 seconds the player starts to
// wonder whether the page is broken, so the line says it's Riot, not us.
export const SLOW_ANSWER_MS = 8_000;
export const SLOW_ANSWER_LINE = "Riot is slow to answer. Still trying.";

// Calls onSlow once the section has been loading for 8 seconds. Returns a
// function that cancels it, for when the section arrives first.
export function whenRiotIsSlow(onSlow: () => void): () => void {
  const timer = setTimeout(onSlow, SLOW_ANSWER_MS);
  return () => clearTimeout(timer);
}

// The status line as drawn: a small spinner, what's being fetched and,
// once slow, the slow-answer sentence.
export function StatusLine({ label, slow }: { label: string; slow: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-note text-quiet">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5 shrink-0 motion-safe:animate-spin"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="40 100"
          strokeLinecap="round"
        />
      </svg>
      <span>{label}</span>
      {slow && <span>{SLOW_ANSWER_LINE}</span>}
    </p>
  );
}

// The status line with its timer. The server always draws it without the
// slow sentence; the browser adds it after 8 seconds.
export function LoadingStatus({ label }: { label: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => whenRiotIsSlow(() => setSlow(true)), []);
  return <StatusLine label={label} slow={slow} />;
}

// One grey block. Size and shape it with classes, like "h-12 w-64".
export function LoadingBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-divider ${className}`} />;
}

// A loading section: the status line, then the blocks. Screen readers hear the
// status line (and the slow sentence when it's added) and skip the blocks.
// Only the line is the live region, and it isn't marked busy: aria-busy tells
// screen readers to hold changes back, so the slow sentence would go unread.
export function LoadingSection({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div role="status">
        <LoadingStatus label={label} />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        {children}
      </div>
    </div>
  );
}
