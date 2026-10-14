import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RememberSearchedPlayer } from "@/components/saved-players";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { loadProfile } from "@/lib/profile-store";
import { readQueueFilter } from "@/lib/queue-filters";
import { isRegion, REGIONS, type Region } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug, type RiotId } from "@/lib/riot-id";
import { ProfileHeader } from "./profile-header";
import { RecentMatches } from "./recent-matches";

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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← New search
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Looking up player…</p>}>
        <Player params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Finds the account first, because every other request needs its PUUID. Then
// the profile (rank and the latest match IDs), which comes from the saved
// snapshot when there is one; see src/lib/profile-store.ts. The match list
// loads in its own Suspense boundary, so the header shows while it's loading.
async function Player({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { region, riotId } = await params;
  // ?queue=solo picks a game-mode tab above the match list.
  const queue = readQueueFilter((await searchParams).queue);
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) notFound();

  // Player data is live, so this part of the page is never prerendered at
  // build time. Saying so lets the code below read the clock (Date.now()).
  await connection();

  const account = await settle(getAccount(region, id));
  if (!account.ok) return <RiotErrorNotice error={account.error} />;
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
          <Suspense fallback={<p className="text-zinc-500">Loading recent matches…</p>}>
            <RecentMatches
              region={region}
              puuid={puuid}
              profile={profile.value}
              queue={queue}
              playerPath={playerPath}
            />
          </Suspense>
        </>
      ) : (
        <>
          <PlayerName gameName={gameName} tagLine={tagLine} />
          <RiotErrorNotice error={profile.error} />
        </>
      )}
    </>
  );
}

function PlayerNotFound({ region, id }: { region: Region; id: RiotId }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold">No player found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        There&apos;s no {id.gameName}#{id.tagLine} in {REGIONS[region].label}. Check the spelling
        and the tag after the #, or try another region.
      </p>
    </div>
  );
}

function PlayerName({ gameName, tagLine }: { gameName: string; tagLine: string }) {
  return (
    <h1 className="text-3xl font-semibold">
      {gameName}
      <span className="text-zinc-500">#{tagLine}</span>
    </h1>
  );
}
