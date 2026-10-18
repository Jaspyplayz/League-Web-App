"use client";

// The replay (beta): the whole game on one timeline you can drag or play,
// with the map and scoreboard at that second under it, so you can see where
// every champion was and each player's level, kills, CS, gold and items at
// any moment. Above them, your team's chance to win at that second, and
// under them every play of the game, graded by how much it changed that
// chance (replay-plays.tsx). For junglers it adds the tempo strip and why
// each moment got its call (tempo.tsx). How the numbers are worked out is in
// src/lib/analyzer/replay.ts, positions.ts, plays.ts and docs/replay.md.
//
// It's a Client Component so moving through the game doesn't reload the
// page. Everything it draws arrives with the page, a few dozen KB.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock, formatGap } from "@/lib/analyzer/format";
import { OBJECTIVE_NAMES } from "@/lib/analyzer/objectives";
import type { ReplayChances } from "@/lib/analyzer/plays";
import {
  monsterMarks,
  scoreboardAt,
  type ReplayData,
  type ReplayKill,
  type ReplayObjective,
} from "@/lib/analyzer/replay";
import type { TempoTimeline } from "@/lib/analyzer/tempo";
import { StepButton } from "./jungle-map";
import { LegendSwatch } from "./legend-swatch";
import { ReplayMap } from "./replay-map";
import { ChanceRow, PlayMarks, playStart, ReplayPlays } from "./replay-plays";
import { ReplayScoreboard, type ItemInfo, type ReplayPerson } from "./replay-scoreboard";
import {
  JunglerMarks,
  joinRuns,
  openingMoment,
  TempoBar,
  TempoLegend,
  tempoNote,
  TempoReadout,
} from "./tempo";

type Props = {
  replay: ReplayData;
  // Your team's chance to win at every second, and the graded plays. Null for
  // games the win chance model doesn't cover.
  chances: ReplayChances | null;
  // Null unless you played jungle.
  tempo: TempoTimeline | null;
  // Your team first, each team in role order.
  people: ReplayPerson[];
  // Name and image of every item the replay shows.
  items: Record<number, ItemInfo>;
  winningTeamId: number;
  // Where the full explanations live (docs/replay.md and docs/tempo.md on
  // GitHub).
  docsHref: string;
  tempoDocsHref: string;
};

// Playback moves the clock every TICK_MS, by `speed` seconds of game time
// per real second: at 30x a 30-minute game plays in a minute.
const TICK_MS = 100;
const SPEEDS = [10, 30, 60];

export function Replay({
  replay,
  chances,
  tempo,
  people,
  items,
  winningTeamId,
  docsHref,
  tempoDocsHref,
}: Props) {
  const { end, kills, myTeamId } = replay;
  const runs = tempo ? joinRuns(tempo.stretches) : null;
  // Junglers start on the first moment either jungler was up tempo, everyone
  // else on first blood.
  const [t, setT] = useState(() => (runs ? openingMoment(runs, end) : (kills[0]?.timestamp ?? 0)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const track = useRef<HTMLDivElement>(null);

  // While playing, move the clock forward and stop at the end.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setT((now) => {
        const next = Math.min(end, now + speed * TICK_MS);
        if (next >= end) setPlaying(false);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, speed, end]);

  if (end === 0) return null;
  const board = scoreboardAt(replay, t);
  const names = Object.fromEntries(people.map((p) => [p.participantId, p.name]));
  const teamOf = new Map(people.map((p) => [p.participantId, p.teamId]));
  const them = tempo ? (names[tempo.enemyId] ?? "The enemy jungler") : "";
  const you = tempo ? (names[tempo.meId] ?? "You") : "";

  // The arrow buttons jump between plays. Without the win chance model, they
  // jump between changes of tempo for junglers and kills for everyone else.
  const plays = chances?.plays ?? null;
  const stops = plays
    ? plays.map(playStart)
    : runs
      ? runs.slice(1).map((r) => r.from)
      : [...new Set(kills.map((k) => k.timestamp))];
  const stopName = plays ? "play" : runs ? "change of tempo" : "kill";
  // Your team's chance to win at the clock, from the second it's in (rounded
  // up, so a kill counts from the moment it happens).
  const chance = chances
    ? chances.perSecond[Math.min(chances.perSecond.length - 1, Math.ceil(t / 1000))] / 1000
    : null;
  const previousStop = stops.findLast((s) => s < t);
  const nextStop = stops.find((s) => s > t);

  // Where a moment sits along the strip, and how wide a span is.
  const left = (ms: number) => `${(Math.min(ms, end) / end) * 100}%`;
  const width = (from: number, to: number) => `${((Math.min(to, end) - from) / end) * 100}%`;

  const moveTo = (ms: number) => {
    setPlaying(false);
    setT(Math.min(end, Math.max(0, ms)));
  };
  // Pressing or dragging anywhere on the strip moves the clock there, to the
  // second. Capturing the pointer keeps the drag going if it leaves the strip.
  const seek = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const share = (clientX - box.left) / box.width;
    moveTo(Math.round((share * end) / 1000) * 1000);
  };
  // The strip works like a slider from the keyboard too: the arrow keys move
  // 5 seconds, Page Up and Page Down a minute, Home and End to either end.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? t - 5_000
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? t + 5_000
          : e.key === "PageDown"
            ? t - 60_000
            : e.key === "PageUp"
              ? t + 60_000
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? end
                  : null;
    if (to === null) return;
    e.preventDefault();
    moveTo(to);
  };
  const play = () => {
    // Pressing play at the end starts again from the beginning.
    if (!playing && t >= end) setT(0);
    setPlaying((p) => !p);
  };

  // A label every 5 minutes (every 10 on phones), leaving out one that
  // would hang off the end.
  const ticks: number[] = [];
  for (let minute = 5; minute * 60_000 < end * 0.96; minute += 5) ticks.push(minute * 60_000);

  // What screen readers hear for the slider's value.
  const ours = board.teams.find((team) => team.teamId === myTeamId);
  const theirs = board.teams.find((team) => team.teamId !== myTeamId);
  const gold = ours && theirs ? formatGap(ours.gold, theirs.gold) : null;
  const valueText =
    `${formatClock(t)}: ` +
    (gold && ours && theirs
      ? `${gold.tone === "even" ? "gold even" : `your team ${gold.text} in gold`}, ${ours.kills} kills to ${theirs.kills}`
      : "") +
    (chance !== null ? `, ${percent(chance)} chance to win` : "");

  return (
    <section aria-labelledby="replay-heading" className={`${panelClass} flex flex-col gap-[18px] p-6`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <PanelHeading id="replay-heading">Replay</PanelHeading>
          <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-label uppercase tracking-[0.12em] text-faint">
            Beta
          </span>
        </div>
        <p className="text-sm text-muted">
          The whole game, second by second. Drag along the timeline or press play, and the map
          shows where every champion was at that moment, and the scoreboard their level, kills, CS,
          gold and items.
          {chances
            ? " The line on top is your team's chance to win, and the plays under the scoreboard are graded by how much each one moved it."
            : ""}
          {tempo ? " The tempo strip shows which jungler had the time advantage." : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-note text-muted">
        {chances && (
          <>
            <LegendSwatch className="bg-ahead/40">Your team favored</LegendSwatch>
            <LegendSwatch className="bg-behind/40">Enemy team favored</LegendSwatch>
          </>
        )}
        <LegendSwatch className="bg-ahead">Kill by your team</LegendSwatch>
        <LegendSwatch className="bg-behind">Kill by the enemy team</LegendSwatch>
        {tempo && <TempoLegend them={them} />}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          {/* The marks repeat what the scoreboard says in words, so screen
              readers skip them and get the time and score from the slider. */}
          <div aria-hidden="true" className="flex w-[4.5rem] flex-none flex-col gap-1">
            {chances && (
              <>
                <RowLabel className="h-14">Win chance</RowLabel>
                <RowLabel className="h-6">Plays</RowLabel>
              </>
            )}
            <RowLabel className="h-6">Monsters</RowLabel>
            <RowLabel className="h-6">Kills</RowLabel>
            {tempo && (
              <>
                <RowLabel className="h-9">Tempo</RowLabel>
                <RowLabel className="h-6">{you}</RowLabel>
                <RowLabel className="h-6">{them}</RowLabel>
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Game time"
              aria-valuemin={0}
              aria-valuemax={Math.floor(end / 1000)}
              aria-valuenow={Math.floor(t / 1000)}
              aria-valuetext={valueText}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seek(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
              }}
              onKeyDown={onKeyDown}
              className="relative flex cursor-ew-resize touch-pan-y select-none flex-col gap-1 rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ahead-soft"
            >
              {chances && (
                <>
                  <ChanceRow perSecond={chances.perSecond} />
                  <PlayMarks plays={chances.plays} left={left} />
                </>
              )}
              <MonsterMarks marks={monsterMarks(replay.objectives)} myTeamId={myTeamId} left={left} />
              <KillMarks kills={kills} names={names} teamOf={teamOf} myTeamId={myTeamId} left={left} />
              {tempo && runs && (
                <>
                  <TempoBar runs={runs} left={left} width={width} />
                  <JunglerMarks activities={tempo.activities.you} tone="ahead" left={left} width={width} />
                  <JunglerMarks activities={tempo.activities.them} tone="behind" left={left} width={width} />
                </>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink"
                style={{ left: left(t) }}
              />
            </div>
            <div aria-hidden="true" className="relative h-5">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className={`absolute top-1 -translate-x-1/2 font-mono text-label text-faint ${
                    tick % 600_000 === 0 ? "" : "max-sm:hidden"
                  }`}
                  style={{ left: left(tick) }}
                >
                  {formatClock(tick)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <StepButton
              label={`Previous ${stopName}`}
              disabled={previousStop === undefined}
              onClick={() => moveTo(previousStop ?? 0)}
            >
              <path d="M15 6l-6 6 6 6" />
            </StepButton>
            <StepButton label={playing ? "Pause" : "Play"} onClick={play}>
              {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5l11 7-11 7z" />}
            </StepButton>
            <StepButton
              label={`Next ${stopName}`}
              disabled={nextStop === undefined}
              onClick={() => moveTo(nextStop ?? end)}
            >
              <path d="M9 6l6 6-6 6" />
            </StepButton>
            <span className="ml-2 whitespace-nowrap font-mono text-sm text-muted">
              {formatClock(t)} / {formatClock(end)}
            </span>
            {chance !== null && (
              <span className="ml-3 whitespace-nowrap text-sm text-muted">
                Your team&apos;s chance to win{" "}
                <span
                  className={`font-mono font-semibold ${
                    chance > 0.5 ? "text-ahead-soft" : chance < 0.5 ? "text-behind" : "text-ink"
                  }`}
                >
                  {percent(chance)}
                </span>
              </span>
            )}
          </div>
          <div
            role="group"
            aria-label="Playback speed"
            className="inline-flex overflow-hidden rounded-lg border border-line-strong text-note"
          >
            {SPEEDS.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={speed === x}
                onClick={() => setSpeed(x)}
                className={`px-3 py-1.5 font-mono ${
                  speed === x ? "bg-line-strong text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {x}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-note text-faint">
        {chances
          ? "Each dot under the win chance line is a play: blue when it raised your team's chance, red when it lowered it, grey when it barely moved it, bigger the more it moved, and square when it took an objective. "
          : ""}
        Letters mark the epic monsters each team took (D dragon, E Elder, G grubs, H Herald, B
        Baron, A Atakhan), in blue for your team and red for the enemy&apos;s, and ticks mark the
        kills. {runs ? tempoNote(runs, them) : ""}
      </p>

      {/* The map beside the scoreboard when both fit, above it otherwise. */}
      <div className="flex flex-wrap items-start gap-6">
        <ReplayMap board={board} t={t} people={people} kills={kills} myTeamId={myTeamId} />
        <div className="min-w-0 flex-[1_1_560px]">
          <ReplayScoreboard
            board={board}
            t={t}
            people={people}
            items={items}
            roleSlot={replay.players.some((p) => p.items?.some((change) => change.roleItem > 0))}
            myTeamId={myTeamId}
            winningTeamId={winningTeamId}
          />
        </div>
      </div>

      {tempo && (
        <TempoReadout tempo={tempo} t={t} names={names} myTeamId={myTeamId} docsHref={tempoDocsHref} />
      )}

      {chances && (
        <ReplayPlays
          chances={chances}
          replay={replay}
          names={names}
          t={t}
          onPick={moveTo}
          tempo={tempo}
          them={them}
        />
      )}

      <p className="text-note text-faint">
        Riot logs kills, deaths, level-ups and items to the second, but positions, gold and CS only
        once a minute, so between those snapshots they&apos;re estimates.{" "}
        <a href={docsHref} className="text-ahead-soft hover:text-ahead-bright">
          How the replay is worked out
        </a>
        .
      </p>
    </section>
  );
}

// 0.6143 -> "61%".
function percent(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

function RowLabel({ className, children }: { className: string; children: string }) {
  return (
    <span className={`flex items-center truncate pr-2 text-note text-faint ${className}`} title={children}>
      {children}
    </span>
  );
}

// Epic monsters taken, as letters in the color of the team that took them,
// at the second they died.
function MonsterMarks({
  marks,
  myTeamId,
  left,
}: {
  marks: ReplayObjective[];
  myTeamId: number;
  left: (ms: number) => string;
}) {
  return (
    <div aria-hidden="true" className="relative h-6">
      {marks.map((m) => {
        const ours = m.teamId === myTeamId;
        return (
          <span
            key={`${m.kind}-${m.timestamp}`}
            title={`${ours ? "Your team" : "Enemy team"} took ${OBJECTIVE_NAMES[m.kind].name} at ${formatClock(m.timestamp)}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-label leading-none ${
              ours ? "text-ahead-soft" : "text-behind"
            }`}
            style={{ left: left(m.timestamp) }}
          >
            {OBJECTIVE_NAMES[m.kind].short}
          </span>
        );
      })}
    </div>
  );
}

// A tick at each champion kill: blue when your team got it, red when the
// enemy team did (a death on your team).
function KillMarks({
  kills,
  names,
  teamOf,
  myTeamId,
  left,
}: {
  kills: ReplayKill[];
  names: Record<number, string>;
  teamOf: Map<number, number>;
  myTeamId: number;
  left: (ms: number) => string;
}) {
  return (
    <div aria-hidden="true" className="relative h-6">
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {kills.map((k, i) => {
        const ours = teamOf.get(k.victimId) !== myTeamId;
        const victim = names[k.victimId] ?? "someone";
        return (
          <span
            key={`${k.timestamp}-${i}`}
            title={`${formatClock(k.timestamp)} ${k.killerId > 0 ? `${names[k.killerId] ?? "Someone"} killed ${victim}` : `${victim} died to a tower or minions`}`}
            className={`absolute inset-y-1 w-[3px] -translate-x-1/2 rounded-full ${ours ? "bg-ahead" : "bg-behind"}`}
            style={{ left: left(k.timestamp) }}
          />
        );
      })}
    </div>
  );
}
