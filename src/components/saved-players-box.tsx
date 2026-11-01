"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toSlug } from "@/lib/riot-id";
import {
  addRecentPlayer,
  hasPlayer,
  MAX_PINNED_PLAYERS,
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

const NO_DETAILS: SavedPlayerDetails = { ranks: {}, you: null };

// Any failure just means dashes and no "You" row: the lists still work.
async function fetchDetails(players: SavedPlayer[]): Promise<SavedPlayerDetails> {
  try {
    const response = await fetch("/api/saved-players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(players),
    });
    return response.ok ? ((await response.json()) as SavedPlayerDetails) : NO_DETAILS;
  } catch {
    return NO_DETAILS;
  }
}

// This browser's two lists, plus what the server knows about them. The server
// is asked only once the box is `wanted`, so a page view costs no query, and
// again only when the set of players changes. A signed-in player's own row
// comes from the same answer, so it opens the box even with nothing saved.
export function useSavedPlayersBox(wanted: boolean) {
  const recent = useSavedPlayers(RECENT_PLAYERS_KEY);
  const pinned = useSavedPlayers(PINNED_PLAYERS_KEY);
  const everyone = useMemo(() => {
    const byKey = new Map([...recent, ...pinned].map((p) => [savedPlayerKey(p), p]));
    return [...byKey.values()];
  }, [recent, pinned]);
  const listKey = everyone.map(savedPlayerKey).sort().join("|");

  const [details, setDetails] = useState<(SavedPlayerDetails & { listKey: string }) | null>(null);
  const fetchedKey = details?.listKey;
  useEffect(() => {
    if (!wanted || fetchedKey === listKey) return;
    let current = true;
    fetchDetails(everyone).then((found) => {
      if (current) setDetails({ ...found, listKey });
    });
    return () => {
      current = false;
    };
  }, [wanted, listKey, fetchedKey, everyone]);

  const you = details?.you ?? null;
  return {
    recent,
    pinned,
    you,
    ranks: details?.ranks ?? null,
    hasAny: you !== null || everyone.length > 0,
  };
}

const TABS = [
  { id: "recent", label: "Recent", empty: "Players you look up show here." },
  { id: "pinned", label: "Pinned", empty: "Star a player to keep them here." },
] as const;

type Saved = ReturnType<typeof useSavedPlayersBox>;

// The box that opens under a search, like deeplol's: the signed-in player's
// own row on top, then Recent and Pinned tabs. Typing narrows the rows.
export function SavedPlayersBox({
  saved,
  query,
  onPick,
  onRemove,
}: {
  saved: Saved;
  query: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("recent");
  const { recent, pinned, you, ranks } = saved;
  const current = TABS.find((t) => t.id === tab)!;
  const listKey = tab === "recent" ? RECENT_PLAYERS_KEY : PINNED_PLAYERS_KEY;

  const typed = query.trim().toLowerCase();
  const matches = (p: SavedPlayer) => `${p.gameName}#${p.tagLine}`.toLowerCase().includes(typed);
  const rows = (tab === "recent" ? recent : pinned).filter(matches);
  const rankOf = (p: SavedPlayer) => (ranks ? (ranks[savedPlayerKey(p)] ?? null) : "loading");

  return (
    <div
      // Clicking inside keeps the cursor in the search box, so the box doesn't
      // close under the mouse before the click lands.
      onMouseDown={(event) => event.preventDefault()}
      className="overflow-hidden rounded-b-md bg-panel shadow-lg outline-1 outline-divider"
    >
      {you && matches(you) && (
        <ul className="border-b border-divider">
          <PlayerRow player={you} rank={rankOf(you)} you onPick={onPick} />
        </ul>
      )}
      <div role="tablist" aria-label="Saved players" className="grid grid-cols-2 border-b border-divider">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px h-11 border-b-2 text-sm lg:h-10 ${
              tab === t.id ? "border-main font-semibold text-main" : `border-transparent font-medium text-quiet ${hoverFade}`
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-normal text-quiet tabular-nums">
              {(t.id === "recent" ? recent : pinned).length}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={current.label}>
        {rows.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto py-1">
            {rows.map((p) => (
              <PlayerRow
                key={savedPlayerKey(p)}
                player={p}
                rank={rankOf(p)}
                onPick={() => {
                  // Picking a recent player moves them back to the top.
                  if (tab === "recent") {
                    updateSavedPlayers(RECENT_PLAYERS_KEY, (list) => addRecentPlayer(list, p));
                  }
                  onPick();
                }}
                pinned={hasPlayer(pinned, p)}
                pinsFull={pinned.length >= MAX_PINNED_PLAYERS}
                onPin={() => updateSavedPlayers(PINNED_PLAYERS_KEY, (list) => togglePinnedPlayer(list, p))}
                removeLabel={`from ${current.label.toLowerCase()} players`}
                onRemove={() => {
                  updateSavedPlayers(listKey, (list) => removePlayer(list, p));
                  onRemove();
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-quiet">{typed ? "No saved player matches." : current.empty}</p>
        )}
      </div>
    </div>
  );
}

const rowButton = `grid size-11 shrink-0 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-50 lg:size-9 ${hoverFade}`;

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
  onPin?: () => void;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  const riotId = `${p.gameName}#${p.tagLine}`;
  return (
    <li className={`flex h-11 items-center gap-1 pr-1 ${hoverFade}`}>
      <Link
        href={`/player/${p.region}/${toSlug(p)}`}
        onClick={onPick}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 sm:pl-4"
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
        // Where the star and × would be, so the region lines up with the rows below.
        <span aria-hidden="true" className="flex gap-1">
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
