// The parts of the replay only junglers see (beta): a strip across the game,
// blue while you were up tempo and red while the enemy jungler was, each
// jungler's deaths and shop visits under it, and why the moment the replay
// is on got its call. The call changes at the second someone died,
// respawned, levelled up or shopped. How it's made is in
// src/lib/analyzer/tempo.ts and docs/tempo.md.
//
// replay.tsx owns the clock and lays these out. They draw whatever moment
// it passes them.

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
import { LegendSwatch } from "./legend-swatch";

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

// The first clear is usually done by about 3:15, so the replay opens on the
// first call either way from 3:00.
const START_MS = 3 * 60_000;
// How far ahead "In the next minute" looks.
const NEXT_MS = 60_000;

// Stretches next to each other with the same call, joined. The strip draws
// these, and the replay's arrow buttons jump between them.
export type Run = { from: number; to: number; tone: TempoTone };

export function joinRuns(stretches: TempoStretch[]): Run[] {
  const runs: Run[] = [];
  for (const s of stretches) {
    const last = runs.at(-1);
    if (last && last.tone === s.tone) last.to = s.to;
    else runs.push({ from: s.from, to: s.to, tone: s.tone });
  }
  return runs;
}

// Where the replay opens for a jungler: the first moment from START_MS
// where either jungler was up tempo for at least a few seconds, or START_MS
// if it was even all game.
export function openingMoment(runs: Run[], end: number): number {
  const first = runs.find((r) => r.tone !== "even" && r.to - Math.max(r.from, START_MS) >= 5_000);
  return Math.min(end, first ? Math.max(START_MS, first.from) : START_MS);
}

export function TempoLegend({ them }: { them: string }) {
  return (
    <>
      <LegendSwatch className="bg-ahead">You up tempo</LegendSwatch>
      <LegendSwatch className="bg-behind">{`${them} up tempo`}</LegendSwatch>
      <LegendSwatch className="bg-line-strong">Even</LegendSwatch>
    </>
  );
}

// The strip itself: one block per run, in its color.
export function TempoBar({
  runs,
  left,
  width,
}: {
  runs: Run[];
  left: (ms: number) => string;
  width: (from: number, to: number) => string;
}) {
  return (
    <div aria-hidden="true" className="relative h-9 overflow-hidden rounded-[3px] bg-line-strong">
      {runs.map((r) => (
        <span
          key={r.from}
          className={`absolute inset-y-0 ${TONE_FILL[r.tone]}`}
          style={{ left: left(r.from), width: width(r.from, r.to) }}
        />
      ))}
    </div>
  );
}

// A jungler's row: a faded bar while they were dead, and a dot at each shop
// visit.
export function JunglerMarks({
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

// The sentence under the strip about the jungler rows, and how long each
// jungler was up tempo over the game.
export function tempoNote(runs: Run[], them: string): string {
  const timeIn = (tone: TempoTone) =>
    runs.filter((r) => r.tone === tone).reduce((total, r) => total + r.to - r.from, 0);
  return (
    `Under the tempo strip, when each jungler was dead (the faded bars) and when they shopped (●). ` +
    `Over the game you were up tempo for ${minutes(timeIn("ahead"))}, ${them} for ` +
    `${minutes(timeIn("behind"))}, and it was even for ${minutes(timeIn("even"))}.`
  );
}

// 754_000 -> "13 minutes", rounded for the summary under the strip.
function minutes(ms: number): string {
  const whole = Math.round(ms / 60_000);
  return whole === 0 ? "under a minute" : whole === 1 ? "1 minute" : `${whole} minutes`;
}

// The tempo at moment t: the call and the numbers behind it, epic monsters
// up, and what each jungler did in the next minute.
export function TempoReadout({
  tempo,
  t,
  names,
  myTeamId,
  docsHref,
}: {
  tempo: TempoTimeline;
  t: number;
  // Champion display name for each participantId.
  names: Record<number, string>;
  myTeamId: number;
  // Where the full explanation lives (docs/tempo.md on GitHub).
  docsHref: string;
}) {
  const now = stretchAt(tempo.stretches, t);
  if (!now) return null;
  const end = tempo.stretches.at(-1)?.to ?? 0;
  const them = names[tempo.enemyId] ?? "The enemy jungler";
  const you = names[tempo.meId] ?? "You";
  const { title, reasons } = describeTempo(now, { them });
  const runs = joinRuns(tempo.stretches);
  const run = runs.find((r) => t < r.to) ?? runs[runs.length - 1];
  const nextUntil = Math.min(end, t + NEXT_MS);
  const soon = (list: Activity[]) => list.filter((a) => a.timestamp > t && a.timestamp <= nextUntil);

  return (
    <section aria-labelledby="tempo-heading" className="flex flex-col gap-4 border-t border-line pt-5">
      <div className="flex flex-col gap-1.5">
        <h3
          id="tempo-heading"
          className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.01em]"
        >
          Jungle tempo
        </h3>
        <p className="text-sm text-muted">
          Which jungler had the time advantage, so could make the next play while the other had to
          farm, back or give way. A jungler counts as up tempo when they&apos;re the only one alive,
          or when their lead adds up to at least {TEMPO_LEAD.toLocaleString("en-US")} gold: the gold
          they&apos;ve spent on items, plus {LEVEL_GOLD.toLocaleString("en-US")} for each level
          ahead and {PLAYER_GOLD.toLocaleString("en-US")} for each extra player alive on their team.
          It shows the situation, not whether anyone made the right call.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-[260px] flex-[1_1_340px] flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className={`text-body font-semibold ${TONE_TEXT[now.tone]}`}>
              {formatClock(t)} · {title}
            </span>
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
          <h4 className="font-mono text-label uppercase tracking-[0.12em] text-faint">
            In the next minute, to {formatClock(nextUntil)}
          </h4>
          <div className="flex flex-wrap gap-5">
            <DidList
              title={`You (${you})`}
              tone="ahead"
              activities={soon(tempo.activities.you)}
              names={names}
              myTeamId={myTeamId}
            />
            <DidList
              title={them}
              tone="behind"
              activities={soon(tempo.activities.them)}
              names={names}
              myTeamId={myTeamId}
            />
          </div>
        </div>
      </div>

      <p className="text-note text-faint">
        Riot logs deaths, level-ups and purchases to the second, but gold only once a minute and
        nothing about waves, vision or cooldowns, so the tempo is an estimate.
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
      <h5 className={`text-sm font-semibold ${tone === "ahead" ? "text-ahead-soft" : "text-behind"}`}>
        {title}
      </h5>
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
