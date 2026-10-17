import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { analyzeMatch, findPlayer, findPlayerByRiotId, isAnalyzable } from "@/lib/analyzer";
import { championName, getDataDragon } from "@/lib/ddragon";
import { loadMatch, loadTimeline } from "@/lib/match-store";
import { savedSoloTier } from "@/lib/profile-store";
import { isMatchIdFor, isRegion, type Region } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match, Participant } from "@/lib/riot/types";
import { fromSlug, toSlug, type RiotId } from "@/lib/riot-id";
import { matchWinChance } from "@/lib/win-chance";
import { AnalysisSections } from "./analysis-sections";
import { MatchHeader } from "./match-header";
import { MatchNotes } from "./match-notes";
import { MatchRecap } from "./match-recap";
import { Scoreboard } from "./scoreboard";
import { panelClass } from "@/components/ui/panel";

// The match analysis page: one game, from one player's point of view.
// URL: /player/na/Name-TAG/match/NA1_1234567890

type Params = Promise<{ region: string; riotId: string; matchId: string }>;

export const metadata = {
  title: "Match analysis",
  description:
    "One League of Legends game minute by minute: the lead over your lane opponent, the turning points and each team's chance to win.",
};

export default function MatchPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-7 px-6 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Analyzing match…</p>}>
        <Analysis params={params} />
      </Suspense>
    </main>
  );
}

async function Analysis({ params }: { params: Params }) {
  const { region, riotId, matchId } = await params;
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id || !isMatchIdFor(region, matchId)) notFound();

  // Match data is fetched per request, never at build time.
  await connection();

  const back = <BackLink region={region} id={id} />;
  const [loaded, dd] = await Promise.all([
    settle(loadMatch(region, matchId)),
    // Images and display names are nice to have: without Data Dragon the
    // page still works, with Riot's internal champion names.
    getDataDragon().catch(() => null),
  ]);
  if (!loaded.ok) {
    if (loaded.error.kind === "not-found") notFound();
    return (
      <>
        {back}
        <RiotErrorNotice error={loaded.error} />
      </>
    );
  }
  const match = loaded.value;

  const me = await findSearchedPlayer(region, match, id);
  if (!me) {
    return (
      <>
        {back}
        <p className="text-muted">
          {id.gameName}#{id.tagLine} isn&apos;t in this match.
        </p>
      </>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request, so reading the clock is fine
  const now = Date.now();
  const header = <MatchHeader match={match} me={me} now={now} />;
  const scoreboard = (
    <Scoreboard
      region={region}
      dd={dd}
      participants={match.info.participants}
      meId={me.participantId}
      opponentId={null}
    />
  );
  const notes = <MatchNotes region={region} matchId={matchId} />;

  if (!isAnalyzable(match)) {
    return (
      <>
        {back}
        {header}
        <p className={`${panelClass} px-5 py-4 text-muted`}>
          This game ended before 15 minutes, which is too short to analyze. Here&apos;s the
          scoreboard.
        </p>
        {scoreboard}
        {notes}
      </>
    );
  }

  const [timeline, tier] = await Promise.all([
    settle(loadTimeline(region, match)),
    savedSoloTier(me.puuid),
  ]);
  if (!timeline.ok) {
    return (
      <>
        {back}
        {header}
        <RiotErrorNotice error={timeline.error} />
        {scoreboard}
        {notes}
      </>
    );
  }

  const label = (name: string) => championName(dd, name);
  const analysis = analyzeMatch(match, timeline.value, me.puuid, label)!;
  const winChance = matchWinChance(match, timeline.value, me.teamId, tier);
  return (
    <>
      {back}
      {header}
      <AnalysisSections
        region={region}
        match={match}
        analysis={analysis}
        winChance={winChance}
        dd={dd}
        label={label}
      />
      <MatchRecap region={region} matchId={matchId} puuid={me.puuid} />
      {notes}
    </>
  );
}

// Finds the searched player in the match by the Riot ID in the URL. If they
// renamed since the game, falls back to looking up their PUUID, which costs
// one Riot call.
async function findSearchedPlayer(
  region: Region,
  match: Match,
  id: RiotId,
): Promise<Participant | null> {
  const byName = findPlayerByRiotId(match, id.gameName, id.tagLine);
  if (byName) return byName;
  const account = await settle(getAccount(region, id));
  return account.ok && account.value ? findPlayer(match, account.value.puuid) : null;
}

function BackLink({ region, id }: { region: Region; id: RiotId }) {
  return (
    <Link
      href={`/player/${region}/${toSlug(id)}`}
      className="inline-flex min-h-10 items-center gap-2 self-start text-sm text-muted hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Back to {id.gameName}#{id.tagLine}
    </Link>
  );
}
