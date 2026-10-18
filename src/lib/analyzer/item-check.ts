// The item check (docs/replay.md): how well itemHistory rebuilds the items
// each player ends the game with. Riot lists every player's final items in
// the match (item0 to item5, and item6 for the trinket), so playing a game's
// item events back to the end should give the same items.
// scripts/check-items.ts runs it on games saved with
// `npm run tempo-games -- --items`.

import type { Match, Participant, Timeline } from "@/lib/riot/types";
import { finalItems, inventoryAt, itemHistory, QUEST_ITEMS, type FinalItems } from "./items";
import { trimTimeline } from "./trim";

export const ITEM_CHECK_FOLDER = ".cache/item-check";

type CheckedPlayer = Pick<
  Participant,
  "participantId" | "championName" | "teamPosition" | "roleBoundItem"
> &
  FinalItems;

// A game as the check keeps it: the whole timeline, and each player's
// champion, role and final items, the role quest's slot included. Like the
// tempo study's games, it leaves out who played: no Riot IDs or PUUIDs.
export type ItemCheckGame = {
  match: { metadata: { matchId: string }; info: { participants: CheckedPlayer[] } };
  timeline: Timeline;
};

export function toItemCheckGame(match: Match, timeline: Timeline): ItemCheckGame {
  return {
    match: {
      metadata: { matchId: match.metadata.matchId },
      info: {
        participants: match.info.participants.map((p) => {
          const [item0, item1, item2, item3, item4, item5, item6] = finalItems(p);
          return {
            participantId: p.participantId,
            championName: p.championName,
            teamPosition: p.teamPosition,
            item0,
            item1,
            item2,
            item3,
            item4,
            item5,
            item6,
            roleBoundItem: p.roleBoundItem,
          };
        }),
      },
    },
    timeline: {
      metadata: { matchId: timeline.metadata.matchId },
      info: { frameInterval: timeline.info.frameInterval, frames: timeline.info.frames },
    },
  };
}

export type ItemCheck = {
  participantId: number;
  championName: string;
  // Items Riot lists at the end that the rebuild doesn't have, and the
  // other way round. Slots don't count: Riot doesn't log which slot an item
  // went in, so the rebuild can't know.
  missing: number[];
  extra: number[];
  trinket: { riot: number; rebuilt: number };
  // The slot the role quest adds, which Riot lists apart from the other
  // items (undefined for games from before Riot listed it). 0 for empty,
  // which is when Riot lists the quest's hidden item there.
  roleItem: { riot: number | undefined; rebuilt: number };
  // When the rebuild first held more than six items, which the game doesn't
  // allow, so it missed an item leaving, and what they were. Null if it
  // never did.
  tooMany: { at: number; slots: number[] } | null;
};

export function checkItems(game: ItemCheckGame): ItemCheck[] {
  const { events } = trimTimeline(game.timeline);
  return game.match.info.participants.map((p) => {
    const final = finalItems(p);
    const history = itemHistory(events, p.participantId, {
      finalItems: final,
      champion: p.championName,
    });
    const rebuilt = inventoryAt(history, Infinity);
    const crowded = history.find((change) => change.slots.length > 6);
    const riot = final.slice(0, 6).filter((id) => id > 0);
    const ours = rebuilt.slots.filter((id) => id > 0);
    return {
      participantId: p.participantId,
      championName: p.championName,
      missing: without(riot, ours),
      extra: without(ours, riot),
      trinket: { riot: final[6], rebuilt: rebuilt.trinket },
      roleItem: { riot: roleSlot(p.roleBoundItem), rebuilt: rebuilt.roleItem },
      tooMany: crowded ? { at: crowded.from, slots: crowded.slots } : null,
    };
  });
}

// Riot lists the quest's hidden item in the role quest's slot when nothing
// else is there, which the rebuild counts as empty.
function roleSlot(item: number | undefined): number | undefined {
  return item !== undefined && QUEST_ITEMS.has(item) ? 0 : item;
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
