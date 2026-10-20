"use client";

// The personal records a game set, shown at the top of the 60-second review
// (src/lib/analyzer/records.ts picks them). The page works them out on the
// server and hands them down through this context, the way the review's
// buttons reach the replay through review-links.tsx, so the sections in
// between don't need to pass them along.

import Link from "next/link";
import { createContext, use, type ReactNode } from "react";

export type ReviewRecordsValue = {
  // One sentence per record: "Most CS at 10 in your 23 jungle games this
  // season: 82 CS, beating 76 CS."
  lines: string[];
  // The season's records on the Champions tab.
  href: string;
};

const ReviewRecordsContext = createContext<ReviewRecordsValue | null>(null);

export function ReviewRecordsProvider({
  value,
  children,
}: {
  value: ReviewRecordsValue | null;
  children: ReactNode;
}) {
  return <ReviewRecordsContext value={value}>{children}</ReviewRecordsContext>;
}

// Nothing when the game set no record.
export function RecordLines() {
  const records = use(ReviewRecordsContext);
  if (!records || records.lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-ahead/50 bg-ahead/10 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-label uppercase tracking-[0.12em] text-ahead-soft">
          {records.lines.length === 1 ? "Personal record" : "Personal records"}
        </p>
        <Link href={records.href} className="text-note text-muted underline hover:text-ink">
          All your records
        </Link>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-ink">
        {records.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
