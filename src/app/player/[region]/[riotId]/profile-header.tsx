import Image from "next/image";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { getDataDragon, profileIconUrl } from "@/lib/ddragon";
import { findQueue, formatTier, winRate } from "@/lib/match-summary";
import { REGIONS, type Region } from "@/lib/regions";
import { getRankedEntries, getSummoner } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { LeagueEntry } from "@/lib/riot/types";

type Props = { region: Region; puuid: string; gameName: string; tagLine: string };

export async function ProfileHeader({ region, puuid, gameName, tagLine }: Props) {
  // Start all three requests at once rather than one after another.
  const [summoner, ranked, dd] = await Promise.all([
    settle(getSummoner(region, puuid)),
    settle(getRankedEntries(region, puuid)),
    // Images are nice to have: if Data Dragon is down, show the page without them.
    getDataDragon().catch(() => null),
  ]);

  return (
    <section aria-label="Player summary" className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        {summoner.ok && dd && (
          <Image
            src={profileIconUrl(dd, summoner.value.profileIconId)}
            alt=""
            width={80}
            height={80}
            unoptimized
            className="rounded-2xl"
          />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">
            {gameName}
            <span className="text-zinc-500">#{tagLine}</span>
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {REGIONS[region].label}
            {summoner.ok && ` · Level ${summoner.value.summonerLevel}`}
          </p>
        </div>
      </div>

      {ranked.ok ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <RankedCard label="Ranked Solo/Duo" entry={findQueue(ranked.value, "RANKED_SOLO_5x5")} />
          <RankedCard label="Ranked Flex" entry={findQueue(ranked.value, "RANKED_FLEX_SR")} />
        </div>
      ) : (
        <RiotErrorNotice error={ranked.error} />
      )}
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
