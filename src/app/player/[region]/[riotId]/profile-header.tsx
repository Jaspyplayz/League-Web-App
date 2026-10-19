import { Suspense } from "react";
import { ProfileIcon, RankEmblem } from "@/components/game-icons";
import { LiveBadge } from "@/components/live-badge";
import { PinButton } from "@/components/saved-players";
import { ThisIsMe } from "@/components/this-is-me";
import { secondsUntilUpdate } from "@/db/freshness";
import { getDataDragon } from "@/lib/ddragon";
import { findQueue, formatTier, timeAgo, winRate } from "@/lib/match-summary";
import { loadRankHistory, type Profile } from "@/lib/profile-store";
import { graphPoints, type GraphPoint } from "@/lib/rank-history";
import { REGIONS, type Region } from "@/lib/regions";
import type { LeagueEntry } from "@/lib/riot/types";
import { tierTrack, type TrackStep } from "@/lib/tiers";
import { LpGraph } from "./lp-graph";
import { UpdateButton } from "./update-button";
import { panelClass } from "@/components/ui/panel";
import { SegmentBar } from "@/components/ui/segment-bar";

type Props = { region: Region; puuid: string; gameName: string; tagLine: string; profile: Profile };

// The top of the profile: icon, Riot ID, region and the Update button. The
// rank cards live in the side column instead (RankCards below), next to the
// match list, like op.gg.
export async function ProfileHeader({ region, puuid, gameName, tagLine, profile }: Props) {
  // A Server Component renders once per request, so reading the clock here is
  // fine (see recent-matches.tsx for the same note).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Images are nice to have: if Data Dragon is down, show the page without them.
  const dd = await getDataDragon().catch(() => null);

  return (
    <section aria-label="Player summary" className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex items-center gap-5">
        <ProfileIcon
          dd={dd}
          iconId={profile.profileIconId}
          level={profile.summonerLevel}
          name={gameName}
        />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-[0.06em] uppercase">
              {gameName}
              <span className="text-faint">#{tagLine}</span>
            </h1>
            <PinButton region={region} gameName={gameName} tagLine={tagLine} />
            <ThisIsMe region={region} puuid={puuid} gameName={gameName} tagLine={tagLine} />
            {/* Its own Suspense boundary, so a slow answer never holds up the header. */}
            <Suspense fallback={null}>
              <LiveBadge region={region} puuid={puuid} />
            </Suspense>
          </div>
          <p className="text-muted">
            {REGIONS[region].label}
            {profile.summonerLevel !== null && ` · Level ${profile.summonerLevel}`}
          </p>
        </div>
      </div>
      <UpdateButton
        // A new snapshot gets a new key, which resets the button's cooldown.
        key={profile.updatedAt.getTime()}
        region={region}
        puuid={puuid}
        updatedLabel={timeAgo(profile.updatedAt.getTime(), now)}
        secondsUntilReady={secondsUntilUpdate(profile.updatedAt, new Date(now))}
      />
    </section>
  );
}

// Solo/Duo and Flex, stacked, for the side column of the profile.
export async function RankCards({ puuid, profile }: { puuid: string; profile: Profile }) {
  // eslint-disable-next-line react-hooks/purity
  const now = new Date(Date.now());
  // Saved ranks for the LP graph. Comes from our database only, never Riot.
  const history = await loadRankHistory(puuid, now);
  const graph = (queueType: string) => graphPoints(history, queueType, now);

  return (
    <>
      <RankedCard
        label="Ranked Solo/Duo"
        entry={findQueue(profile.ranked, "RANKED_SOLO_5x5")}
        graph={graph("RANKED_SOLO_5x5")}
      />
      <RankedCard
        label="Ranked Flex"
        entry={findQueue(profile.ranked, "RANKED_FLEX_SR")}
        graph={graph("RANKED_FLEX_SR")}
      />
    </>
  );
}

// One queue's rank: Riot's emblem, tier and LP, wins and losses with the win
// rate as a health bar, a track showing how far through the tier the player
// is, and the LP graph.
function RankedCard({
  label,
  entry,
  graph,
}: {
  label: string;
  entry: LeagueEntry | null;
  graph: GraphPoint[];
}) {
  const track = entry ? tierTrack(entry.tier, entry.rank) : null;
  const rate = entry ? winRate(entry.wins, entry.losses) : 0;

  return (
    <section className={`${panelClass} flex flex-col gap-3 p-4`}>
      <h2 className="font-mono text-label tracking-widest text-faint uppercase">{label}</h2>
      {entry ? (
        <>
          <div className="flex items-center gap-3">
            <RankEmblem tier={entry.tier} size={56} />
            <div className="flex min-w-0 flex-col">
              <p className="font-display text-2xl leading-tight font-semibold tracking-[0.04em] uppercase">
                {formatTier(entry)}
              </p>
              <p className="font-mono text-sm">{entry.leaguePoints} LP</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="flex justify-between font-mono text-xs text-faint">
              <span>
                <span className="text-ahead">{entry.wins}W</span>{" "}
                <span className="text-behind">{entry.losses}L</span>
              </span>
              <span>
                <span className="text-ink">{Math.round(rate * 100)}%</span> win rate
              </span>
            </p>
            {/* Blue blocks for the share of wins, red for losses. */}
            <SegmentBar
              filled={rate}
              segments={20}
              on="bg-ahead"
              off="bg-behind"
              label={`${Math.round(rate * 100)}% win rate`}
            />
          </div>
          {track && <TierTrack steps={track} />}
          <LpGraph points={graph} />
        </>
      ) : (
        <p className="font-display text-2xl font-semibold text-faint uppercase">Unranked</p>
      )}
    </section>
  );
}

// Diamonds on a line, lowest division on the left: filled for divisions
// already passed, a ring for the current one, hollow for the ones still ahead.
function TierTrack({ steps }: { steps: TrackStep[] }) {
  const current = steps.find((s) => s.state === "current");
  return (
    <ol
      aria-label={current ? `Rank progress: currently ${current.label}` : "Rank progress"}
      className="relative flex justify-between pt-1"
    >
      {/* The line behind the diamonds. */}
      <div aria-hidden="true" className="absolute top-[11px] right-2 left-2 h-0.5 bg-line-strong" />
      {steps.map((step) => (
        <li key={step.label} className="relative flex w-8 flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={`size-3 rotate-45 border-2 ${
              step.state === "done"
                ? "border-ahead bg-ahead"
                : step.state === "current"
                  ? "border-ahead bg-page ring-2 ring-ahead/40"
                  : "border-line-strong bg-page"
            }`}
          />
          <span
            className={`font-mono text-[11px] ${step.state === "current" ? "font-semibold text-ink" : "text-faint"}`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
