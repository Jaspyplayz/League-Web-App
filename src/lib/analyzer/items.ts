// Each player's items at every moment of the game, for the replay's
// scoreboard. Riot logs every item a player buys, sells or undoes, and every
// item that leaves their inventory another way (a component used up by an
// item built from it, a potion drunk), each to the millisecond. Playing those
// events back in order rebuilds the inventory at any moment.
//
// A few items come and go without a purchase in the log, so they have rules
// of their own below: the trinket everyone starts with, and the support item
// and its upgrades. scripts/check-items.ts checks the rules against the items
// Riot lists at the end of real games (docs/replay.md).
//
// Timelines saved before Turnpoint kept sales and used-up items only have
// the purchases, which isn't enough: the components of every finished item
// would still be there. See keepsItemChanges.

import type { Participant } from "@/lib/riot/types";
import type { TrimmedEvent, TrimmedTimeline } from "./trim";

// Six item slots, like the game. Riot doesn't log which slot an item goes
// in, so a new item takes the first empty one, as it does in the game unless
// the player drags it somewhere else.
export const ITEM_SLOTS = 6;

// Trinkets have a slot of their own, so buying one replaces the one before:
// Stealth Ward, Farsight Alteration, Oracle Lens and Fiddlesticks' Scarecrow
// Effigy.
export const TRINKETS = new Set([3330, 3340, 3363, 3364]);

// Items that stack in one slot: Health Potion, Control Ward, and the
// biscuits from the Biscuit Delivery rune.
const STACKS = new Set([2003, 2010, 2055]);

// The support item. Supports start with World Atlas, which the log doesn't
// show them buying. It turns into Runic Compass, then Bounty of Worlds, then
// the upgrade the player picks, and Riot logs the old one leaving but not the
// new one arriving.
const WORLD_ATLAS = 3865;
const BOUNTY_OF_WORLDS = 3867;
const NEXT_SUPPORT_ITEM: Record<number, number> = { [WORLD_ATLAS]: 3866, 3866: BOUNTY_OF_WORLDS };
// Celestial Opposition, Dream Maker, Zaz'Zak's Realmspike, Solstice Sleigh
// and Bloodsong.
const SUPPORT_UPGRADES = new Set([3869, 3870, 3871, 3876, 3877]);

export type Inventory = {
  // Item ids by slot, 0 for an empty slot, like Riot's item0 to item5.
  slots: number[];
  trinket: number; // 0 for none
};

// A player's items from `from` (ms) until the next change.
export type ItemChange = Inventory & { from: number };

const ITEM_FIELDS = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"] as const;
export type FinalItems = Partial<Pick<Participant, (typeof ITEM_FIELDS)[number]>>;

// The items Riot lists for a player at the end of the game, item0 to item6
// (the trinket), the way itemHistory takes them.
export function finalItems(p: FinalItems): number[] {
  return ITEM_FIELDS.map((field) => p[field] ?? 0);
}

// True when the timeline kept item sales and used-up items, so items can be
// rebuilt. Every real game has some: each finished item uses up its
// components.
export function keepsItemChanges({ events }: Pick<TrimmedTimeline, "events">): boolean {
  return events.some((e) => e.type === "ITEM_DESTROYED" || e.type === "ITEM_SOLD");
}

// What one purchase used up, so undoing it can give those back: Riot logs
// components leaving when an item is built from them, but not coming back
// when the purchase is undone.
type Purchase = { itemId: number; at: number; usedUp: number[]; trinketBefore: number | null };

// Every change to one player's items, in order. The first entry is what they
// start the game with. `finalItems` are the items Riot lists for them at the
// end (item0 to item6): they tell which trinket a player kept all game and
// which support upgrade they picked.
export function itemHistory(
  events: TrimmedEvent[],
  participantId: number,
  finalItems: number[] = [],
): ItemChange[] {
  // Riot logs the components an item used up and the item itself at the
  // same millisecond, in either order, so each millisecond's items leaving
  // go first. That way the new item takes a slot they freed.
  const mine = events
    .filter((e): e is ItemEvent => isItemEvent(e) && e.participantId === participantId)
    .sort((a, b) => a.timestamp - b.timestamp || leavingFirst(a) - leavingFirst(b));

  const start = startingItems(mine, finalItems);
  // Each slot holds an item and how many of it are stacked there.
  const slots: { id: number; count: number }[] = start.slots.map((id) => ({ id, count: 1 }));
  let trinket = start.trinket;
  // The support upgrade Bounty of Worlds turns into: the one they still had
  // at the end, or else one they sold.
  const upgrade =
    finalItems.find((id) => SUPPORT_UPGRADES.has(id)) ??
    mine.map(itemOf).find((id) => SUPPORT_UPGRADES.has(id)) ??
    0;
  const purchases: Purchase[] = [];
  // Items used up at one millisecond, in case a purchase at that
  // millisecond was built from them.
  let usedUp: { at: number; ids: number[] } = { at: -1, ids: [] };

  const give = (id: number) => {
    if (TRINKETS.has(id)) {
      trinket = id;
      return;
    }
    const stack = STACKS.has(id) ? slots.find((s) => s.id === id) : undefined;
    if (stack) {
      stack.count++;
      return;
    }
    const empty = slots.findIndex((s) => s.count === 0);
    if (empty !== -1) slots[empty] = { id, count: 1 };
    // Past six items only when the events say so, which the game doesn't
    // allow; then they're shown rather than hidden.
    else slots.push({ id, count: 1 });
  };
  // Returns false when the player didn't have the item, like the biscuits a
  // rune hands out without a purchase.
  const take = (id: number): boolean => {
    if (id === trinket && TRINKETS.has(id)) {
      trinket = 0;
      return true;
    }
    const slot = slots.find((s) => s.id === id && s.count > 0);
    if (!slot) return false;
    slot.count--;
    if (slot.count === 0) slot.id = 0;
    return true;
  };
  // An item turning into another in the same slot. 0 empties the slot.
  const turnInto = (id: number, next: number): boolean => {
    const slot = slots.find((s) => s.id === id && s.count > 0);
    if (!slot) return false;
    slot.id = next;
    slot.count = next === 0 ? 0 : 1;
    return true;
  };

  const history: ItemChange[] = [{ from: 0, slots: currentSlots(slots), trinket }];
  for (const e of mine) {
    switch (e.type) {
      case "ITEM_PURCHASED": {
        const before = trinket;
        give(e.itemId);
        purchases.push({
          itemId: e.itemId,
          at: e.timestamp,
          usedUp: usedUp.at === e.timestamp ? usedUp.ids : [],
          trinketBefore: TRINKETS.has(e.itemId) ? before : null,
        });
        usedUp = { at: -1, ids: [] };
        break;
      }
      case "ITEM_DESTROYED": {
        // The support item leaving is it turning into the next one.
        const next = e.itemId === BOUNTY_OF_WORLDS ? upgrade : NEXT_SUPPORT_ITEM[e.itemId];
        if (next !== undefined) {
          if (!turnInto(e.itemId, next)) continue;
          break;
        }
        if (!take(e.itemId)) continue;
        if (usedUp.at === e.timestamp) usedUp.ids.push(e.itemId);
        else usedUp = { at: e.timestamp, ids: [e.itemId] };
        break;
      }
      case "ITEM_SOLD":
        if (!take(e.itemId)) continue;
        break;
      case "ITEM_UNDO":
        if (e.beforeId > 0 && e.afterId === 0) {
          // Undoing a purchase: the item goes, and what it used up comes back.
          take(e.beforeId);
          const i = purchases.findLastIndex((p) => p.itemId === e.beforeId);
          if (i !== -1) {
            const [undone] = purchases.splice(i, 1);
            for (const id of undone.usedUp) give(id);
            if (undone.trinketBefore !== null) trinket = undone.trinketBefore;
          }
        } else if (e.beforeId === 0 && e.afterId > 0) {
          // Undoing a sale: the item comes back.
          give(e.afterId);
        }
        break;
    }

    const now: ItemChange = { from: e.timestamp, slots: currentSlots(slots), trinket };
    const last = history[history.length - 1];
    if (sameInventory(last, now)) continue;
    // Several changes in the same millisecond (components going into an
    // item) are one change.
    if (last.from === e.timestamp) history[history.length - 1] = now;
    else history.push(now);
  }
  return history;
}

// A player's items at moment t, from their history.
export function inventoryAt(history: ItemChange[], t: number): Inventory {
  return history.findLast((change) => change.from <= t) ?? history[0];
}

type ItemEvent = Extract<
  TrimmedEvent,
  { type: "ITEM_PURCHASED" | "ITEM_SOLD" | "ITEM_DESTROYED" | "ITEM_UNDO" }
>;

// What a player starts with that the log doesn't show them buying: their
// trinket (a Stealth Ward, or Fiddlesticks' Scarecrow Effigy) and, for
// supports, World Atlas. Either shows up in the log when it first leaves, or
// in the final items when it never did.
function startingItems(mine: ItemEvent[], finalItems: number[]): Inventory {
  const firstTrinket = mine.find((e) => TRINKETS.has(itemOf(e)));
  const keptTrinket = TRINKETS.has(finalItems[6]) ? finalItems[6] : 0;
  const trinket = firstTrinket ? (leaves(firstTrinket) ? itemOf(firstTrinket) : 0) : keptTrinket;

  const firstAtlas = mine.find((e) => itemOf(e) === WORLD_ATLAS);
  const atlas = firstAtlas ? leaves(firstAtlas) : finalItems.slice(0, ITEM_SLOTS).includes(WORLD_ATLAS);
  return { slots: atlas ? [WORLD_ATLAS] : [], trinket };
}

// The item an event is about: for an undone purchase the item bought, for an
// undone sale the item sold.
function itemOf(e: ItemEvent): number {
  return e.type === "ITEM_UNDO" ? e.beforeId || e.afterId : e.itemId;
}

// True when the event takes an item away.
function leaves(e: ItemEvent): boolean {
  return e.type === "ITEM_DESTROYED" || e.type === "ITEM_SOLD" || (e.type === "ITEM_UNDO" && e.beforeId > 0);
}

function leavingFirst(e: ItemEvent): number {
  return e.type === "ITEM_DESTROYED" || e.type === "ITEM_SOLD" ? 0 : 1;
}

function isItemEvent(e: TrimmedEvent): e is ItemEvent {
  return (
    e.type === "ITEM_PURCHASED" ||
    e.type === "ITEM_SOLD" ||
    e.type === "ITEM_DESTROYED" ||
    e.type === "ITEM_UNDO"
  );
}

function emptySlots(): number[] {
  return Array<number>(ITEM_SLOTS).fill(0);
}

function currentSlots(slots: { id: number }[]): number[] {
  const ids = slots.map((s) => s.id);
  return ids.length >= ITEM_SLOTS ? ids : [...ids, ...emptySlots()].slice(0, ITEM_SLOTS);
}

function sameInventory(a: Inventory, b: Inventory): boolean {
  return (
    a.trinket === b.trinket &&
    a.slots.length === b.slots.length &&
    a.slots.every((id, i) => id === b.slots[i])
  );
}
