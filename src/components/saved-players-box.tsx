"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toSlug } from "@/lib/riot-id";
import {
  addRecentPlayer,
  hasPlayer,
  MAX_PINNED_PLAYERS,
  parseSavedPlayerDetails,
  PINNED_PLAYERS_KEY,
  RECENT_PLAYERS_KEY,
  removePlayer,
  savedPlayerKey,
  togglePinnedPlayer,
  type SavedPlayer,
  type SavedPlayerDetails,
} from "@/lib/saved-players";
import { hoverFade } from "./header-style";
import { CloseIcon, StarIcon } from "./icons";
import { RankBadge } from "./rank-badge";
import { updateSavedPlayers, useSavedPlayers } from "./saved-players";

// Null for any failure, an answer that isn't the expected shape included, so
// the box keeps what it has and asks again next time.
export async function fetchDetails(players: SavedPlayer[]): Promise<SavedPlayerDetails | null> {
  try {
    const response = await fetch("/api/saved-players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(players),
    });
    return response.ok ? parseSavedPlayerDetails(await response.json()) : null;
  } catch {
    return null;
  }
}

// This browser's two lists, plus what the server knows about them. The server
// is asked only once the box is `wanted`, so a page view costs no query, then
// on every opening after that, so a new rank or a new "This is me" shows up,
// and whenever a list changes while the box is open, such as after a pin. The
// last answer stays on screen until the next one lands. A signed-in player's own
// row comes from the same answer, so it opens the box even with nothing saved.
export function useSavedPlayersBox(wanted: boolean) {
  const recent = useSavedPlayers(RECENT_PLAYERS_KEY);
  const pinned = useSavedPlayers(PINNED_PLAYERS_KEY);

  const [details, setDetails] = useState<SavedPlayerDetails | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    // A player on both lists is asked about once.
    fetchDetails([...recent, ...pinned.filter((p) => !hasPlayer(recent, p))]).then((found) => {
      if (current && found) setDetails(found);
    });
    return () => {
      current = false;
    };
  }, [wanted, recent, pinned]);

  const you = details?.you ?? null;
  return {
    recent,
    pinned,
    you,
    ranks: details?.ranks ?? {},
    hasAny: you !== null || recent.length > 0 || pinned.length > 0,
  };
}

type Saved = ReturnType<typeof useSavedPlayersBox>;

// Focus rings sit inside each control here: the box clips anything past its
// edges, and a ring outside a row would be cut off.
const insetRing = "focus-visible:-outline-offset-3";

// The box that opens under a search, like deeplol's: the signed-in player's
// own row on top, then Recent and Pinned tabs. Typing narrows the rows.
export function SavedPlayersBox({
  saved,
  query,
  onPick,
  onRowGone,
}: {
  saved: Saved;
  query: string;
  onPick: () => void;
  onRowGone: () => void;
}) {
  const { recent, pinned, you, ranks } = saved;
  const tabs = [
    { id: "recent", label: "Recent", players: recent, storageKey: RECENT_PLAYERS_KEY, empty: "Players you look up show here." },
    { id: "pinned", label: "Pinned", players: pinned, storageKey: PINNED_PLAYERS_KEY, empty: "Star a player to keep them here." },
  ] as const;
  // Starts on whichever list has someone on it.
  const [chosenId, setChosenId] = useState(recent.length === 0 && pinned.length > 0 ? "pinned" : "recent");
  const chosen = tabs.find((t) => t.id === chosenId)!;
  const other = tabs.find((t) => t.id !== chosenId)!;

  const typed = query.trim().toLowerCase();
  const matches = (p: SavedPlayer) => `${p.gameName}#${p.tagLine}`.toLowerCase().includes(typed);
  // A name that's only on the other tab shows there. Clicking a tab beats that
  // until the typing changes, so a click is forgotten as soon as it does.
  const [clickedWhileTyping, setClickedWhileTyping] = useState<string | null>(null);
  if (clickedWhileTyping !== null && clickedWhileTyping !== typed) setClickedWhileTyping(null);
  const nameIsOnOtherTab = !chosen.players.some(matches) && other.players.some(matches);
  const fallsThrough = typed && clickedWhileTyping === null && nameIsOnOtherTab;
  const tab = fallsThrough ? other : chosen;
  // A button holding focus loses it along with its row, and Escape stops working,
  // so hand it back. Not after a tap, which never focuses the button: focusing
  // the search then would open a phone's keyboard.
  const rowGone = (event: React.MouseEvent) => {
    if (event.currentTarget === document.activeElement) onRowGone();
  };
  const rows = tab.players.filter(matches);

  return (
    <div
      // Clicking inside keeps the cursor in the search box, so the box doesn't
      // close under the mouse before the click lands.
      onMouseDown={(event) => event.preventDefault()}
      className="overflow-hidden rounded-b-md bg-panel shadow-lg outline-1 outline-divider"
    >
      {you && matches(you) && (
        <ul className="border-b border-divider">
          <PlayerRow player={you} rank={ranks[savedPlayerKey(you)]} you onPick={onPick} />
        </ul>
      )}
      <div role="tablist" aria-label="Saved players" className="grid grid-cols-2 border-b border-divider">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab.id === t.id}
            onClick={() => {
              setChosenId(t.id);
              setClickedWhileTyping(typed);
            }}
            className={`-mb-px h-11 border-b-2 text-sm lg:h-10 ${insetRing} ${
              tab.id === t.id ? "border-main font-semibold text-main" : `border-transparent font-medium text-quiet ${hoverFade}`
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-normal text-quiet tabular-nums">{t.players.length}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab.label}>
        {rows.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto py-1">
            {rows.map((p) => (
              <PlayerRow
                key={savedPlayerKey(p)}
                player={p}
                rank={ranks[savedPlayerKey(p)]}
                onPick={() => {
                  // Picking a recent player moves them back to the top.
                  if (tab.id === "recent") {
                    updateSavedPlayers(RECENT_PLAYERS_KEY, (list) => addRecentPlayer(list, p));
                  }
                  onPick();
                }}
                pinned={hasPlayer(pinned, p)}
                pinsFull={pinned.length >= MAX_PINNED_PLAYERS}
                onPin={(event) => {
                  updateSavedPlayers(PINNED_PLAYERS_KEY, (list) => togglePinnedPlayer(list, p));
                  // On Pinned, unpinning takes the row away.
                  if (tab.id === "pinned") rowGone(event);
                }}
                removeLabel={`from ${tab.label.toLowerCase()} players`}
                onRemove={(event) => {
                  updateSavedPlayers(tab.storageKey, (list) => removePlayer(list, p));
                  rowGone(event);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-quiet">{!typed ? tab.empty : nameIsOnOtherTab ? `No one on ${tab.label} matches.` : "No saved player matches."}</p>
        )}
      </div>
    </div>
  );
}

const rowButton = `grid size-11 shrink-0 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-50 lg:size-9 ${insetRing} ${hoverFade}`;

// One player: the badge, Riot ID and region link to their profile. The player's
// own row has no star or ×, since it isn't on either list.
function PlayerRow({
  player: p,
  rank,
  you = false,
  onPick,
  pinned = false,
  pinsFull = false,
  onPin,
  removeLabel,
  onRemove,
}: {
  player: SavedPlayer;
  rank: React.ComponentProps<typeof RankBadge>["rank"];
  you?: boolean;
  onPick: () => void;
  pinned?: boolean;
  pinsFull?: boolean;
  onPin?: (event: React.MouseEvent) => void;
  removeLabel?: string;
  onRemove?: (event: React.MouseEvent) => void;
}) {
  const riotId = `${p.gameName}#${p.tagLine}`;
  return (
    <li className={`flex h-11 items-center gap-1 pr-1 ${hoverFade}`}>
      <Link
        href={`/player/${p.region}/${toSlug(p)}`}
        onClick={onPick}
        className={`flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 sm:pl-4 ${insetRing}`}
      >
        <RankBadge rank={rank} />
        <span className="flex min-w-0 text-body">
          <span className="truncate text-main">{p.gameName}</span>
          <span className="shrink-0 text-quiet">#{p.tagLine}</span>
        </span>
        {you && <span className="shrink-0 text-note font-semibold text-ahead">You</span>}
        <span className="ml-auto shrink-0 pl-1 text-xs font-medium text-quiet">{p.region.toUpperCase()}</span>
      </Link>
      {you && (
        // Where the star and × would be, so the region lines up with the rows
        // below. A phone needs that room for the name.
        <span aria-hidden="true" className="hidden gap-1 sm:flex">
          <span className="size-11 lg:size-9" />
          <span className="size-11 lg:size-9" />
        </span>
      )}
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          disabled={!pinned && pinsFull}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${riotId}` : `Pin ${riotId}`}
          title={!pinned && pinsFull ? `You can pin up to ${MAX_PINNED_PLAYERS} players` : undefined}
          className={`${rowButton} ${pinned ? "text-main" : "text-quiet"}`}
        >
          <StarIcon size={16} filled={pinned} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${riotId} ${removeLabel}`}
          className={`${rowButton} text-quiet`}
        >
          <CloseIcon size={14} />
        </button>
      )}
    </li>
  );
}
