"use client";

// The jungle replay map: where both junglers were at each minute, with a
// slider to move through the game. Lanes are tinted by whether your team was
// ahead there, so you can see the situation each jungle move was made in.
//
// It's a Client Component because the slider and play button change the
// minute without reloading the page. The whole replay is small (a few
// positions per minute), so it all arrives with the page.

import { useEffect, useState, type ReactNode } from "react";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock, formatSigned } from "@/lib/analyzer/format";
import { EVEN_LANE_LEAD, LANES, type JungleReplay, type Lane } from "@/lib/analyzer/jungle-replay";
import { describeSpot } from "@/lib/analyzer/map";
import { OBJECTIVE_NAMES } from "@/lib/analyzer/objectives";
import type { MapPosition } from "@/lib/riot/types";
import { LegendSwatch } from "./legend-swatch";

export type MapPlayer = {
  participantId: number;
  name: string; // champion display name
  iconUrl: string | null; // null when Data Dragon couldn't be reached
  ours: boolean;
};

type Props = {
  replay: JungleReplay;
  players: MapPlayer[];
  myTeamId: number;
};

// Riot's map coordinates run from 0 to about 14,900 on both axes, with the
// blue base at the bottom left. The SVG uses the same units, flipped
// vertically because SVG's y axis points down.
const SIZE = 14900;
const toSvg = ({ x, y }: MapPosition) => ({ cx: x, cy: SIZE - y });

// The first clear is usually done by about 3:15, so minute 3 is where the
// interesting part starts.
const START_MINUTE = 3;
const PLAY_STEP_MS = 900;

export function JungleMap({ replay, players, myTeamId }: Props) {
  const last = replay.frames.length - 1;
  const [index, setIndex] = useState(Math.min(START_MINUTE, last));
  const [playing, setPlaying] = useState(false);

  // While playing, step forward one minute at a time and stop at the end.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, last]);

  const frame = replay.frames[index];
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const name = (id: number) => byId.get(id)?.name ?? "Someone";
  const positionOf = (id: number) => frame.positions[id - 1];
  const spot = (id: number) => {
    const position = positionOf(id);
    return position ? describeSpot(position, myTeamId) : "position unknown";
  };
  const me = replay.meId;
  const enemy = replay.enemyJunglerId;
  const clock = formatClock(frame.timestamp);

  const play = () => {
    // Pressing play at the end starts again from the beginning.
    if (index >= last) setIndex(0);
    setPlaying((p) => !p);
  };

  return (
    <section
      aria-labelledby="jungle-map-heading"
      className="flex flex-col gap-[18px] rounded-[18px] border border-line-strong bg-surface p-6"
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="jungle-map-heading">Jungle map</PanelHeading>
        <p className="text-sm text-muted">
          Where you and {name(enemy)} really were, minute by minute. Riot records positions once a
          minute, so these are snapshots, not exact paths.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Map at ${clock}. You (${name(me)}): ${spot(me)}. Enemy jungler (${name(enemy)}): ${spot(enemy)}.`}
          className="aspect-square w-full max-w-[440px] flex-none rounded-[14px] bg-page"
        >
          <MapBackground myTeamId={myTeamId} laneLeads={frame.laneLeads} />

          {/* Everyone else, as small dots, so you can see who could join a fight. */}
          {players
            .filter((p) => p.participantId !== me && p.participantId !== enemy)
            .map((p) => {
              const position = positionOf(p.participantId);
              if (!position) return null;
              return (
                <circle
                  key={p.participantId}
                  {...toSvg(position)}
                  r={260}
                  fill={`var(--color-${p.ours ? "ahead" : "behind"})`}
                  opacity={0.75}
                >
                  <title>{`${p.name}: ${describeSpot(position, myTeamId)}`}</title>
                </circle>
              );
            })}

          {/* Kills since the last minute, as crosses where they happened. */}
          {frame.kills.map((k) =>
            k.position ? (
              <KillMark
                key={`${k.timestamp}-${k.victimId}`}
                position={k.position}
                ours={byId.get(k.victimId)?.ours === false}
              />
            ) : null,
          )}

          {[enemy, me].map((id) => {
            const player = byId.get(id);
            const position = positionOf(id);
            if (!player || !position) return null;
            return <JunglerMark key={id} player={player} position={position} />;
          })}
        </svg>

        <div className="flex min-w-[260px] flex-1 flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[32px] leading-none text-ink" aria-live="polite">
                {clock}
              </span>
              <div className="flex gap-1">
                <StepButton
                  label="Previous minute"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  <path d="M15 6l-6 6 6 6" />
                </StepButton>
                <StepButton label={playing ? "Pause" : "Play"} onClick={play}>
                  {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5l11 7-11 7z" />}
                </StepButton>
                <StepButton
                  label="Next minute"
                  disabled={index === last}
                  onClick={() => setIndex(index + 1)}
                >
                  <path d="M9 6l6 6-6 6" />
                </StepButton>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={last}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              aria-label="Minute"
              aria-valuetext={clock}
              className="w-full accent-ahead"
            />
          </div>

          <dl className="flex flex-col gap-2 text-[15px]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ahead-soft">You ({name(me)})</dt>
              <dd className="text-muted">{spot(me)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-behind">Enemy jungler ({name(enemy)})</dt>
              <dd className="text-muted">{spot(enemy)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Lanes (gold + XP)
            </h3>
            <ul className="flex flex-wrap gap-2">
              {LANES.map((lane) => (
                <LaneLead key={lane} lane={lane} lead={frame.laneLeads[lane]} />
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              In the minute before
            </h3>
            {frame.kills.length === 0 && frame.objectives.length === 0 ? (
              <p className="text-sm text-faint">No kills or objectives.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm text-muted">
                {frame.kills.map((k) => (
                  <li key={`${k.timestamp}-${k.victimId}`}>
                    <span className="font-mono text-faint">{formatClock(k.timestamp)}</span>{" "}
                    {k.killerId > 0 ? name(k.killerId) : "A tower or minions"} killed{" "}
                    {name(k.victimId)}
                    {k.position && ` (${describeSpot(k.position, myTeamId)})`}
                  </li>
                ))}
                {frame.objectives.map((o) => (
                  <li key={`${o.timestamp}-${o.kind}`}>
                    <span className="font-mono text-faint">{formatClock(o.timestamp)}</span>{" "}
                    {o.ours ? "Your team" : "Enemy team"} took {OBJECTIVE_NAMES[o.kind].name}
                    {o.count > 1 && ` ×${o.count}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] text-muted">
        <LegendSwatch className="bg-ahead">Your team / lane ahead</LegendSwatch>
        <LegendSwatch className="bg-behind">Enemy team / lane behind</LegendSwatch>
        <LegendSwatch className="bg-line-strong">Lane even</LegendSwatch>
        <span>× kill in the last minute</span>
      </div>
    </section>
  );
}

function laneTone(lead: number | null): "ahead" | "behind" | "even" {
  if (lead === null || Math.abs(lead) < EVEN_LANE_LEAD) return "even";
  return lead > 0 ? "ahead" : "behind";
}

const TONE_COLOR = {
  ahead: "var(--color-ahead)",
  behind: "var(--color-behind)",
  even: "var(--color-line-strong)",
};

// Lane paths in map units (already flipped for SVG): top runs up the left
// edge and along the top, bot along the bottom and up the right edge, mid is
// the diagonal between the bases.
const LANE_PATHS: Record<Lane, string> = {
  top: "M1200 11400 L1200 1200 L11400 1200",
  mid: "M3500 11400 L11400 3500",
  bot: "M3500 13700 L13700 13700 L13700 3500",
};

// A simple drawing of Summoner's Rift: river, lanes tinted by who's ahead,
// both bases, and the Dragon and Baron pits.
function MapBackground({
  myTeamId,
  laneLeads,
}: {
  myTeamId: number;
  laneLeads: Record<Lane, number | null>;
}) {
  const blueIsMine = myTeamId === 100;
  return (
    <g>
      {/* The river runs from top left to bottom right. */}
      <path
        d="M1800 1800 L13100 13100"
        stroke="var(--color-line)"
        strokeOpacity={0.7}
        strokeWidth={1400}
        strokeLinecap="round"
      />
      {LANES.map((lane) => (
        <path
          key={lane}
          d={LANE_PATHS[lane]}
          fill="none"
          stroke={TONE_COLOR[laneTone(laneLeads[lane])]}
          strokeOpacity={laneTone(laneLeads[lane]) === "even" ? 1 : 0.45}
          strokeWidth={800}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {/* Blue base bottom left, red base top right. */}
      <rect
        x={0}
        y={SIZE - 3600}
        width={3600}
        height={3600}
        rx={600}
        fill={`var(--color-${blueIsMine ? "ahead" : "behind"})`}
        opacity={0.18}
      />
      <rect
        x={SIZE - 3600}
        y={0}
        width={3600}
        height={3600}
        rx={600}
        fill={`var(--color-${blueIsMine ? "behind" : "ahead"})`}
        opacity={0.18}
      />
      <g fill="var(--color-faint)" fontSize={700} textAnchor="middle" fontFamily="var(--font-mono)">
        <text {...pitText({ x: 9866, y: 4414 })}>D</text>
        <text {...pitText({ x: 5007, y: 10471 })}>B</text>
      </g>
    </g>
  );
}

function pitText(position: MapPosition) {
  const { cx, cy } = toSvg(position);
  return { x: cx, y: cy + 250 };
}

// A jungler: their champion icon in a ring of their team's color.
function JunglerMark({ player, position }: { player: MapPlayer; position: MapPosition }) {
  const { cx, cy } = toSvg(position);
  const r = 700;
  const clipId = `jungler-clip-${player.participantId}`;
  const color = `var(--color-${player.ours ? "ahead" : "behind"})`;
  return (
    <g>
      <title>{player.name}</title>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill="var(--color-surface)" />
      {player.iconUrl ? (
        <image
          href={player.iconUrl}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <text
          x={cx}
          y={cy + 220}
          textAnchor="middle"
          fontSize={600}
          fontWeight={700}
          fill="var(--color-ink-soft)"
        >
          {player.name.slice(0, 2).toUpperCase()}
        </text>
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={160} />
    </g>
  );
}

// A cross where someone died. Blue when your team got the kill.
function KillMark({ position, ours }: { position: MapPosition; ours: boolean }) {
  const { cx, cy } = toSvg(position);
  const d = 320;
  return (
    <path
      d={`M${cx - d} ${cy - d} L${cx + d} ${cy + d} M${cx + d} ${cy - d} L${cx - d} ${cy + d}`}
      stroke={`var(--color-${ours ? "ahead-bright" : "behind"})`}
      strokeWidth={170}
      strokeLinecap="round"
    />
  );
}

function LaneLead({ lane, lead }: { lane: Lane; lead: number | null }) {
  const tone = laneTone(lead);
  const color = { ahead: "text-ahead-soft", behind: "text-behind", even: "text-muted" }[tone];
  return (
    <li className="flex items-baseline gap-2 rounded-[10px] border border-line-strong bg-page px-3 py-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">{lane}</span>
      <span className={`font-mono text-sm ${color}`}>
        {lead === null ? "n/a" : tone === "even" ? "even" : formatSigned(lead)}
      </span>
    </li>
  );
}

function StepButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-[10px] border border-line-strong bg-page text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
