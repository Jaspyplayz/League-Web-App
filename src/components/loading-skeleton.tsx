import type { ReactNode } from "react";
import { MatchListSkeleton } from "@/components/match-list-skeleton";
import { Panel } from "@/components/ui/panel";

// Grey blocks in the shape of a page, shown while the real panels are still
// on their way. The pulse is Tailwind's, and motion-safe turns it off when
// the player asked for reduced motion. Screen readers get the label. The
// blocks themselves stay quiet.

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-7 motion-safe:animate-pulse">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded bg-line-strong ${className}`} />;
}

export function ProfileSkeleton() {
  return (
    <Frame label="Looking up player">
      <Bar className="h-12 w-64" />
      <Bar className="h-9 w-full max-w-md" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
          <Panel aria-hidden="true" className="flex h-28 flex-col gap-3 p-4">
            <Bar className="h-3 w-16" />
            <Bar className="h-6 w-32" />
          </Panel>
          <Panel aria-hidden="true" className="flex h-28 flex-col gap-3 p-4">
            <Bar className="h-3 w-16" />
            <Bar className="h-6 w-32" />
          </Panel>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Bar className="h-6 w-40" />
          <MatchListSkeleton quiet />
        </div>
      </div>
    </Frame>
  );
}

export function MatchSkeleton() {
  return (
    <Frame label="Analyzing match">
      <Bar className="h-4 w-28" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Bar className="h-10 w-40" />
        <Bar className="h-8 w-32" />
      </div>
      <Panel aria-hidden="true" className="flex flex-col gap-3 p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} className="h-8 w-full" />
        ))}
      </Panel>
      <Panel aria-hidden="true" className="h-48 p-6" />
      <Panel aria-hidden="true" className="h-32 p-6" />
    </Frame>
  );
}

export function InsightsSkeleton() {
  return (
    <Frame label="Loading insights">
      <Bar className="h-12 w-72" />
      <Bar className="h-9 w-full max-w-md" />
      <ChartPlaceholders />
    </Frame>
  );
}

// The chart area under the progress bar, while the first games are still
// being stored. The bar already announces the wait, so these blocks are quiet.
export function ChartPlaceholders() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5 motion-safe:animate-pulse">
      <Panel className="h-40 p-6" />
      <Panel className="h-56 p-6" />
      <div className="flex flex-wrap gap-5">
        <Panel className="h-36 min-w-60 flex-1 p-6" />
        <Panel className="h-36 min-w-60 flex-1 p-6" />
      </div>
    </div>
  );
}

export function PanelSkeleton({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <Panel aria-hidden="true" className="flex h-36 flex-col gap-3 p-5">
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-40" />
        <Bar className="h-3 w-32" />
      </Panel>
    </Frame>
  );
}

export function BuildSkeleton() {
  return (
    <Frame label="Loading builds">
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="size-8" />
          ))}
        </div>
        <Bar className="h-3 w-48" />
        <Bar className="h-3 w-36" />
      </div>
    </Frame>
  );
}
