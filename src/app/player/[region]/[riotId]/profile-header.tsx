import { Suspense } from "react";
import { ProfileIcon, RankEmblem } from "@/components/game-icons";
import { LiveBadge } from "@/components/live-badge";
import { PinButton } from "@/components/saved-players";
import { ThisIsMe } from "@/components/this-is-me";
import { panelClass } from "@/components/ui/panel";
import { secondsUntilUpdate } from "@/db/freshness";
import { getDataDragon } from "@/lib/ddragon";
import { findQueue, formatTier, timeAgo, winRate } from "@/lib/match-summary";
import { loadRankHistory, type Profile } from "@/lib/profile-store";
import { graphPoints } from "@/lib/rank-history";
import { REGIONS, type Region } from "@/lib/regions";
import type { LeagueEntry } from "@/lib/riot/types";
import { LpGraph } from "./lp-graph";
import { UpdateButton } from "./update-button";

type Props = { region: Region; puuid: string; gameName: string; tagLine: string; profile: Profile };

// The top of the profile (JAS-87): the portrait with its level, the Riot ID,
// "Korea · Level 946 · Updated 6h ago", then Update, This is me and the pin
// star. It sits on the page itself, with no panel behind it. The rank cards
// live in the side column instead (RankCards below), next to the games.
export async function ProfileHeader({ region, puuid, gameName, tagLine, profile }: Props) {
  // A Server Component renders once per request, so reading the clock here is
  // fine (see recent-matches.tsx for the same note).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Images are nice to have: if Data Dragon is down, show the page without them.
  const dd = await getDataDragon().catch(() => null);
  const details = [
    REGIONS[region].label,
    profile.summonerLevel !== null && `Level ${profile.summonerLevel}`,
    `Updated ${timeAgo(profile.updatedAt.getTime(), now)}`,
  ].filter(Boolean);

  return (
    <section aria-label="Player summary" className="flex items-start gap-4 sm:items-center sm:gap-5">
      <ProfileIcon dd={dd} iconId={profile.profileIconId} level={profile.summonerLevel} name={gameName} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-2xl font-semibold break-words sm:text-title">
            {gameName} <span className="font-normal text-quiet">#{tagLine}</span>
          </h1>
          {/* Its own Suspense boundary, so a slow answer never holds up the header. */}
          <Suspense fallback={null}>
            <LiveBadge region={region} puuid={puuid} />
          </Suspense>
        </div>
        <p className="text-body text-quiet">{details.join(" · ")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <UpdateButton
            // A new snapshot gets a new key, which resets the button's cooldown.
            key={profile.updatedAt.getTime()}
            region={region}
            puuid={puuid}
            secondsUntilReady={secondsUntilUpdate(profile.updatedAt, new Date(now))}
          />
          <ThisIsMe region={region} puuid={puuid} gameName={gameName} tagLine={tagLine} />
          <PinButton region={region} gameName={gameName} tagLine={tagLine} />
        </div>
      </div>
    </section>
  );
}

// Ranked Solo/Duo, then Ranked Flex on one line, for the top of the side column.
export async function RankCards({ puuid, profile }: { puuid: string; profile: Profile }) {
  // eslint-disable-next-line react-hooks/purity
  const now = new Date(Date.now());
  // Saved ranks for the LP graph. Comes from our database only, never Riot.
  // They belong to the saved profile's region, so another region's page
  // draws no graph rather than one from a different server (JAS-41).
  const history = profile.stored ? await loadRankHistory(puuid, now) : [];
  const solo = findQueue(profile.ranked, "RANKED_SOLO_5x5");
  const flex = findQueue(profile.ranked, "RANKED_FLEX_SR");

  return (
    <>
      <section aria-labelledby="solo-rank-heading" className={`${panelClass} flex flex-col gap-3 px-[18px] py-4`}>
        <h2 id="solo-rank-heading" className="text-note text-quiet">
          Ranked Solo/Duo
        </h2>
        {solo ? (
          <div className="flex items-center gap-3">
            <RankEmblem tier={solo.tier} size={48} />
            <div className="min-w-0">
              <p className="text-heading leading-tight font-semibold">{formatTier(solo)}</p>
              <p className="text-body text-quiet tabular-nums">{solo.leaguePoints} LP</p>
            </div>
            <Record entry={solo} />
          </div>
        ) : (
          <p className="text-heading font-semibold text-quiet">Unranked</p>
        )}
        {/* The room JAS-83 leaves for rank progress and the 30-day climb.
            Until that ticket decides what goes here, it holds today's LP
            graph, which draws nothing until there's saved history. */}
        <div data-slot="rank-progress">
          <LpGraph points={graphPoints(history, "RANKED_SOLO_5x5", now)} />
        </div>
      </section>
      <section
        aria-labelledby="flex-rank-heading"
        className={`${panelClass} flex items-center justify-between gap-3 px-[18px] py-3.5`}
      >
        <h2 id="flex-rank-heading" className="text-note text-quiet">
          Ranked Flex
        </h2>
        {flex ? (
          <p className="text-body tabular-nums">
            {formatTier(flex)} · {flex.leaguePoints} LP{" "}
            <span className="text-quiet">
              · {Math.round(winRate(flex.wins, flex.losses) * 100)}%<span className="sr-only"> win rate</span>
            </span>
          </p>
        ) : (
          <p className="text-body text-quiet">Unranked</p>
        )}
      </section>
    </>
  );
}

// "448W 371L" over "55% win rate", on the right of the rank.
function Record({ entry }: { entry: LeagueEntry }) {
  return (
    <div className="ml-auto text-right tabular-nums">
      <p className="text-body">
        {entry.wins}W {entry.losses}L
      </p>
      <p className="text-note text-quiet">{Math.round(winRate(entry.wins, entry.losses) * 100)}% win rate</p>
    </div>
  );
}
