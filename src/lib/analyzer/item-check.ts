// The item check (docs/replay.md): how well itemHistory rebuilds the items
// each player ends the game with. Riot lists every player's final items in
// the match (item0 to item5, and item6 for the trinket), so playing a game's
// item events back to the end should give the same items.
// scripts/check-items.ts runs it on games saved with
// `npm run tempo-games -- --raw`.

import type { Match } from "@/lib/riot/types";
import { finalItems, inventoryAt, itemHistory } from "./items";
import type { TrimmedTimeline } from "./trim";

export const ITEM_CHECK_FOLDER = ".cache/item-check";

export type ItemCheck = {
  participantId: number;
  championName: string;
  // Items Riot lists at the end that the rebuild doesn't have, and the
  // other way round. Slots don't count: Riot doesn't log which slot an item
  // went in, so the rebuild can't know.
  missing: number[];
  extra: number[];
  trinket: { riot: number; rebuilt: number };
};

export function checkItems(match: Match, timeline: TrimmedTimeline): ItemCheck[] {
  return match.info.participants.map((p) => {
    const final = finalItems(p);
    const rebuilt = inventoryAt(itemHistory(timeline.events, p.participantId, final), Infinity);
    const riot = final.slice(0, 6).filter((id) => id > 0);
    const ours = rebuilt.slots.filter((id) => id > 0);
    return {
      participantId: p.participantId,
      championName: p.championName,
      missing: without(riot, ours),
      extra: without(ours, riot),
      trinket: { riot: final[6], rebuilt: rebuilt.trinket },
    };
  });
}

// What's left of `a` after taking out one of it for each id in `b`, so two
// of an item against one leaves one.
function without(a: number[], b: number[]): number[] {
  const rest = [...b];
  return a.filter((id) => {
    const i = rest.indexOf(id);
    if (i === -1) return true;
    rest.splice(i, 1);
    return false;
  });
}
