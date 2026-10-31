import type { ReactNode } from "react";
import type { TurningPointMarker } from "@/components/diff-chart";
import { ChampionIcon } from "@/components/game-icons";
import { RunePage } from "@/components/rune-page";
import { REPO_URL } from "@/components/site-header";
import { TeamAnalysis } from "@/components/team-analysis";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
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
import type { BuildView } from "@/lib/match-builds";
import type { Region } from "@/lib/regions";
import type { Match } from "@/lib/riot/types";
import { supabaseConfig } from "@/lib/supabase/config";
import type { MatchWinChance } from "@/lib/win-chance";
import { AnalysisTabs } from "./analysis-tabs";
import { BuildAndRunes } from "./build-and-runes";
import { Deaths } from "./deaths";
import { EarlyJungle } from "./early-jungle";
import { GameTimeline } from "./game-timeline";
import { Matchup } from "./match-header";
import { PhaseRatings } from "./phase-ratings";
import { Replay } from "./replay";
import { Review } from "./review";
import type { ItemInfo, ReplayPerson } from "./replay-scoreboard";
import { Scoreboard } from "./scoreboard";
import { SnapshotTable } from "./snapshot-table";
import { TeamGold } from "./team-gold";

// Everything below the match header, once the match has been analyzed, in
// three tabs so the vital part comes first (Jasper's order, 2026-10-19, and
// the Summary, Replay and Stats split, JAS-105):
// - Summary: the scoreboard; one strip with you vs your opponent and your
//   early, mid, late and overall ratings; the 60-second review; "How the
//   game went", the lead and win chance charts on one time axis with the
//   turning points and biggest swings beside them; then the recap and your
//   notes side by side (the "shared timeline" layout, 2026-10-20).
// - Replay: a one-line beta note, then the replay (with the tempo timeline
//   for junglers) and the Ask panel beside it on wide screens, under it on
//   narrower ones.
// - Stats: one table of you vs your opponent at 10 and 15 minutes, team gold
//   with objectives beside your deaths, for junglers one "Early jungle"
//   panel with early pathing and both junglers' ganks, then Team analysis,
//   and each player's build and runes.
export function AnalysisSections({
  region,
  match,
  analysis: a,
  winChance,
  chances,
  phases,
  dd,
  label,
  builds,
  recap,
  notes,
  ask,
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
  // Every player's items and skill order, keyed by participantId.
  builds: Record<number, BuildView>;
  // Drawn by the page, since they load their own data.
  recap: ReactNode;
  notes: ReactNode;
  ask: ReactNode;
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

      <section
        aria-label="You vs your opponent and game by phase"
        className={`${panelClass} grid ${phases.length > 0 ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}
      >
        <Matchup
          dd={dd}
          me={a.me}
          opponent={a.opponent}
          at15={a.at15}
          finalGoldDiff={a.series?.gold.at(-1)?.diff ?? null}
        />
        {phases.length > 0 && (
          <PhaseRatings
            phases={phases}
            overall={scoreGame(match).get(a.me.participantId) ?? null}
          />
        )}
      </section>

      {/* "Add to notes" only when there's a notes box, which needs sign-in
          to be set up. */}
      {chances && (
        <Review
          moments={reviewMoments(chances, a.replay, a.me.participantId, names, a.tempo)}
          notes={supabaseConfig() !== null}
        />
      )}

      <GameTimeline
        lead={
          a.series && a.opponent
            ? { series: a.series, markers, opponentName: label(a.opponent.championName) }
            : null
        }
        turningPoints={a.turningPoints}
        winChance={winChance}
      />

      {/* Side by side when both show. Either can be missing (no recap
          without the API key, no notes without sign-in), and the other then
          takes the full width. */}
      <div className="flex flex-wrap gap-5 empty:hidden *:min-w-0 *:flex-[1_1_340px]">
        {recap}
        {notes}
      </div>
    </>
  );

  const replay = (
    <>
      <p className="text-note text-quiet">
        Beta: the replay is rebuilt from Riot&apos;s timeline, so it can be a little off.{" "}
        <a
          href={`${REPO_URL}/blob/main/docs/replay.md`}
          className="font-medium text-ahead-soft hover:underline"
        >
          How it&apos;s checked
        </a>
      </p>

      {/* Beside each other from 1280px (xl), where the replay still has room
          for its map and scoreboard; the Ask panel goes under it below that. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
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
        {ask}
      </div>
    </>
  );

  const stats = (
    <>
      {a.opponent && (
        <SnapshotTable
          snapshots={[a.at10, a.at15].filter((s) => s !== null)}
          opponentName={label(a.opponent.championName)}
        />
      )}

      <div className="flex flex-wrap items-start gap-5">
        <TeamGold points={a.teamGold} objectives={a.objectives} />
        <Deaths deaths={a.deaths} name={name} />
      </div>

      <EarlyJungle
        pathing={a.pathing}
        ganks={a.ganks}
        enemyJungler={a.opponent ? label(a.opponent.championName) : null}
      />

      <section
        aria-labelledby="team-analysis-heading"
        className={`${panelClass} flex flex-col gap-4 p-6`}
      >
        <PanelHeading id="team-analysis-heading">Team analysis</PanelHeading>
        <TeamAnalysis
          dd={dd}
          participants={participants}
          youId={a.me.participantId}
          opponentId={a.opponent?.participantId}
        />
      </section>

      <BuildAndRunes
        builds={builds}
        runePages={Object.fromEntries(
          participants.map((p) => [
            p.participantId,
            <RunePage key={p.participantId} dd={dd} perks={p.perks} />,
          ]),
        )}
        players={participants.map((p) => ({
          participantId: p.participantId,
          teamId: p.teamId,
          ally: p.teamId === a.me.teamId,
          won: p.win,
          label: [label(p.championName), p.riotIdGameName].filter(Boolean).join(", "),
          icon: <ChampionIcon dd={dd} name={p.championName} size={30} className="rounded-md" />,
        }))}
        defaultPlayerId={a.me.participantId}
      />
    </>
  );

  return <AnalysisTabs summary={summary} replay={replay} stats={stats} />;
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
