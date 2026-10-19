// The replay's map: where all ten champions were at the second the replay is
// on, with a cross where anyone died in the last 10 seconds. Positions come
// from src/lib/analyzer/positions.ts: exact at Riot's once-a-minute
// snapshots, at deaths and at trips to the fountain, estimated in between.
//
// The champions are drawn over the map in HTML rather than inside its SVG, so
// they stay big enough to recognize however small the map gets on a phone.
// It's drawn inside the replay, a Client Component.

import { formatClock } from "@/lib/analyzer/format";
import { describeSpot, MAP_SIZE } from "@/lib/analyzer/map";
import type { PlayerMoment, ReplayKill, Scoreboard } from "@/lib/analyzer/replay";
import type { MapPosition } from "@/lib/riot/types";
import { MapBackground } from "./jungle-map";
import { Picture, type ReplayPerson } from "./replay-scoreboard";

// How long a kill's cross stays on the map.
const KILL_MARK_MS = 10_000;

export function ReplayMap({
  board,
  t,
  people,
  kills,
  myTeamId,
}: {
  board: Scoreboard;
  t: number;
  // Your team first, each team in role order.
  people: ReplayPerson[];
  kills: ReplayKill[];
  myTeamId: number;
}) {
  const moment = (id: number) => board.players.find((p) => p.participantId === id)!;
  const teamOf = new Map(people.map((p) => [p.participantId, p.teamId]));
  const recent = kills.filter((k) => k.timestamp <= t && t - k.timestamp < KILL_MARK_MS);

  // What screen readers hear: every champion and where they are, in words.
  const spots = (ours: boolean) =>
    people
      .filter((p) => (p.teamId === myTeamId) === ours)
      .map((p) => {
        const now = moment(p.participantId);
        return `${p.name} (${now.respawnAt !== null ? "dead" : describeSpot(now.position, myTeamId)})`;
      })
      .join(", ");
  const label = `Map at ${formatClock(t)}. Your team: ${spots(true)}. Enemy team: ${spots(false)}.`;

  return (
    <div className="flex w-full max-w-[420px] flex-[1_1_340px] flex-col gap-2.5">
      <div
        role="img"
        aria-label={label}
        className="relative aspect-square w-full overflow-hidden rounded-[14px] border border-line bg-page"
      >
        <svg
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          aria-hidden="true"
          className="absolute inset-0 size-full"
        >
          <MapBackground myTeamId={myTeamId} />
        </svg>
        {recent.map((k, i) =>
          k.position ? (
            <KillCross
              key={`${k.timestamp}-${i}`}
              position={k.position}
              ours={teamOf.get(k.victimId) !== myTeamId}
            />
          ) : null,
        )}
        {people.map((person) => (
          <Champion
            key={person.participantId}
            person={person}
            now={moment(person.participantId)}
            t={t}
            ours={person.teamId === myTeamId}
            myTeamId={myTeamId}
          />
        ))}
        {/* Drawn after everyone, so a champion standing on a dead one
            doesn't hide when they're back. */}
        {people.map((person) => (
          <BackIn key={person.participantId} now={moment(person.participantId)} t={t} />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1.5 text-note text-muted">
        <RingSwatch className="border-ahead">Your team</RingSwatch>
        <RingSwatch className="border-behind">Enemy team</RingSwatch>
        <span>Faded: dead, with the time until they&apos;re back</span>
        <span>×: a kill in the last 10 seconds</span>
      </div>
      <p className="text-note text-faint">
        Spots are exact at each minute mark, at deaths and at the fountain, and estimated in
        between.
      </p>
    </div>
  );
}

// Where a spot sits on the map: its share of the width from the left, and of
// the height from the top (Riot's y axis points up). Kept off the very edge,
// so a champion at the fountain still shows whole.
function place({ x, y }: MapPosition) {
  const share = (value: number) => `${Math.min(96, Math.max(4, (value / MAP_SIZE) * 100))}%`;
  return { left: share(x), top: share(MAP_SIZE - y) };
}

// A champion's picture in a ring of their team's color, like the in-game
// minimap. Like the scoreboard's outlines, your ring is thicker and your
// opponent's dashed. A dead champion stays faded where they died.
function Champion({
  person,
  now,
  t,
  ours,
  myTeamId,
}: {
  person: ReplayPerson;
  now: PlayerMoment;
  t: number;
  ours: boolean;
  myTeamId: number;
}) {
  const dead = now.respawnAt !== null;
  const ring =
    person.tag === "You"
      ? "border-[3px] border-solid"
      : person.tag === "Opponent"
        ? "border-2 border-dashed"
        : "border-2 border-solid";
  // You on top, then your opponent, then everyone else alive, then the dead.
  const layer = person.tag === "You" ? 6 : person.tag === "Opponent" ? 5 : dead ? 1 : 3;
  return (
    <div
      title={`${person.name}: ${dead ? `dead, back in ${backIn(now, t)}` : describeSpot(now.position, myTeamId)}`}
      className="absolute size-[26px] -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-100 ease-linear motion-reduce:transition-none"
      style={{ ...place(now.position), zIndex: layer }}
    >
      <span
        className={`flex size-full items-center justify-center overflow-hidden rounded-full bg-surface ${ring} ${
          ours ? "border-ahead" : "border-behind"
        } ${dead ? "opacity-45 grayscale" : ""}`}
      >
        {person.iconUrl ? (
          <Picture src={person.iconUrl} alt="" size={26} className="size-full rounded-full" />
        ) : (
          <span className="text-[10px] font-semibold text-ink-soft">
            {person.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
    </div>
  );
}

// Under a dead champion, the time until they're back.
function BackIn({ now, t }: { now: PlayerMoment; t: number }) {
  if (now.respawnAt === null) return null;
  return (
    <span
      className="absolute z-[7] -translate-x-1/2 translate-y-[14px] whitespace-nowrap rounded-[4px] bg-page px-[3px] py-0.5 font-mono text-[10px] leading-none text-ink"
      style={place(now.position)}
    >
      {backIn(now, t)}
    </span>
  );
}

// Rounded up, so it never says 0:00 while they're still dead.
function backIn(now: PlayerMoment, t: number): string {
  return formatClock(Math.ceil(((now.respawnAt ?? t) - t) / 1000) * 1000);
}

// A cross where someone died: blue when your team got the kill, red when
// the enemy did.
function KillCross({ position, ours }: { position: MapPosition; ours: boolean }) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={`pointer-events-none absolute z-[2] size-3.5 -translate-x-1/2 -translate-y-1/2 ${
        ours ? "text-ahead-bright" : "text-behind"
      }`}
      style={place(position)}
    >
      <path
        d="M3 3 L11 11 M11 3 L3 11"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

function RingSwatch({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-[11px] rounded-full border-2 ${className}`} />
      {children}
    </span>
  );
}
