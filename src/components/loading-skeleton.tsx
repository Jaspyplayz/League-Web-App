import type { ReactNode } from "react";
import { MatchListSkeleton } from "@/components/match-list-skeleton";
import { LoadingBlock, LoadingStatus } from "@/components/ui/loading";
import { Panel } from "@/components/ui/panel";

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

// The match page while it's analyzed: layout A in grey (JAS-93), with what's
// already known for real: the back link, once the page knows the player, and
// the tab names.
export function MatchSkeleton({ back }: { back?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {back}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div aria-hidden="true" className="flex flex-col gap-2.5 motion-safe:animate-pulse">
            <LoadingBlock className="h-[30px] w-60 sm:w-[340px]" />
            <LoadingBlock className="h-3.5 w-44 sm:w-60" />
          </div>
          <div role="status">
            <LoadingStatus label="Analyzing the game" />
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-3 gap-1 border-b border-divider sm:flex"
      >
        {["Summary", "Replay", "Stats"].map((name, i) => (
          <span
            key={name}
            className={`-mb-px border-b-2 px-[18px] py-3 text-center ${i === 0 ? "border-main font-semibold" : "border-transparent font-medium text-quiet"}`}
          >
            {name}
          </span>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid items-start gap-6 motion-safe:animate-pulse lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex gap-3">
              <LoadingBlock className="h-[220px] w-2.5 rounded-sm sm:h-[300px]" />
              <LoadingBlock className="h-[220px] min-w-0 flex-1 sm:h-[300px]" />
            </div>
            <LoadingBlock className="h-[84px]" />
          </Panel>
          <Panel className="flex flex-col px-3.5 py-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex h-12 items-center gap-3">
                <LoadingBlock className="size-7 shrink-0" />
                <LoadingBlock className="h-3 w-16 sm:w-28" />
                <LoadingBlock className="mx-auto h-3 w-14 sm:w-20" />
                <LoadingBlock className="h-3 w-16 sm:w-28" />
                <LoadingBlock className="size-7 shrink-0" />
              </div>
            ))}
          </Panel>
        </div>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <LoadingBlock key={i} className="h-16" />
            ))}
          </div>
          <LoadingBlock className="h-[90px]" />
          {Array.from({ length: 3 }, (_, i) => (
            <LoadingBlock key={i} className="h-8" />
          ))}
        </Panel>
      </div>
    </div>
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
