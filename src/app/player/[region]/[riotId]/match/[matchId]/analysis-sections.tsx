import type { ReactNode } from "react";
import type { TurningPointMarker } from "@/components/diff-chart";
import { REPO_URL } from "@/components/site-header";
import type { MatchAnalysis } from "@/lib/analyzer";
import { formatClock } from "@/lib/analyzer/format";
import type { PhaseRating } from "@/lib/analyzer/phase-score";
import type { ReplayChances } from "@/lib/analyzer/plays";
import { reviewMoments } from "@/lib/analyzer/review";
import { byRole, teamOrder } from "@/lib/analyzer/team-analysis";
import {
  championIconUrl,
  itemIconUrl,
  itemName,
  riftMapUrl,
  type DataDragon,
} from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import type { Region } from "@/lib/regions";
import type { Match } from "@/lib/riot/types";
import { supabaseConfig } from "@/lib/supabase/config";
import type { MatchWinChance } from "@/lib/win-chance";
import { AnalysisTabs } from "./analysis-tabs";
import { Deaths } from "./deaths";
import { Ganks } from "./ganks";
import { LeadChart } from "./lead-chart";
import { Matchup } from "./match-header";
import { PathingGrid } from "./pathing";
import { PhaseRatings } from "./phase-ratings";
import { Replay } from "./replay";
import { Review } from "./review";
import type { ItemInfo, ReplayPerson } from "./replay-scoreboard";
import { Scoreboard } from "./scoreboard";
import { SnapshotTiles } from "./snapshot-tiles";
import { TeamGold } from "./team-gold";
import { TurningPoints } from "./turning-points";
import { WinChance } from "./win-chance";

// Everything below the match header, once the match has been analyzed, in
// two tabs so the vital part comes first (Jasper's order, 2026-10-19):
// - Summary: the scoreboard, the 60-second review, you vs your opponent,
//   your early, mid, late and overall ratings, the lead chart with turning
//   points, your team's win chance, the recap and your notes.
// - Deep dive: @10 and @15 stats, team gold with objectives, deaths, the
//   replay (beta, with the tempo timeline for junglers) and, for junglers,
//   early pathing and early ganks.
export function AnalysisSections({
  region,
  match,
  analysis: a,
  winChance,
  chances,
  phases,
  dd,
  label,
  recap,
  notes,
}: {
  region: Region;
  match: Match;
  analysis: MatchAnalysis;
  // Null for games the win chance model doesn't cover.
  winChance: MatchWinChance | null;
  // The replay's win chance at every second and its graded plays, null with
  // winChance.
  chances: ReplayChances | null;
  // Your early, mid and late ratings, for the phases the game lasted long
  // enough for. Empty when the game can't be rated.
  phases: PhaseRating[];
  dd: DataDragon | null;
  label: (championName: string) => string;
  // Drawn by the page, since they load their own data.
  recap: ReactNode;
  notes: ReactNode;
}) {
  const { participants } = match.info;
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  const name = (id: number) => label(byId.get(id)?.championName ?? "Someone");
  const names = Object.fromEntries(
    participants.map((p) => [p.participantId, label(p.championName)]),
  );
  const markers: TurningPointMarker[] = a.turningPoints.map((p) => ({
    minute: p.timestamp / 60_000,
    label: `${formatClock(p.timestamp)} ${p.title}`,
    tone: p.swing > 0 ? "ahead" : "behind",
  }));

  const summary = (
    <>
      <Scoreboard
        region={region}
        dd={dd}
        participants={participants}
        meId={a.me.participantId}
        opponentId={a.opponent?.participantId ?? null}
      />

      {/* "Add to notes" only when there's a notes box, which needs sign-in
          to be set up. */}
      {chances && (
        <Review
          moments={reviewMoments(chances, a.replay, a.me.participantId, names, a.tempo)}
          notes={supabaseConfig() !== null}
        />
      )}

      <Matchup
        dd={dd}
        me={a.me}
        opponent={a.opponent}
        at15={a.at15}
        finalGoldDiff={a.series?.gold.at(-1)?.diff ?? null}
      />

      {phases.length > 0 && (
        <PhaseRatings phases={phases} overall={scoreGame(match).get(a.me.participantId) ?? null} />
      )}

      {a.series && a.opponent && (
        <div className="flex flex-wrap items-start gap-5">
          <LeadChart
            series={a.series}
            markers={markers}
            opponentName={label(a.opponent.championName)}
          />
          <TurningPoints points={a.turningPoints} />
        </div>
      )}

      {winChance && <WinChance {...winChance} />}

      {recap}
      {notes}
    </>
  );

  const deepDive = (
    <>
      {a.at10 && <SnapshotTiles snapshot={a.at10} />}
      {a.at15 && <SnapshotTiles snapshot={a.at15} />}

      <div className="flex flex-wrap items-start gap-5">
        <TeamGold points={a.teamGold} objectives={a.objectives} />
        <Deaths deaths={a.deaths} name={name} />
      </div>

      <Replay
        replay={a.replay}
        chances={chances}
        tempo={a.tempo}
        people={replayPeople(participants, a, dd, label)}
        items={replayItems(a, dd)}
        winningTeamId={participants.find((p) => p.win)?.teamId ?? 0}
        mapUrl={dd ? riftMapUrl(dd) : null}
        docsHref={`${REPO_URL}/blob/main/docs/replay.md`}
        tempoDocsHref={`${REPO_URL}/blob/main/docs/tempo.md`}
      />

      {a.pathing && <PathingGrid pathing={a.pathing} />}
      {a.ganks && a.opponent && (
        <Ganks ganks={a.ganks} enemyJungler={label(a.opponent.championName)} />
      )}
    </>
  );

  return <AnalysisTabs summary={summary} deepDive={deepDive} />;
}

// Everyone in the replay's scoreboard, your team first and each team in role
// order, with the champion image worked out here so the replay doesn't need
// all of Data Dragon.
function replayPeople(
  participants: Match["info"]["participants"],
  a: MatchAnalysis,
  dd: DataDragon | null,
  label: (championName: string) => string,
): ReplayPerson[] {
  return teamOrder(a.me.teamId).flatMap((teamId) =>
    byRole(participants.filter((p) => p.teamId === teamId)).map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      name: label(p.championName),
      iconUrl: dd ? championIconUrl(dd, p.championName) : null,
      tag:
        p.participantId === a.me.participantId
          ? "You"
          : p.participantId === a.opponent?.participantId
            ? "Opponent"
            : null,
    })),
  );
}

// The name and image of every item anyone held during the game. Empty
// without Data Dragon: the replay then draws empty slots.
function replayItems(a: MatchAnalysis, dd: DataDragon | null): Record<number, ItemInfo> {
  const items: Record<number, ItemInfo> = {};
  if (!dd) return items;
  for (const player of a.replay.players) {
    for (const change of player.items ?? []) {
      for (const id of [...change.slots, change.roleItem, change.trinket]) {
        const name = id > 0 ? itemName(dd, id) : null;
        if (name) items[id] = { name, iconUrl: itemIconUrl(dd, id) };
      }
    }
  }
  return items;
}
