import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { LoadingBlock, LoadingSection } from "@/components/ui/loading";
import { panelClass } from "@/components/ui/panel";
import { EmptyPanel, ProblemPanel, secondButtonClass } from "@/components/ui/state-panel";
import { TryAgainButton } from "@/components/ui/try-again-button";
import { GAMES_PER_VIEW, loadChampionTab } from "@/lib/champion-store";
import { getDataDragon } from "@/lib/ddragon";
import { loadProfile } from "@/lib/profile-store";
import { queueIds, readQueueFilter } from "@/lib/queue-filters";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { SEASON } from "@/lib/season";
import { QueueTabs } from "../queue-tabs";
import { ChampionTable } from "./champion-table";
import { emptyAction } from "./empty-action";
import { LoadMoreGames } from "./load-more-games";

// The Champions tab: every champion the player played this season, with
// their record, KDA, game score, laning, damage, wards, CS, gold and
// multikills, like op.gg's champion stats. Each row opens to show how the
// champion did against each enemy champion in the same role.
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
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 pb-20 pt-7 sm:px-6">
      <Suspense fallback={<ChampionsLoading />}>
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
      <h1 className="text-title font-semibold">
        {gameName}
        <span className="font-normal text-quiet">#{tagLine}</span>
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

  const [stats, dd] = await Promise.all([
    loadChampionTab(region, puuid, profile.value.updatedAt, queueIds(queue.filter)),
    getDataDragon().catch(() => null),
  ]);

  const modeName = queue.id === "all" ? "" : `${queue.label} `;
  const allLoaded = !stats || stats.loaded >= stats.total;
  const loadMore = (
    <LoadMoreGames count={GAMES_PER_VIEW} busy={stats?.error?.kind === "rate-limited"} />
  );

  return (
    <>
      {header}
      <QueueTabs playerPath={`${playerPath}/champions`} current={queue} defaultId={DEFAULT_QUEUE} />
      {!stats ? (
        <ProblemPanel title="Champion stats can't load right now" actions={<TryAgainButton />}>
          <p>Turnpoint couldn&apos;t add up this season&apos;s games just now. Try again in a minute.</p>
        </ProblemPanel>
      ) : stats.champions.length === 0 ? (
        <EmptyPanel
          title={`No ${modeName}games this season yet`}
          action={
            emptyAction(queue.id, allLoaded) === "load-more" ? (
              loadMore
            ) : emptyAction(queue.id, allLoaded) === "every-mode" ? (
              <Link href={`${playerPath}/champions?queue=all`} className={secondButtonClass}>
                Show every mode
              </Link>
            ) : undefined
          }
        >
          {allLoaded
            ? "Champions add up every game since the season started."
            : `Champions add up every game since the season started. ${stats.loaded} of ${stats.total} are loaded so far, ${GAMES_PER_VIEW} more each visit.`}
        </EmptyPanel>
      ) : (
        <ChampionTable
          stats={stats}
          dd={dd}
          heading={
            <div className="flex min-w-0 flex-col gap-2">
              <div>
                <h2 className="text-subheading font-semibold">{SEASON.label}</h2>
                <p className="text-note text-quiet">
                  {queue.label} · {stats.all.games} {stats.all.games === 1 ? "game" : "games"}.{" "}
                  {allLoaded
                    ? `All ${stats.total} season games loaded.`
                    : `${stats.loaded} of ${stats.total} season games loaded so far, ${GAMES_PER_VIEW} more each visit.`}
                </p>
              </div>
              {!allLoaded && loadMore}
            </div>
          }
        />
      )}
    </>
  );
}

// While the page loads: the player's name and the tabs as grey blocks, then
// the table's rows, each with a portrait and a few numbers, in grey.
function ChampionsLoading() {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col gap-6 motion-safe:animate-pulse">
        <LoadingBlock className="h-9 w-64" />
        <LoadingBlock className="h-11 w-full max-w-md" />
      </div>
      <LoadingSection label="Adding up this season's games">
        <div className={`${panelClass} px-4 py-2`}>
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              className="flex h-13 items-center gap-3.5 border-b border-divider last:border-b-0"
            >
              <LoadingBlock className="size-8 shrink-0" />
              <LoadingBlock className="h-3.5 w-24 sm:w-36" />
              <LoadingBlock className="ml-auto h-3.5 w-14 shrink-0" />
              <LoadingBlock className="h-3.5 w-14 shrink-0" />
              <LoadingBlock className="h-3.5 w-20 shrink-0 max-sm:hidden" />
              <LoadingBlock className="h-3.5 w-20 shrink-0 max-sm:hidden" />
            </div>
          ))}
        </div>
      </LoadingSection>
    </>
  );
}
