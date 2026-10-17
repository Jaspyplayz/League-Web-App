"use client";

// The tempo timeline (beta), for junglers: a strip across the whole game,
// blue while you were up tempo and red while the enemy jungler was. It
// changes at the second someone died, respawned, levelled up or shopped.
// Above it are the epic monsters each team took; below it, when each jungler
// was dead and when they shopped. Dragging along the strip, or pressing
// play, shows why each moment got its call and what each jungler did in the
// minute after. How the call is made is in src/lib/analyzer/tempo.ts and
// docs/tempo.md.
//
// It's a Client Component so moving through the game doesn't reload the
// page. The whole timeline is a few dozen KB, so it all arrives with the
// page.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock } from "@/lib/analyzer/format";
import { describeSpot } from "@/lib/analyzer/map";
import { OBJECTIVE_NAMES } from "@/lib/analyzer/objectives";
import {
  describeTempo,
  LEVEL_GOLD,
  PLAYER_GOLD,
  stretchAt,
  TEMPO_LEAD,
  type Activity,
  type ObjectiveWindow,
  type TempoStretch,
  type TempoTimeline,
  type TempoTone,
} from "@/lib/analyzer/tempo";
import type { MapPosition } from "@/lib/riot/types";
import { StepButton } from "./jungle-map";
import { LegendSwatch } from "./legend-swatch";

type Props = {
  tempo: TempoTimeline;
  // Champion display name for each participantId.
  names: Record<number, string>;
  myTeamId: number;
  // Where the full explanation lives (docs/tempo.md on GitHub).
  docsHref: string;
};

const TONE_FILL: Record<TempoTone, string> = {
  ahead: "bg-ahead",
  behind: "bg-behind",
  even: "bg-line-strong",
};
const TONE_TEXT: Record<TempoTone, string> = {
  ahead: "text-ahead-soft",
  behind: "text-behind",
  even: "text-ink-soft",
};

// The first clear is usually done by about 3:15, so the timeline opens on
// the first call either way from 3:00.
const START_MS = 3 * 60_000;
// Playback moves the clock every TICK_MS, by `speed` seconds of game time
// per real second: at 30x a 30-minute game plays in a minute.
const TICK_MS = 100;
const SPEEDS = [10, 30, 60];
// How far ahead "In the next minute" looks.
const NEXT_MS = 60_000;

// Stretches next to each other with the same call, joined. The strip draws
// these, and the arrow buttons jump between them.
type Run = { from: number; to: number; tone: TempoTone };

export function Tempo({ tempo, names, myTeamId, docsHref }: Props) {
  const { stretches, activities } = tempo;
  const end = stretches.at(-1)?.to ?? 0;
  const [t, setT] = useState(() => openingMoment(joinRuns(stretches), end));
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

  const now = stretchAt(stretches, t);
  if (!now || end === 0) return null;

  const them = names[tempo.enemyId] ?? "The enemy jungler";
  const you = names[tempo.meId] ?? "You";
  const { title, reasons } = describeTempo(now, { them });
  const runs = joinRuns(stretches);
  const run = runs.find((r) => t < r.to) ?? runs[runs.length - 1];
  const changes = runs.slice(1).map((r) => r.from);
  const previousChange = changes.findLast((c) => c < t);
  const nextChange = changes.find((c) => c > t);
  const timeIn = (tone: TempoTone) =>
    runs.filter((r) => r.tone === tone).reduce((total, r) => total + r.to - r.from, 0);

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
  const nextUntil = Math.min(end, t + NEXT_MS);
  const soon = (list: Activity[]) => list.filter((a) => a.timestamp > t && a.timestamp <= nextUntil);

  return (
    <section aria-labelledby="tempo-heading" className={`${panelClass} flex flex-col gap-[18px] p-6`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <PanelHeading id="tempo-heading">Tempo timeline</PanelHeading>
          <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-label uppercase tracking-[0.12em] text-faint">
            Beta
          </span>
        </div>
        <p className="text-sm text-muted">
          An experiment: which jungler had the time advantage at each moment of the game, so could
          make the next play while the other had to farm, back or give way. A jungler counts as up
          tempo when they&apos;re the only one alive, or when their lead adds up to at least{" "}
          {TEMPO_LEAD.toLocaleString("en-US")} gold: the gold they&apos;ve spent on items, plus{" "}
          {LEVEL_GOLD.toLocaleString("en-US")} for each level ahead and{" "}
          {PLAYER_GOLD.toLocaleString("en-US")} for each extra player alive on their team. It
          changes the second someone dies, respawns, levels up or shops. It shows the situation,
          not whether anyone made the right call.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-note text-muted">
        <LegendSwatch className="bg-ahead">You up tempo</LegendSwatch>
        <LegendSwatch className="bg-behind">{`${them} up tempo`}</LegendSwatch>
        <LegendSwatch className="bg-line-strong">Even</LegendSwatch>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          {/* The marks repeat what the details below say in words, so screen
              readers skip them and get the time and call from the slider. */}
          <div aria-hidden="true" className="flex w-[4.5rem] flex-none flex-col gap-1">
            <RowLabel className="h-6">Monsters</RowLabel>
            <RowLabel className="h-9">Tempo</RowLabel>
            <RowLabel className="h-6">{you}</RowLabel>
            <RowLabel className="h-6">{them}</RowLabel>
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
              aria-valuetext={`${formatClock(t)}: ${title}`}
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
              <div aria-hidden="true" className="relative h-6">
                <MonsterMarks windows={tempo.objectives} left={left} />
              </div>
              <div aria-hidden="true" className="relative h-9 overflow-hidden rounded-[3px] bg-line-strong">
                {runs.map((r) => (
                  <span
                    key={r.from}
                    className={`absolute inset-y-0 ${TONE_FILL[r.tone]}`}
                    style={{ left: left(r.from), width: width(r.from, r.to) }}
                  />
                ))}
              </div>
              <JunglerMarks activities={activities.you} tone="ahead" left={left} width={width} />
              <JunglerMarks activities={activities.them} tone="behind" left={left} width={width} />
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
          <div className="flex items-center gap-1">
            <StepButton
              label="Previous change of tempo"
              disabled={previousChange === undefined}
              onClick={() => moveTo(previousChange ?? 0)}
            >
              <path d="M15 6l-6 6 6 6" />
            </StepButton>
            <StepButton label={playing ? "Pause" : "Play"} onClick={play}>
              {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5l11 7-11 7z" />}
            </StepButton>
            <StepButton
              label="Next change of tempo"
              disabled={nextChange === undefined}
              onClick={() => moveTo(nextChange ?? end)}
            >
              <path d="M9 6l6 6-6 6" />
            </StepButton>
            <span className="ml-2 font-mono text-sm text-muted">
              {formatClock(t)} / {formatClock(end)}
            </span>
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
        Above the strip, the epic monsters each team took (D dragon, E Elder, G grubs, H Herald, B
        Baron); below it, when each jungler was dead (the faded bars) and when they shopped (●).
        Over the game you were up tempo for {minutes(timeIn("ahead"))}, {them} for{" "}
        {minutes(timeIn("behind"))}, and it was even for {minutes(timeIn("even"))}.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-[260px] flex-[1_1_340px] flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[32px] leading-none text-ink">{formatClock(t)}</span>
              <span className={`text-body font-semibold ${TONE_TEXT[now.tone]}`}>{title}</span>
            </div>
            <span className="text-note text-faint">
              From {formatClock(run.from)} to {formatClock(run.to)}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <MonstersUp windows={tempo.objectives} at={t} />
        </div>

        <div className="flex min-w-[260px] flex-[1_1_340px] flex-col gap-3">
          <h3 className="font-mono text-label uppercase tracking-[0.12em] text-faint">
            In the next minute, to {formatClock(nextUntil)}
          </h3>
          <div className="flex flex-wrap gap-5">
            <DidList
              title={`You (${you})`}
              tone="ahead"
              activities={soon(activities.you)}
              names={names}
              myTeamId={myTeamId}
            />
            <DidList
              title={them}
              tone="behind"
              activities={soon(activities.them)}
              names={names}
              myTeamId={myTeamId}
            />
          </div>
        </div>
      </div>

      <p className="text-note text-faint">
        Riot logs deaths, level-ups and purchases to the second, but gold only once a minute and
        nothing about waves, vision or cooldowns, so this is an estimate.
        {tempo.exactItemGold
          ? ""
          : " This game was saved before Turnpoint kept unspent gold, so item gold is estimated from when each jungler shopped."}{" "}
        <a href={docsHref} className="text-ahead-soft hover:text-ahead-bright">
          How it&apos;s worked out, and how well it held up in real games
        </a>
        .
      </p>
    </section>
  );
}

// Where the timeline opens: the first moment from START_MS where either
// jungler was up tempo for at least a few seconds, or START_MS if it was
// even all game.
function openingMoment(runs: Run[], end: number): number {
  const first = runs.find((r) => r.tone !== "even" && r.to - Math.max(r.from, START_MS) >= 5_000);
  return Math.min(end, first ? Math.max(START_MS, first.from) : START_MS);
}

function joinRuns(stretches: TempoStretch[]): Run[] {
  const runs: Run[] = [];
  for (const s of stretches) {
    const last = runs.at(-1);
    if (last && last.tone === s.tone) last.to = s.to;
    else runs.push({ from: s.from, to: s.to, tone: s.tone });
  }
  return runs;
}

// 754_000 -> "13 minutes", rounded for the summary under the strip.
function minutes(ms: number): string {
  const whole = Math.round(ms / 60_000);
  return whole === 0 ? "under a minute" : whole === 1 ? "1 minute" : `${whole} minutes`;
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
  windows,
  left,
}: {
  windows: ObjectiveWindow[];
  left: (ms: number) => string;
}) {
  return windows
    .filter((w) => w.takenAt !== null)
    .map((w) => (
      <span
        key={`${w.kind}-${w.spawnsAt}`}
        title={`${w.ours ? "Your team" : "Enemy team"} took ${OBJECTIVE_NAMES[w.kind].name} at ${formatClock(w.takenAt!)}`}
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-label leading-none ${
          w.ours ? "text-ahead-soft" : "text-behind"
        }`}
        style={{ left: left(w.takenAt!) }}
      >
        {OBJECTIVE_NAMES[w.kind].short}
      </span>
    ));
}

// A jungler's row: a faded bar while they were dead, and a dot at each shop
// visit.
function JunglerMarks({
  activities,
  tone,
  left,
  width,
}: {
  activities: Activity[];
  tone: "ahead" | "behind";
  left: (ms: number) => string;
  width: (from: number, to: number) => string;
}) {
  return (
    <div aria-hidden="true" className="relative h-6">
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {activities.map((a) =>
        a.type === "died" ? (
          <span
            key={`died-${a.timestamp}`}
            title={`Dead from ${formatClock(a.timestamp)} to ${formatClock(a.respawnAt)}`}
            className={`absolute top-1/2 h-2.5 min-w-[3px] -translate-y-1/2 rounded-sm opacity-40 ${
              tone === "ahead" ? "bg-ahead" : "bg-behind"
            }`}
            style={{ left: left(a.timestamp), width: width(a.timestamp, a.respawnAt) }}
          />
        ) : a.type === "shop" ? (
          <span
            key={`shop-${a.timestamp}`}
            title={`Shopped at ${formatClock(a.timestamp)}`}
            className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              tone === "ahead" ? "bg-ahead-soft" : "bg-behind"
            }`}
            style={{ left: left(a.timestamp) }}
          />
        ) : null,
      )}
    </div>
  );
}

// Epic monsters up at the moment, or spawning in the minute after it.
function MonstersUp({ windows, at }: { windows: ObjectiveWindow[]; at: number }) {
  const up = windows.filter((w) => w.spawnsAt <= at && at < w.endsAt);
  const soon = windows.filter((w) => w.spawnsAt > at && w.spawnsAt <= at + NEXT_MS);
  if (up.length === 0 && soon.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {up.map((w) => (
        <li key={`${w.kind}-${w.spawnsAt}`} className={chipClass}>
          {OBJECTIVE_NAMES[w.kind].name} up
        </li>
      ))}
      {soon.map((w) => (
        <li key={`${w.kind}-${w.spawnsAt}`} className={chipClass}>
          {OBJECTIVE_NAMES[w.kind].name} spawns at {formatClock(w.spawnsAt)}
        </li>
      ))}
    </ul>
  );
}

const chipClass =
  "rounded-[10px] border border-line-strong bg-page px-3 py-1.5 text-sm text-ink-soft";

function DidList({
  title,
  tone,
  activities,
  names,
  myTeamId,
}: {
  title: string;
  tone: "ahead" | "behind";
  activities: Activity[];
  names: Record<number, string>;
  myTeamId: number;
}) {
  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
      <h4 className={`text-sm font-semibold ${tone === "ahead" ? "text-ahead-soft" : "text-behind"}`}>
        {title}
      </h4>
      {activities.length === 0 ? (
        <p className="text-sm text-faint">No kills, deaths, epic monsters or shopping.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {activities.map((a, i) => (
            <li key={`${a.timestamp}-${i}`}>{describeActivity(a, names, myTeamId)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One line about something a jungler did, like "8:21 Killed Ahri (mid lane)".
function describeActivity(a: Activity, names: Record<number, string>, myTeamId: number): string {
  const name = (id: number) => names[id] ?? "someone";
  const where = (p: MapPosition | null) => (p ? ` (${describeSpot(p, myTeamId)})` : "");
  switch (a.type) {
    case "shop":
      return `${formatClock(a.timestamp)} Shopped${a.afterDeath ? " after dying" : ""}`;
    case "takedown":
      return `${formatClock(a.timestamp)} ${a.killed ? "Killed" : "Helped kill"} ${name(a.victimId)}${where(a.position)}`;
    case "died":
      return `${formatClock(a.timestamp)} ${a.killerId > 0 ? `Died to ${name(a.killerId)}` : "Died to a tower or minions"}${where(a.position)}, back at ${formatClock(a.respawnAt)}`;
    case "objective":
      return `${formatClock(a.timestamp)} ${a.killed ? "Took" : "Helped take"} ${OBJECTIVE_NAMES[a.kind].name}`;
  }
}
