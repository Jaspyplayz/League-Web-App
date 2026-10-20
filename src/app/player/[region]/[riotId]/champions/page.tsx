import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { panelClass } from "@/components/ui/panel";
import { GAMES_PER_VIEW, loadChampionTab } from "@/lib/champion-store";
import { getDataDragon } from "@/lib/ddragon";
import { loadProfile } from "@/lib/profile-store";
import { loadSeasonRecords } from "@/lib/record-store";
import { queueIds, readQueueFilter } from "@/lib/queue-filters";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { SEASON } from "@/lib/season";
import { QueueTabs } from "../queue-tabs";
import { ChampionTable } from "./champion-table";
import { LoadMoreGames } from "./load-more-games";
import { PersonalRecords } from "./personal-records";

// The Champions tab: every champion the player played this season, with
// their record, KDA, game score, laning, damage, wards, CS, gold and
// multikills, like op.gg's champion stats. Each row opens to show how the
// champion did against each enemy champion in the same role. Under the
// table, the season's personal records (personal-records.tsx).
// URL: /player/na/Name-TAG/champions, plus ?queue=flex for another game mode
// (Ranked Solo/Duo by default, since that's the queue most players care about).
//
// The games come from the database, which fills in a few more of the
// season's games on every visit (see src/lib/champion-store.ts).

type Params = Promise<{ region: string; riotId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Champions" };

const DEFAULT_QUEUE = "solo";

export default function ChampionsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Loading champions…</p>}>
        <Champions params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Champions({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { region, riotId } = await params;
  const queue = readQueueFilter((await searchParams).queue, DEFAULT_QUEUE);
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) notFound();

  // Player data is fetched per request, never at build time.
  await connection();

  const account = await settle(getAccount(region, id));
  if (!account.ok) return <RiotErrorNotice error={account.error} region={region} />;
  if (!account.value) notFound();
  const { puuid, gameName, tagLine } = account.value;
  const playerPath = `/player/${region}/${toSlug(account.value)}`;

  const header = (
    <>
      <h1 className="font-display text-[52px] font-bold leading-none tracking-[0.01em]">
        {gameName}
        <span className="font-semibold text-placeholder">#{tagLine}</span>
      </h1>
      <ProfileTabs playerPath={playerPath} current="champions" />
    </>
  );

  // The profile snapshot says when the season's match list was last asked
  // for, so it's refreshed at most once a day, like the profile.
  const profile = await settle(loadProfile(region, account.value));
  if (!profile.ok) {
    return (
      <>
        {header}
        <RiotErrorNotice error={profile.error} region={region} />
      </>
    );
  }

  const [stats, records, dd] = await Promise.all([
    loadChampionTab(region, puuid, profile.value.updatedAt, queueIds(queue.filter)),
    loadSeasonRecords(puuid, queueIds(queue.filter)),
    getDataDragon().catch(() => null),
  ]);

  return (
    <>
      {header}
      <QueueTabs playerPath={`${playerPath}/champions`} current={queue} defaultId={DEFAULT_QUEUE} />
      {stats ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-note text-faint">
              {SEASON.label} · {queue.label} · {stats.all.games}{" "}
              {stats.all.games === 1 ? "game" : "games"}.{" "}
              {stats.loaded < stats.total
                ? `${stats.loaded} of ${stats.total} season games loaded so far, ${GAMES_PER_VIEW} more each visit.`
                : `All ${stats.total} season games loaded.`}
            </p>
            {stats.loaded < stats.total && (
              <LoadMoreGames count={GAMES_PER_VIEW} busy={stats.error?.kind === "rate-limited"} />
            )}
          </div>
          {stats.champions.length > 0 ? (
            <ChampionTable stats={stats} dd={dd} />
          ) : (
            <p className={`${panelClass} p-5 text-faint`}>
              No {queue.id === "all" ? "" : `${queue.label} `}games this season yet.
            </p>
          )}
          {records && <PersonalRecords records={records} dd={dd} playerPath={playerPath} />}
        </>
      ) : (
        <p className={`${panelClass} p-5 text-faint`}>
          Champion stats need the saved games in Turnpoint&apos;s database, which can&apos;t be
          reached right now. Try again in a minute.
        </p>
      )}
    </>
  );
}
