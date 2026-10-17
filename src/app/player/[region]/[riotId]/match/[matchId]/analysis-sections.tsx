import type { TurningPointMarker } from "@/components/diff-chart";
import { REPO_URL } from "@/components/site-header";
import type { MatchAnalysis } from "@/lib/analyzer";
import { formatClock } from "@/lib/analyzer/format";
import { byRole, teamOrder } from "@/lib/analyzer/team-analysis";
import { championIconUrl, itemIconUrl, itemName, type DataDragon } from "@/lib/ddragon";
import type { Region } from "@/lib/regions";
import type { Match } from "@/lib/riot/types";
import type { MatchWinChance } from "@/lib/win-chance";
import { Deaths } from "./deaths";
import { Ganks } from "./ganks";
import { JungleMap, type MapPlayer } from "./jungle-map";
import { LeadChart } from "./lead-chart";
import { Matchup } from "./match-header";
import { PathingGrid } from "./pathing";
import { Replay } from "./replay";
import type { ItemInfo, ReplayPerson } from "./replay-scoreboard";
import { Scoreboard } from "./scoreboard";
import { SnapshotTiles } from "./snapshot-tiles";
import { TeamGold } from "./team-gold";
import { TurningPoints } from "./turning-points";
import { WinChance } from "./win-chance";

// Everything below the match header, once the match has been analyzed: the
// matchup, @10 and @15 stats, the lead chart with turning points, the replay
// (beta), your team's win chance, team gold with objectives, deaths, and the
// scoreboard. In the same order as the mockup, plus the replay, the win
// chance and, for junglers, the jungle map, early pathing and early ganks.
// The replay adds the tempo timeline for junglers.
export function AnalysisSections({
  region,
  match,
  analysis: a,
  winChance,
  dd,
  label,
}: {
  region: Region;
  match: Match;
  analysis: MatchAnalysis;
  // Null for games the win chance model doesn't cover.
  winChance: MatchWinChance | null;
  dd: DataDragon | null;
  label: (championName: string) => string;
}) {
  const { participants } = match.info;
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  const name = (id: number) => label(byId.get(id)?.championName ?? "Someone");
  const markers: TurningPointMarker[] = a.turningPoints.map((p) => ({
    minute: p.timestamp / 60_000,
    label: `${formatClock(p.timestamp)} ${p.title}`,
    tone: p.swing > 0 ? "ahead" : "behind",
  }));
  const mapPlayers: MapPlayer[] = participants.map((p) => ({
    participantId: p.participantId,
    name: label(p.championName),
    iconUrl: dd ? championIconUrl(dd, p.championName) : null,
    ours: p.teamId === a.me.teamId,
  }));

  return (
    <>
      <Matchup
        dd={dd}
        me={a.me}
        opponent={a.opponent}
        at15={a.at15}
        finalGoldDiff={a.series?.gold.at(-1)?.diff ?? null}
      />

      {a.at10 && <SnapshotTiles snapshot={a.at10} />}
      {a.at15 && <SnapshotTiles snapshot={a.at15} />}

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

      {a.jungleReplay && (
        <JungleMap replay={a.jungleReplay} players={mapPlayers} myTeamId={a.me.teamId} />
      )}
      {a.pathing && <PathingGrid pathing={a.pathing} />}
      {a.ganks && a.opponent && (
        <Ganks ganks={a.ganks} enemyJungler={label(a.opponent.championName)} />
      )}
      <Replay
        replay={a.replay}
        tempo={a.tempo}
        people={replayPeople(participants, a, dd, label)}
        items={replayItems(a, dd)}
        winningTeamId={participants.find((p) => p.win)?.teamId ?? 0}
        docsHref={`${REPO_URL}/blob/main/docs/replay.md`}
        tempoDocsHref={`${REPO_URL}/blob/main/docs/tempo.md`}
      />

      {winChance && <WinChance {...winChance} />}

      <div className="flex flex-wrap items-start gap-5">
        <TeamGold points={a.teamGold} objectives={a.objectives} />
        <Deaths deaths={a.deaths} name={name} />
      </div>

      <Scoreboard
        region={region}
        dd={dd}
        participants={participants}
        meId={a.me.participantId}
        opponentId={a.opponent?.participantId ?? null}
      />
    </>
  );
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
      for (const id of [...change.slots, change.trinket]) {
        const name = id > 0 ? itemName(dd, id) : null;
        if (name) items[id] = { name, iconUrl: itemIconUrl(dd, id) };
      }
    }
  }
  return items;
}
