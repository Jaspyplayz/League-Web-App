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
import { byRole, teamOrder } from "@/lib/analyzer/team-analysis";
import {
  championIconUrl,
  itemIconUrl,
  itemName,
  riftMapUrl,
  type DataDragon,
} from "@/lib/ddragon";
import { boardPlays, quietLines } from "@/lib/board";
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
import { LaneBoard } from "./lane-board";
import { Matchup } from "./match-header";
import { phaseSpan, PhaseRatings } from "./phase-ratings";
import { Replay } from "./replay";
import type { ItemInfo, ReplayPerson } from "./replay-scoreboard";
import { SnapshotTable } from "./snapshot-table";
import { SummaryColumns } from "./summary-columns";
import { TeamGold } from "./team-gold";
import { SWING_LETTERS, WinChanceNote } from "./win-chance";

// Everything below the match header, once the match has been analyzed, in
// three tabs so the vital part comes first (Jasper's order, 2026-10-19, and
// the Summary, Replay and Stats split, JAS-105):
// - Summary: layout A from JAS-89, in two columns on wide screens and one on
//   phones, with the board first. On the left, the board (the gold lead with an
//   eval bar, and the win-chance strip with your plays on it), the scoreboard
//   paired by lane, "How the game went" beside you vs your opponent with your
//   ratings, then the recap and your notes. On the right, Game review, which
//   steps through your plays with the board (summary-columns.tsx).
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

  const swings = winChance?.swings ?? [];
  const overall = scoreGame(match).get(a.me.participantId) ?? null;

  const summary = (
    <SummaryColumns
      board={{
        lead:
          a.series && a.opponent
            ? { series: a.series, opponentName: label(a.opponent.championName) }
            : null,
        teamGold: a.teamGold,
        markers,
        chances: chances && {
          perSecond: chances.perSecond,
          plays: boardPlays(chances, a.replay, a.me.participantId, names, a.tempo),
        },
        swings: swings.map((s, i) => ({
          minute: s.timestamp / 60_000,
          letter: SWING_LETTERS[i],
        })),
        quiet: quietLines({
          hasOpponent: a.series !== null && a.opponent !== null,
          turningPoints: a.turningPoints.length,
          hasWinChance: winChance !== null,
          swings: swings.length,
        }),
        note: winChance && <WinChanceNote model={winChance.model} />,
      }}
      review={{
        scores: [
          ...(overall ? [{ label: "Overall", span: "Whole game", score: overall.score }] : []),
          ...phases.map((p) => ({ label: p.label, span: phaseSpan(p), score: p.score })),
        ],
        // "Add to notes" only when there's a notes box, which needs sign-in to
        // be set up.
        notes: supabaseConfig() !== null,
      }}
    >
      <LaneBoard
        region={region}
        dd={dd}
        participants={participants}
        meId={a.me.participantId}
        opponentId={a.opponent?.participantId ?? null}
      />

      {/* Layout A has neither of these. They stay here, side by side when
          there's room, so nothing on Summary disappears: the strip's letters
          and the chart's numbers point at the first one. */}
      <div className="flex flex-wrap items-start gap-3.5 *:min-w-0 *:flex-[1_1_340px]">
        <GameTimeline turningPoints={a.series ? a.turningPoints : []} swings={swings} />
        <section aria-label="You vs your opponent and game by phase" className={panelClass}>
          <Matchup
            dd={dd}
            me={a.me}
            opponent={a.opponent}
            at15={a.at15}
            finalGoldDiff={a.series?.gold.at(-1)?.diff ?? null}
          />
          {phases.length > 0 && <PhaseRatings phases={phases} overall={overall} />}
        </section>
      </div>

      {/* Side by side when both show. Either can be missing (no recap
          without the API key, no notes without sign-in), and the other then
          takes the full width. */}
      <div className="flex flex-wrap gap-3.5 empty:hidden *:min-w-0 *:flex-[1_1_340px]">
        {recap}
        {notes}
      </div>
    </SummaryColumns>
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

      {/* Beside each other from 1280px (xl), the Ask panel under the replay
          below that. Beside Ask, the replay's scoreboard drops under its map,
          as it does on narrower screens. */}
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

      {/* Side by side when there's room, Deaths under Team gold on phones,
          with the same 28px gap as the tab's other panels. */}
      <div className="flex flex-wrap items-start gap-7">
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
        dataDragonFailed={dd === null}
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
