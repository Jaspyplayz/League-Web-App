import { ProfileIcon, RankEmblem } from "@/components/game-icons";
import { PinButton } from "@/components/saved-players";
import { secondsUntilUpdate } from "@/db/freshness";
import { getDataDragon } from "@/lib/ddragon";
import { findQueue, formatTier, timeAgo, winRate } from "@/lib/match-summary";
import type { Profile } from "@/lib/profile-store";
import { REGIONS, type Region } from "@/lib/regions";
import type { LeagueEntry } from "@/lib/riot/types";
import { tierTrack, type TrackStep } from "@/lib/tiers";
import { UpdateButton } from "./update-button";

type Props = { region: Region; puuid: string; gameName: string; tagLine: string; profile: Profile };

export async function ProfileHeader({ region, puuid, gameName, tagLine, profile }: Props) {
  // Images are nice to have: if Data Dragon is down, show the page without them.
  const dd = await getDataDragon().catch(() => null);
  // A Server Component renders once per request, so reading the clock here is
  // fine (see recent-matches.tsx for the same note).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <section aria-label="Player summary" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <ProfileIcon
            dd={dd}
            iconId={profile.profileIconId}
            level={profile.summonerLevel}
            name={gameName}
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold">
                {gameName}
                <span className="text-zinc-500">#{tagLine}</span>
              </h1>
              <PinButton region={region} gameName={gameName} tagLine={tagLine} />
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RankedCard label="Ranked Solo/Duo" entry={findQueue(profile.ranked, "RANKED_SOLO_5x5")} />
        <RankedCard label="Ranked Flex" entry={findQueue(profile.ranked, "RANKED_FLEX_SR")} />
      </div>
    </section>
  );
}

// One queue's rank: Riot's emblem, tier and LP, wins and losses, and a track
// showing how far through the tier the player is.
function RankedCard({ label, entry }: { label: string; entry: LeagueEntry | null }) {
  const track = entry ? tierTrack(entry.tier, entry.rank) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="font-mono text-xs tracking-widest text-zinc-500 uppercase">{label}</p>
      {entry ? (
        <>
          <div className="flex items-center gap-4">
            <RankEmblem tier={entry.tier} size={64} />
            <div className="flex flex-col">
              <p className="text-xl font-semibold">{formatTier(entry)}</p>
              <p className="font-mono text-sm">{entry.leaguePoints} LP</p>
            </div>
            <p className="ml-auto text-right font-mono text-sm text-zinc-600 dark:text-zinc-400">
              {entry.wins}W {entry.losses}L
              <br />
              {Math.round(winRate(entry.wins, entry.losses) * 100)}% win rate
            </p>
          </div>
          {track && <TierTrack steps={track} />}
        </>
      ) : (
        <p className="text-xl font-semibold text-zinc-500">Unranked</p>
      )}
    </div>
  );
}

// Dots on a line, lowest division on the left: filled for divisions already
// passed, a ring for the current one, hollow for the ones still ahead.
function TierTrack({ steps }: { steps: TrackStep[] }) {
  const current = steps.find((s) => s.state === "current");
  return (
    <ol
      aria-label={current ? `Rank progress: currently ${current.label}` : "Rank progress"}
      className="relative flex justify-between pt-1"
    >
      {/* The line behind the dots. */}
      <div aria-hidden="true" className="absolute top-[11px] right-2 left-2 h-0.5 bg-line-strong" />
      {steps.map((step) => (
        <li key={step.label} className="relative flex w-8 flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={`size-3.5 rounded-full border-2 ${
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
