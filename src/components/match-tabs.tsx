"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { loadBuildsAction } from "@/app/player/[region]/[riotId]/actions";
import { BuildView } from "@/components/build-view";
import { BuildSkeleton } from "@/components/loading-skeleton";
import { PlayerPicker, type PickerPlayer } from "@/components/player-picker";
import type { BuildsResult } from "@/lib/match-builds";

type Tab = "overview" | "team" | "build" | "runes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team analysis" },
  { id: "build", label: "Build" },
  { id: "runes", label: "Runes" },
];

// The tabs inside an open match row, like op.gg's: Overview (the
// scoreboard), Team analysis (both teams stat by stat), Build (items and
// skill order) and Runes. Build and Runes show one player at a time, picked
// from a row of champion icons.
//
// Overview, Team analysis and every rune page are drawn on the server and
// passed in, since the match data is already there. Builds need the match timeline, which the
// profile doesn't load, so they're fetched the first time Build is opened.
export function MatchTabs({
  region,
  matchId,
  overview,
  teamAnalysis,
  runePages,
  players,
  defaultPlayerId,
  analysisHref,
}: {
  region: string;
  matchId: string;
  overview: ReactNode;
  teamAnalysis: ReactNode;
  runePages: Record<number, ReactNode>; // keyed by participantId
  players: PickerPlayer[];
  defaultPlayerId: number; // the profile's own player
  analysisHref: string | null; // null when the game isn't analyzed (ARAM, Arena, under 15 minutes)
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [playerId, setPlayerId] = useState(defaultPlayerId);
  const [builds, setBuilds] = useState<BuildsResult | null>(null);
  const [loadingBuilds, startLoading] = useTransition();

  function open(next: Tab) {
    setTab(next);
    // Fetch builds once, the first time the tab is opened. After a failure,
    // opening the tab again tries again.
    if (next === "build" && builds?.status !== "ok" && !loadingBuilds) {
      startLoading(async () => {
        try {
          setBuilds(await loadBuildsAction(region, matchId));
        } catch {
          // Usually a new version of the site went live since the page loaded.
          setBuilds({ status: "failed", kind: "unavailable" });
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider">
        <div role="tablist" aria-label="Match details" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => open(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${tab === t.id ? "border-ahead text-main" : "border-transparent text-quiet hover:text-main"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {analysisHref && (
          // Expanding to the full page: the same match analysis page as before.
          <Link
            href={analysisHref}
            className="mb-1.5 rounded-md border border-ahead/40 px-3 py-1 text-note font-semibold text-ahead-soft transition-colors hover:bg-ahead/10"
          >
            Full analysis →
          </Link>
        )}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "overview" && overview}
        {tab === "team" && teamAnalysis}

        {(tab === "build" || tab === "runes") && (
          <div className="flex flex-col gap-4">
            <PlayerPicker players={players} selected={playerId} onSelect={setPlayerId} />
            {tab === "runes" && runePages[playerId]}
            {tab === "build" && <BuildTab result={builds} playerId={playerId} />}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildTab({ result, playerId }: { result: BuildsResult | null; playerId: number }) {
  if (!result) return <BuildSkeleton />;
  if (result.status === "failed") {
    return (
      <p className="text-note text-behind">
        {result.kind === "rate-limited"
          ? "Riot's request limit is used up for now. Open the tab again in a minute."
          : "Couldn't load builds from Riot. Open the tab again to retry."}
      </p>
    );
  }
  const build = result.builds[playerId];
  return build ? <BuildView build={build} /> : null;
}
