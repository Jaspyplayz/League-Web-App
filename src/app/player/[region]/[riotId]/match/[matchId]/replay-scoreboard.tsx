// The replay's scoreboard: both teams at the second the replay is on. Like
// the scoreboard at the bottom of the page, your team comes first, both are
// in role order, the winning team is blue and the losing team red, and you
// and your opponent are outlined.
//
// Phones get a list instead of the table: five columns don't fit on a phone,
// and a table you have to scroll sideways is awkward while you drag the
// timeline above it.
//
// It's drawn inside the replay, a Client Component, so it gets image
// addresses worked out on the server instead of all of Data Dragon.

import Image from "next/image";
import { Gap } from "@/components/ui/gap";
import { formatClock, formatGap, plural } from "@/lib/analyzer/format";
import type { Inventory } from "@/lib/analyzer/items";
import type { ObjectiveKind } from "@/lib/analyzer/objectives";
import type { PlayerMoment, Scoreboard, TeamMoment } from "@/lib/analyzer/replay";
import { formatThousands } from "@/lib/match-summary";

export type ReplayPerson = {
  participantId: number;
  teamId: number;
  name: string; // champion display name
  iconUrl: string | null; // null when Data Dragon couldn't be reached
  tag: "You" | "Opponent" | null;
};

export type ItemInfo = { name: string; iconUrl: string };

// Objectives in the order a team's line lists them, with the word for one.
const TAKEN: [ObjectiveKind, string][] = [
  ["tower", "tower"],
  ["inhibitor", "inhibitor"],
  ["dragon", "dragon"],
  ["elder", "Elder"],
  ["grubs", "grub"],
  ["herald", "Herald"],
  ["baron", "Baron"],
  ["atakhan", "Atakhan"],
];

type RowProps = {
  person: ReplayPerson;
  now: PlayerMoment;
  t: number;
  // Null when the game's items can't be rebuilt.
  items: Record<number, ItemInfo> | null;
};

export function ReplayScoreboard({
  board,
  t,
  people,
  items,
  myTeamId,
  winningTeamId,
}: {
  board: Scoreboard;
  t: number;
  // Your team first, each team in role order.
  people: ReplayPerson[];
  items: Record<number, ItemInfo>;
  myTeamId: number;
  winningTeamId: number;
}) {
  const ours = board.teams.find((team) => team.teamId === myTeamId);
  const theirs = board.teams.find((team) => team.teamId !== myTeamId);
  if (!ours || !theirs) return null;
  const gold = formatGap(ours.gold, theirs.gold);
  const moment = (id: number) => board.players.find((p) => p.participantId === id)!;
  const showItems = board.players.every((p) => p.items !== null);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[32px] leading-none text-ink">{formatClock(t)}</span>
        <span className="text-body text-muted">
          {gold.tone === "even" ? (
            "Gold even"
          ) : (
            <>
              Your team <Gap you={ours.gold} them={theirs.gold} /> in gold
            </>
          )}
          , {ours.kills} {ours.kills === 1 ? "kill" : "kills"} to {theirs.kills}
        </span>
      </div>

      {/* Side by side when both tables fit, one above the other otherwise.
          Each team takes two rows of the grid, its heading and its table,
          so side by side the tables line up even when one heading wraps. */}
      <div className="grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(520px,1fr))]">
        {[ours, theirs].map((team) => {
          const headingId = `replay-team-${team.teamId}`;
          const won = team.teamId === winningTeamId;
          const rows = people
            .filter((person) => person.teamId === team.teamId)
            .map((person) => ({
              person,
              now: moment(person.participantId),
              t,
              items: showItems ? items : null,
            }));
          return (
            <div key={team.teamId} className="row-span-2 grid min-w-0 grid-rows-subgrid gap-2">
              <h3 id={headingId} className="flex flex-wrap items-baseline gap-x-2.5">
                <span
                  className={`font-display text-lg font-bold uppercase tracking-[0.04em] ${
                    won ? "text-ahead" : "text-behind"
                  }`}
                >
                  {team.teamId === myTeamId ? "Your team" : "Enemy team"} ·{" "}
                  {won ? "Victory" : "Defeat"}
                </span>
                <span className="font-mono text-note text-muted">{teamLine(team)}</span>
              </h3>

              <table
                aria-labelledby={headingId}
                className="w-full table-fixed border-collapse text-sm max-sm:hidden"
              >
                <thead>
                  <tr className="text-left font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
                    <th scope="col" className="py-1.5 pl-2 pr-2 font-medium">
                      Player
                    </th>
                    <th scope="col" className="w-[100px] px-1.5 py-1.5 font-medium">
                      KDA
                    </th>
                    <th scope="col" className="w-[44px] px-1.5 py-1.5 font-medium">
                      CS
                    </th>
                    <th scope="col" className="w-[56px] px-1.5 py-1.5 font-medium">
                      Gold
                    </th>
                    {showItems && (
                      <th scope="col" className="w-[176px] py-1.5 pl-1.5 pr-2 font-medium">
                        Items
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <TableRow key={row.person.participantId} {...row} />
                  ))}
                </tbody>
              </table>

              <ul aria-labelledby={headingId} className="text-sm sm:hidden">
                {rows.map((row) => (
                  <PhoneRow key={row.person.participantId} {...row} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {!showItems && (
        <p className="text-note text-faint">
          This game was saved before Turnpoint kept item sales and used-up items, and Riot
          couldn&apos;t be reached to fetch it again, so items aren&apos;t shown. Reloading the page
          tries again.
        </p>
      )}
    </div>
  );
}

// "8 kills · 15.2k gold · 2 towers · 1 dragon"
function teamLine(team: TeamMoment): string {
  const parts = [plural(team.kills, "kill"), `${formatThousands(team.gold)} gold`];
  for (const [kind, word] of TAKEN) {
    const count = team.taken[kind];
    if (count) parts.push(plural(count, word));
  }
  return parts.join(" · ");
}

// Outlines instead of a tint, so they don't clash with the team colors:
// solid for you, dashed for your opponent.
function outline(tag: ReplayPerson["tag"]): string {
  if (tag === "You") return "outline -outline-offset-1 outline-ink";
  if (tag === "Opponent") return "outline outline-dashed -outline-offset-1 outline-faint";
  return "";
}

function TableRow({ person, now, t, items }: RowProps) {
  return (
    <tr className={`border-t border-line ${outline(person.tag)}`}>
      <th scope="row" className="py-1.5 pl-2 pr-2 text-left font-normal">
        <div className="flex items-center gap-2.5">
          <ChampionPicture person={person} now={now} />
          <div className="min-w-0">
            <NameAndTag person={person} />
            <DeadNote now={now} t={t} />
          </div>
        </div>
      </th>
      <td className="whitespace-nowrap px-1.5 py-1.5 font-mono">
        {now.kills} / {now.deaths} / {now.assists}
      </td>
      <td className="px-1.5 py-1.5 font-mono">{now.cs}</td>
      <td className="px-1.5 py-1.5 font-mono">{formatThousands(now.gold)}</td>
      {items && now.items && (
        <td className="py-1.5 pl-1.5 pr-2">
          <ItemRow inventory={now.items} items={items} />
        </td>
      )}
    </tr>
  );
}

// The same as a table row, on two or three lines: name and K/D/A, then CS
// and gold with the words written out (there are no column headings), then
// items.
function PhoneRow({ person, now, t, items }: RowProps) {
  return (
    <li className={`flex gap-2.5 border-t border-line px-2 py-2 ${outline(person.tag)}`}>
      <ChampionPicture person={person} now={now} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <NameAndTag person={person} />
          <span className="whitespace-nowrap font-mono">
            <span className="sr-only">Kills, deaths and assists: </span>
            {now.kills} / {now.deaths} / {now.assists}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-x-2 font-mono text-note text-muted">
          <DeadNote now={now} t={t} />
          <span className="ml-auto whitespace-nowrap">
            {now.cs} CS · {formatThousands(now.gold)} gold
          </span>
        </div>
        {items && now.items && <ItemRow inventory={now.items} items={items} />}
      </div>
    </li>
  );
}

// The champion's picture with their level in the corner, faded while
// they're dead.
function ChampionPicture({ person, now }: { person: ReplayPerson; now: PlayerMoment }) {
  return (
    <span className="relative shrink-0 self-start">
      <Picture
        src={person.iconUrl}
        alt=""
        size={30}
        className={`rounded-[8px] ${now.respawnAt !== null ? "opacity-40 grayscale" : ""}`}
      />
      <span className="absolute -bottom-1 -right-1.5 rounded-full border border-line-strong bg-page px-1 font-mono text-[10px] leading-[14px] text-ink-soft">
        <span className="sr-only">Level </span>
        {now.level}
      </span>
    </span>
  );
}

// The tag drops under the name when both don't fit on one line.
function NameAndTag({ person }: { person: ReplayPerson }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="font-semibold">{person.name}</span>
      {person.tag && (
        <span
          className={`rounded-full border px-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft ${
            person.tag === "You" ? "border-ink-soft" : "border-dashed border-faint"
          }`}
        >
          {person.tag}
        </span>
      )}
    </div>
  );
}

function DeadNote({ now, t }: { now: PlayerMoment; t: number }) {
  if (now.respawnAt === null) return null;
  // Rounded up, so it never says "back in 0:00" while they're still dead.
  const left = Math.ceil((now.respawnAt - t) / 1000) * 1000;
  return <div className="font-mono text-label text-faint">Dead, back in {formatClock(left)}</div>;
}

// Six item slots and the trinket, drawn round like in the game.
function ItemRow({ inventory, items }: { inventory: Inventory; items: Record<number, ItemInfo> }) {
  return (
    <div role="group" aria-label="Items" className="flex gap-[3px]">
      {inventory.slots.map((id, slot) => (
        // Two of the same item can share an id, so key by slot.
        <ItemSlot key={slot} info={items[id]} />
      ))}
      <ItemSlot info={items[inventory.trinket]} className="ml-1 rounded-full" />
    </div>
  );
}

function ItemSlot({ info, className = "rounded-[5px]" }: { info?: ItemInfo; className?: string }) {
  // Items have no text beside them, so the name is the alt text, and
  // `title` shows it as a tooltip on hover.
  return (
    <Picture
      src={info?.iconUrl ?? null}
      alt={info?.name ?? ""}
      title={info?.name}
      size={20}
      className={className}
    />
  );
}

// A Data Dragon image, or an empty box of the same size when there's none
// (an empty slot, or Data Dragon couldn't be reached), so rows don't jump.
function Picture({
  src,
  alt,
  title,
  size,
  className,
}: {
  src: string | null;
  alt: string;
  title?: string;
  size: number;
  className: string;
}) {
  if (!src) {
    return (
      <span style={{ width: size, height: size }} className={`block shrink-0 bg-line ${className}`} />
    );
  }
  // `unoptimized` because Data Dragon already serves small PNGs from a fast
  // CDN, like the other game images (src/components/game-icons.tsx).
  return (
    <Image
      src={src}
      alt={alt}
      title={title}
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 bg-line ${className}`}
    />
  );
}
