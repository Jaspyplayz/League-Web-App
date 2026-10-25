import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { findPlayer } from "@/lib/analyzer";
import { checkWeaknesses, isTrendGame, summarizeGame } from "@/lib/analyzer/trends";
import { getCurrentUser } from "@/lib/auth";
import { dayKey, LOG_DAYS, type LogGame, type LogRankPoint } from "@/lib/daily-log";
import { readDayNotes } from "@/lib/day-note-store";
import { championName, getDataDragon } from "@/lib/ddragon";
import { playerKey } from "@/lib/focus";
import { scoreGame } from "@/lib/game-score";
import type { ReadDayNotesResult } from "@/lib/match-note";
import { summarizeMatch } from "@/lib/match-summary";
import { loadMatches, loadTimelines } from "@/lib/match-store";
import { readMyPlayer } from "@/lib/my-player";
import { readRecapHeadlines } from "@/lib/recap-store";
import { loadRankHistory } from "@/lib/profile-store";
import { isRegion } from "@/lib/regions";
import { getAccount, getMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";
import { rankScore } from "@/lib/tiers";
import { AnalysisProgress } from "../insights/analysis-progress";
import { DailyLog } from "./daily-log";

// The Log tab: the last four weeks of games, one card per day, with a short
// private note on each day for the player who marked this profile "This is
// me". URL: /player/na/Name-TAG/log.
//
// The server gathers every game and the saved ranks; the browser groups them
// into days, because only it knows the viewer's timezone (see
// src/lib/daily-log.ts).

type Params = Promise<{ region: string; riotId: string }>;

export const metadata = { title: "Log" };

// New matches fetched from Riot per page view, like Insights. Matches are
// saved forever, so each visit only fetches games it hasn't seen.
const MATCHES_PER_VIEW = 10;
// Timelines are only needed for gold at 15 and focus goals, which are extras,
// so the log fetches a few per visit and the rest fill in over time (Insights
// and the match page fetch them too).
const TIMELINES_PER_VIEW = 3;
// Riot's queue ID for ranked solo/duo, the queue the LP is for.
const SOLO_QUEUE = 420;
const DAY_S = 24 * 60 * 60;

export default function LogPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-7 px-4 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Loading the log…</p>}>
        <Log params={params} />
      </Suspense>
    </main>
  );
}

async function Log({ params }: { params: Params }) {
  const { region, riotId } = await params;
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
      <ProfileTabs playerPath={playerPath} current="log" />
    </>
  );

  // React's lint rule warns that reading the clock gives different output
  // each render. This is a Server Component, rendered once per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // One day extra, because the viewer's "four weeks ago" may be up to a day
  // off the server's, depending on their timezone.
  const startTime = Math.floor(now / 1000) - (LOG_DAYS + 1) * DAY_S;
  const ids = await settle(getMatchIds(region, puuid, 100, { startTime }));
  if (!ids.ok) {
    return (
      <>
        {header}
        <RiotErrorNotice error={ids.error} region={region} />
      </>
    );
  }

  const loaded = await loadMatches(region, ids.value, MATCHES_PER_VIEW);
  const trendMatches = loaded.matches.filter((m) => isTrendGame(m, puuid));
  const [{ timelines }, dd, history, notes, recaps] = await Promise.all([
    loadTimelines(region, trendMatches, TIMELINES_PER_VIEW),
    getDataDragon().catch(() => null),
    loadRankHistory(puuid, new Date(now)),
    loadNotes(puuid, dayKey(now - (LOG_DAYS + 2) * DAY_S * 1000)),
    readRecapHeadlines(
      puuid,
      loaded.matches.map((m) => m.metadata.matchId),
    ),
  ]);

  const games: LogGame[] = loaded.matches.flatMap((match) => {
    const summary = summarizeMatch(match, puuid);
    const me = findPlayer(match, puuid);
    // Remakes didn't really happen, so they're left out of the log.
    if (!summary || !me || summary.remake) return [];
    const timeline = timelines.get(match.metadata.matchId);
    const trend = timeline ? summarizeGame(match, timeline, puuid) : null;
    return [
      {
        matchId: summary.matchId,
        startedAt: summary.startedAt,
        win: summary.win,
        ranked: match.info.queueId === SOLO_QUEUE,
        championName: summary.championName,
        championLabel: championName(dd, summary.championName),
        kills: summary.kills,
        deaths: summary.deaths,
        assists: summary.assists,
        csPerMin: summary.csPerMin,
        visionPerMin: summary.durationS > 0 ? me.visionScore / (summary.durationS / 60) : 0,
        score: scoreGame(match).get(me.participantId)?.score ?? null,
        goldAt15: trend?.goldAt15 ?? null,
        shows: trend ? checkWeaknesses(trend) : null,
        recap: recaps.get(summary.matchId) ?? null,
      },
    ];
  });

  const ranks: LogRankPoint[] = history
    .filter((p) => p.queueType === "RANKED_SOLO_5x5")
    .flatMap((p) => {
      const score = rankScore(p.tier, p.rank, p.leaguePoints);
      return score === null
        ? []
        : [{ at: p.recordedAt.getTime(), score, games: p.wins + p.losses }];
    });

  return (
    <>
      {header}
      {loaded.waiting > 0 && (
        <AnalysisProgress
          analyzed={loaded.matches.length}
          total={loaded.matches.length + loaded.waiting}
          retryAfterS={
            loaded.error?.kind === "rate-limited" ? (loaded.error.retryAfter ?? null) : null
          }
        />
      )}
      <DailyLog
        games={games}
        ranks={ranks}
        notes={notes}
        player={playerKey(region, gameName, tagLine)}
        playerPath={playerPath}
      />
    </>
  );
}

// The signed-in account's day notes, but only on the profile it marked with
// "This is me": notes are about your own days, so nobody else's log shows
// them or a box to write one. Null means no notes on this page.
async function loadNotes(puuid: string, since: string): Promise<ReadDayNotesResult | null> {
  if (!supabaseConfig()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const mine = await readMyPlayer(user.id);
  if (mine?.puuid !== puuid) return null;
  return readDayNotes(user.id, since);
}
