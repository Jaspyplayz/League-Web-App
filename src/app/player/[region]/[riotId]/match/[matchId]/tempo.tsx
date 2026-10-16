"use client";

// The tempo timeline (beta), for junglers: one block per minute, blue when
// you were up tempo and red when the enemy jungler was, with the epic
// monsters taken above it and each jungler's shop visits and deaths below.
// Picking a minute shows why it got that call and what each jungler did in
// the minute after. How the call is made is in src/lib/analyzer/tempo.ts and
// docs/tempo.md.
//
// It's a Client Component so picking a minute doesn't reload the page. The
// whole timeline is a few KB, so it all arrives with the page.

import { useRef, useState, type KeyboardEvent } from "react";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock } from "@/lib/analyzer/format";
import { describeSpot } from "@/lib/analyzer/map";
import { OBJECTIVE_NAMES } from "@/lib/analyzer/objectives";
import {
  describeTempo,
  LEVEL_GOLD,
  TEMPO_LEAD,
  type Activity,
  type ObjectiveWindow,
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

// The first clear is usually done by about 3:15, so the first minute worth
// opening on is the first call from 3:00.
const START_MS = 3 * 60_000;

export function Tempo({ tempo, names, myTeamId, docsHref }: Props) {
  const { minutes } = tempo;
  const [index, setIndex] = useState(() => {
    const first = minutes.findIndex((m) => m.timestamp >= START_MS && m.tone !== "even");
    if (first !== -1) return first;
    return Math.max(0, minutes.findIndex((m) => m.timestamp >= START_MS));
  });
  const blocks = useRef<(HTMLButtonElement | null)[]>([]);
  if (minutes.length === 0) return null;

  const last = minutes.length - 1;
  const them = names[tempo.enemyId] ?? "The enemy jungler";
  const you = names[tempo.meId] ?? "You";
  const minute = minutes[index];
  const nextMark = minutes[index + 1] ?? null;
  const { title, reasons } = describeTempo(minute, { them });
  const count = (tone: TempoTone) => minutes.filter((m) => m.tone === tone).length;

  // The minute blocks work like radio buttons: Tab reaches the picked one,
  // and the arrow keys (or Home and End) move the pick.
  const pick = (i: number, focus = false) => {
    setIndex(i);
    if (focus) blocks.current[i]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? index - 1
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? index + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    pick(Math.min(last, Math.max(0, to)), true);
  };

  // The strip's columns: a label, then one per minute, in every row.
  const columns = { gridTemplateColumns: `4.5rem repeat(${minutes.length}, minmax(0, 1fr))` };
  const minuteColumns = {
    gridColumn: "2 / -1",
    gridTemplateColumns: `repeat(${minutes.length}, minmax(0, 1fr))`,
  };
  const minuteRow = "grid gap-x-0.5";

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
          An experiment: which jungler had the time advantage each minute, so could make the next
          play while the other had to farm, back or give way. A jungler counts as up tempo when
          they&apos;re the only one alive, or when the gold they&apos;ve spent on items, plus{" "}
          {LEVEL_GOLD.toLocaleString("en-US")} for each level they&apos;re ahead, puts them at least{" "}
          {TEMPO_LEAD.toLocaleString("en-US")} ahead. It shows the situation, not whether anyone
          made the right call.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-note text-muted">
        <LegendSwatch className="bg-ahead">You up tempo</LegendSwatch>
        <LegendSwatch className="bg-behind">{`${them} up tempo`}</LegendSwatch>
        <LegendSwatch className="bg-line-strong">Even</LegendSwatch>
      </div>

      {/* On phones the strip keeps a usable size and scrolls sideways. */}
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[560px] gap-y-1" style={columns}>
          {/* The marks repeat what the details below say in words, so screen
              readers skip them. */}
          <RowLabel>Monsters</RowLabel>
          <div aria-hidden="true" className={minuteRow} style={minuteColumns}>
            {minutes.map((m) => (
              <MonsterMarks
                key={m.timestamp}
                windows={tempo.objectives}
                from={m.timestamp}
                to={m.next.until}
              />
            ))}
          </div>

          <RowLabel>Tempo</RowLabel>
          <div
            role="radiogroup"
            aria-label={`Tempo by minute. You were up tempo for ${count("ahead")} minutes, ${them} for ${count("behind")}, and it was even for ${count("even")}.`}
            onKeyDown={onKeyDown}
            className={minuteRow}
            style={minuteColumns}
          >
            {minutes.map((m, i) => (
              <button
                key={m.timestamp}
                ref={(el) => {
                  blocks.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={i === index}
                aria-label={`${formatClock(m.timestamp)}: ${describeTempo(m, { them }).title}`}
                tabIndex={i === index ? 0 : -1}
                title={formatClock(m.timestamp)}
                onClick={() => pick(i)}
                className={`h-9 rounded-[3px] ${TONE_FILL[m.tone]} ${
                  i === index
                    ? "relative z-10 outline-2 outline-offset-1 outline-ink"
                    : "hover:opacity-80"
                }`}
              />
            ))}
          </div>

          <RowLabel>{you}</RowLabel>
          <div aria-hidden="true" className={minuteRow} style={minuteColumns}>
            {minutes.map((m) => (
              <JunglerMarks key={m.timestamp} activities={m.next.you} tone="ahead" />
            ))}
          </div>
          <RowLabel>{them}</RowLabel>
          <div aria-hidden="true" className={minuteRow} style={minuteColumns}>
            {minutes.map((m) => (
              <JunglerMarks key={m.timestamp} activities={m.next.them} tone="behind" />
            ))}
          </div>

          <span />
          <div aria-hidden="true" className={minuteRow} style={minuteColumns}>
            {minutes.map((m) => {
              const whole = Math.round(m.timestamp / 60_000);
              return (
                <span key={m.timestamp} className="text-center font-mono text-label text-faint">
                  {whole % 5 === 0 ? whole : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-note text-faint">
        Above the strip, the epic monsters each team took (D dragon, E Elder, G grubs, H Herald, B
        Baron); below it, when each jungler shopped (●) or died (×). Each mark sits in the minute it
        happened in.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-[260px] flex-[1_1_340px] flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
              <span className="font-mono text-[32px] leading-none text-ink">
                {formatClock(minute.timestamp)}
              </span>
              <span className={`text-body font-semibold ${TONE_TEXT[minute.tone]}`}>{title}</span>
            </div>
            <div className="flex gap-1">
              <StepButton
                label="Previous minute"
                disabled={index === 0}
                onClick={() => pick(index - 1)}
              >
                <path d="M15 6l-6 6 6 6" />
              </StepButton>
              <StepButton label="Next minute" disabled={index === last} onClick={() => pick(index + 1)}>
                <path d="M9 6l6 6-6 6" />
              </StepButton>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <MonstersUp windows={tempo.objectives} at={minute.timestamp} />
        </div>

        <div className="flex min-w-[260px] flex-[1_1_340px] flex-col gap-3">
          <h3 className="font-mono text-label uppercase tracking-[0.12em] text-faint">
            Then, until {formatClock(minute.next.until)}
          </h3>
          <div className="flex flex-wrap gap-5">
            <DidList
              title={`You (${you})`}
              tone="ahead"
              activities={minute.next.you}
              endedAt={
                nextMark
                  ? { clock: formatClock(nextMark.timestamp), position: nextMark.you.position }
                  : null
              }
              names={names}
              myTeamId={myTeamId}
            />
            <DidList
              title={them}
              tone="behind"
              activities={minute.next.them}
              endedAt={
                nextMark
                  ? { clock: formatClock(nextMark.timestamp), position: nextMark.them.position }
                  : null
              }
              names={names}
              myTeamId={myTeamId}
            />
          </div>
        </div>
      </div>

      <p className="text-note text-faint">
        Riot records gold, levels and positions once a minute, and nothing about waves, vision or
        cooldowns, so this is an estimate.
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

function RowLabel({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="truncate pr-2 text-note leading-6 text-faint"
      title={children}
    >
      {children}
    </span>
  );
}

// Epic monsters taken between one minute mark and the next, as letters in
// the color of the team that took them.
function MonsterMarks({
  windows,
  from,
  to,
}: {
  windows: ObjectiveWindow[];
  from: number;
  to: number;
}) {
  const taken = windows.filter((w) => w.takenAt !== null && w.takenAt > from && w.takenAt <= to);
  return (
    <span className="flex h-6 items-center justify-center gap-px font-mono text-label leading-none">
      {taken.map((w) => (
        <span
          key={`${w.kind}-${w.spawnsAt}`}
          title={`${w.ours ? "Your team" : "Enemy team"} took ${OBJECTIVE_NAMES[w.kind].name} at ${formatClock(w.takenAt!)}`}
          className={w.ours ? "text-ahead-soft" : "text-behind"}
        >
          {OBJECTIVE_NAMES[w.kind].short}
        </span>
      ))}
    </span>
  );
}

// A jungler's shop visits (●) and deaths (×) between one mark and the next.
function JunglerMarks({ activities, tone }: { activities: Activity[]; tone: "ahead" | "behind" }) {
  const color = tone === "ahead" ? "text-ahead-soft" : "text-behind";
  return (
    <span
      className={`flex h-6 items-center justify-center gap-px text-[13px] font-semibold leading-none ${color}`}
    >
      {activities.map((a) =>
        a.type === "shop" ? (
          <span key={`shop-${a.timestamp}`} title={`Shopped at ${formatClock(a.timestamp)}`}>
            ●
          </span>
        ) : a.type === "died" ? (
          <span key={`died-${a.timestamp}`} title={`Died at ${formatClock(a.timestamp)}`}>
            ×
          </span>
        ) : null,
      )}
    </span>
  );
}

// Epic monsters up at the picked minute, or spawning before the next one.
function MonstersUp({ windows, at }: { windows: ObjectiveWindow[]; at: number }) {
  const up = windows.filter((w) => w.spawnsAt <= at && at < w.endsAt);
  const soon = windows.filter((w) => w.spawnsAt > at && w.spawnsAt <= at + 60_000);
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
  endedAt,
  names,
  myTeamId,
}: {
  title: string;
  tone: "ahead" | "behind";
  activities: Activity[];
  // Where they were at the next minute mark, if there is one.
  endedAt: { clock: string; position: MapPosition | null } | null;
  names: Record<number, string>;
  myTeamId: number;
}) {
  const lines = activities.map((a) => describeActivity(a, names, myTeamId));
  if (endedAt?.position) {
    lines.push(`At ${endedAt.clock}: ${describeSpot(endedAt.position, myTeamId)}`);
  }
  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
      <h4 className={`text-sm font-semibold ${tone === "ahead" ? "text-ahead-soft" : "text-behind"}`}>
        {title}
      </h4>
      {lines.length === 0 ? (
        <p className="text-sm text-faint">Nothing Riot recorded.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
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
      return `${formatClock(a.timestamp)} ${a.killerId > 0 ? `Died to ${name(a.killerId)}` : "Died to a tower or minions"}${where(a.position)}`;
    case "objective":
      return `${formatClock(a.timestamp)} ${a.killed ? "Took" : "Helped take"} ${OBJECTIVE_NAMES[a.kind].name}`;
    case "farm":
      return `Farmed ${a.cs} CS`;
  }
}
