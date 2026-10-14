import type { TurningPointMarker } from "@/components/diff-chart";
import type { MatchAnalysis } from "@/lib/analyzer";
import { formatClock } from "@/lib/analyzer/format";
import { championIconUrl, type DataDragon } from "@/lib/ddragon";
import type { Region } from "@/lib/regions";
import type { Match } from "@/lib/riot/types";
import type { MatchWinChance } from "@/lib/win-chance";
import { Deaths } from "./deaths";
import { JungleMap, type MapPlayer } from "./jungle-map";
import { LeadChart } from "./lead-chart";
import { Matchup } from "./match-header";
import { PathingGrid } from "./pathing";
import { Scoreboard } from "./scoreboard";
import { SnapshotTiles } from "./snapshot-tiles";
import { TeamGold } from "./team-gold";
import { TurningPoints } from "./turning-points";
import { WinChance } from "./win-chance";

// Everything below the match header, once the match has been analyzed: the
// matchup, @10 and @15 stats, the lead chart with turning points, your team's
// win chance, team gold with objectives, deaths, and the scoreboard. In the
// same order as the mockup, plus the win chance and, for junglers, the
// jungle map and early pathing.
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
