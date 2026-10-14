import { ProfileIcon } from "@/components/game-icons";
import { secondsUntilUpdate } from "@/db/freshness";
import { getDataDragon } from "@/lib/ddragon";
import { findQueue, formatTier, timeAgo, winRate } from "@/lib/match-summary";
import type { Profile } from "@/lib/profile-store";
import { REGIONS, type Region } from "@/lib/regions";
import type { LeagueEntry } from "@/lib/riot/types";
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
            <h1 className="text-3xl font-semibold">
              {gameName}
              <span className="text-zinc-500">#{tagLine}</span>
            </h1>
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

function RankedCard({ label, entry }: { label: string; entry: LeagueEntry | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="font-mono text-xs tracking-widest text-zinc-500 uppercase">{label}</p>
      {entry ? (
        <>
          <p className="text-xl font-semibold">
            {formatTier(entry)}{" "}
            <span className="font-mono text-base font-normal">{entry.leaguePoints} LP</span>
          </p>
          <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
            {entry.wins}W {entry.losses}L · {Math.round(winRate(entry.wins, entry.losses) * 100)}%
          </p>
        </>
      ) : (
        <p className="text-xl font-semibold text-zinc-500">Unranked</p>
      )}
    </div>
  );
}
