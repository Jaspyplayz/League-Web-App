import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RememberSearchedPlayer } from "@/components/saved-players";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { MatchListSkeleton } from "@/components/match-list-skeleton";
import { LoadingBlock, LoadingSection } from "@/components/ui/loading";
import { loadProfile } from "@/lib/profile-store";
import { readQueueFilter, type QueueFilter } from "@/lib/queue-filters";
import { isRegion, REGIONS } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { ByDay } from "./by-day";
import { PlayerNotFound } from "./player-not-found";
import { ProfileHeader, RankCards } from "./profile-header";
import { ProfileSkeleton, RankSkeleton } from "./profile-skeleton";
import { MatchesControls, readMatchesView } from "./queue-tabs";
import {
  GAMES_COLUMN,
  MatchesHeading,
  RecentMatches,
  SIDE_BOTTOM,
  SidePanelSkeleton,
} from "./recent-matches";

type Params = Promise<{ region: string; riotId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PlayerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    // The same width as the Champions and Insights tabs, so the top and the
    // tabs stay put when switching between them.
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 pb-20 pt-7 sm:px-6">
      <Suspense
        fallback={
          // The address already names the player, so the loading line can
          // too, a moment after the plain one.
          <Suspense fallback={<ProfileSkeleton label="Looking up the player" />}>
            <LookingUp params={params} />
          </Suspense>
        }
      >
        <Player params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// "Looking up Faker#KR1 on Korea", from the address.
async function LookingUp({ params }: { params: Params }) {
  const { region, riotId } = await params;
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) return <ProfileSkeleton label="Looking up the player" />;
  return (
    <ProfileSkeleton label={`Looking up ${id.gameName}#${id.tagLine} on ${REGIONS[region].label}`} />
  );
}

// Finds the account first, because every other request needs its PUUID. Then
// the profile (rank and the latest match IDs), which comes from the saved
// snapshot when there is one; see src/lib/profile-store.ts. The match list
// loads in its own Suspense boundary, so the header shows while it's loading.
async function Player({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { region, riotId } = await params;
  const search = await searchParams;
  // ?queue=solo picks a game-mode tab above the games, and ?view=day shows
  // them By day instead of as a list.
  const queue = readQueueFilter(search.queue);
  const view = readMatchesView(search.view);
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) notFound();

  // Player data is live, so this part of the page is never prerendered at
  // build time. Saying so lets the code below read the clock (Date.now()).
  await connection();

  const account = await settle(getAccount(region, id));
  if (!account.ok) return <RiotErrorNotice error={account.error} region={region} />;
  if (!account.value) return <PlayerNotFound region={region} id={id} />;

  const { puuid, gameName, tagLine } = account.value;
  const playerPath = `/player/${region}/${toSlug(account.value)}`;
  const profile = await settle(loadProfile(region, account.value));
  return (
    <>
      {/* Uses the spelling Riot returns, so a search for "faker#kr1" is saved as "Faker#KR1". */}
      <RememberSearchedPlayer region={region} gameName={gameName} tagLine={tagLine} />
      {profile.ok ? (
        <>
          <ProfileHeader
            region={region}
            puuid={puuid}
            gameName={gameName}
            tagLine={tagLine}
            profile={profile.value}
          />
          <ProfileTabs playerPath={playerPath} current="matches" />
          {view === "day" ? (
            // By day has no side column: its days take the whole width.
            <>
              <MatchesControls playerPath={playerPath} queue={queue} view="day" />
              <Suspense fallback={<ByDaySkeleton />}>
                <ByDay
                  region={region}
                  puuid={puuid}
                  gameName={gameName}
                  tagLine={tagLine}
                  playerPath={playerPath}
                  queue={queue}
                />
              </Suspense>
            </>
          ) : (
            // The Matches grid (JAS-87): a 320px left column with the ranks
            // on top and Season 2026 and Champion mastery under them, and the
            // games on the right. On phones: ranks, games, then the rest.
            <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-3.5">
              {/* Outside the games' Suspense, so the ranks show while the
                  games load. */}
              <div className="flex flex-col gap-3.5 lg:col-start-1 lg:row-start-1">
                <Suspense
                  fallback={
                    <div className="motion-safe:animate-pulse">
                      <RankSkeleton />
                    </div>
                  }
                >
                  <RankCards puuid={puuid} profile={profile.value} />
                </Suspense>
              </div>
              <Suspense fallback={<GamesSkeleton playerPath={playerPath} queue={queue} />}>
                <RecentMatches
                  region={region}
                  puuid={puuid}
                  profile={profile.value}
                  queue={queue}
                  gamesParam={search.games}
                  playerPath={playerPath}
                />
              </Suspense>
            </div>
          )}
        </>
      ) : (
        <>
          <PlayerName gameName={gameName} tagLine={tagLine} />
          <RiotErrorNotice error={profile.error} region={region} />
        </>
      )}
    </>
  );
}

function PlayerName({ gameName, tagLine }: { gameName: string; tagLine: string }) {
  return (
    <h1 className="text-title font-semibold">
      {gameName} <span className="font-normal text-quiet">#{tagLine}</span>
    </h1>
  );
}

// The games column while the games load. The heading and the queue choices
// are already known, so they show for real above the grey rows.
function GamesSkeleton({ playerPath, queue }: { playerPath: string; queue: QueueFilter }) {
  return (
    <>
      <section aria-labelledby="matches-heading" className={GAMES_COLUMN}>
        <MatchesHeading />
        <MatchesControls playerPath={playerPath} queue={queue} view="list" />
        <MatchListSkeleton />
      </section>
      <div className={SIDE_BOTTOM}>
        <SidePanelSkeleton label="Loading season champions" />
      </div>
    </>
  );
}

// While By day gathers the last four weeks: the month panel, then a few days.
function ByDaySkeleton() {
  return (
    <LoadingSection label="Loading your days">
      <LoadingBlock className="h-28" />
      <LoadingBlock className="h-20" />
      <LoadingBlock className="h-20" />
      <LoadingBlock className="h-20" />
    </LoadingSection>
  );
}
