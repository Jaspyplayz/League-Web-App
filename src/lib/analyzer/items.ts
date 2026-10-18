// Each player's items at every moment of the game, for the replay's
// scoreboard. Riot logs every item a player buys, sells or undoes, and every
// item that leaves their inventory another way (a component used up by an
// item built from it, a potion drunk), each to the millisecond. Playing those
// events back in order rebuilds the inventory at any moment.
//
// Some items come, go or change without a purchase in the log, so they have
// rules of their own below: free items (the starting trinket, the support
// item, Magical Footwear's boots), items that upgrade themselves (tier 3
// boots, Muramana and the like), the Eye of the Herald, the slot each role's
// quest adds, and Viego. scripts/check-items.ts checks the rules against the
// items Riot lists at the end of real games (docs/replay.md).
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

// Picking up the Eye of the Herald puts it in the trinket slot until it's
// used. Riot logs the trinket leaving and the Eye leaving, but neither one
// arriving.
const EYE_OF_THE_HERALD = 3513;

// Items that stack in one slot: Health Potion, Control Ward, and the
// biscuits from the Biscuit Delivery rune.
const CONTROL_WARD = 2055;
const STACKS = new Set([2003, 2010, CONTROL_WARD]);

// The support item. Supports start with World Atlas, which the log doesn't
// show them buying. It turns into Runic Compass, then Bounty of Worlds, then
// the upgrade the player picks: Celestial Opposition, Dream Maker, Zaz'Zak's
// Realmspike, Solstice Sleigh or Bloodsong.
const WORLD_ATLAS = 3865;
const BOUNTY_OF_WORLDS = 3867;
const SUPPORT_UPGRADES = new Set([3869, 3870, 3871, 3876, 3877]);

// The free boots from the Magical Footwear rune, which arrive by 12:00.
const MAGICAL_FOOTWEAR = 2422;
const MAGICAL_FOOTWEAR_MS = 12 * 60_000;

// Items that turn into another without a purchase: the support item's steps;
// tier 2 boots into tier 3 (Riot upgrades them for free, for example for
// finishing the mid lane role quest); Stopwatch into Broken Stopwatch once
// used; and Archangel's Staff, Manamune and Winter's Approach once charged.
// Riot logs the old item leaving and nothing else.
const TURNS_INTO: Record<number, number> = {
  [WORLD_ATLAS]: 3866,
  3866: BOUNTY_OF_WORLDS,
  3006: 3172, // Berserker's Greaves into Gunmetal Greaves
  3008: 3168,
  3009: 3170, // Boots of Swiftness into Swiftmarch
  3020: 3175, // Sorcerer's Shoes into Spellslinger's Shoes
  3047: 3174, // Plated Steelcaps into Armored Advance
  3111: 3173, // Mercury's Treads into Chainlaced Crushers
  3158: 3171, // Ionian Boots of Lucidity into Crimson Lucidity
  2420: 2421, // Stopwatch into Broken Stopwatch
  3003: 3040, // Archangel's Staff into Seraph's Embrace
  3004: 3042, // Manamune into Muramana
  3119: 3121, // Winter's Approach into Fimbulwinter
};

// Each role's quest is tracked with a hidden item that's never bought, kept
// in a slot of the role's own: 1200 to 1204 while the quest is under way
// (top, mid, bot lane, support, jungle), then another one once it's done
// (1207 to 1209 for bot lane, support and jungle in the check's games).
// Riot logs the hidden item leaving whenever something else goes in that
// slot:
// - A bot laner's boots, once their quest is done. Boots bought later go
//   there too.
// - A support's control wards, all game long. Riot logs each ward that goes
//   there as bought and leaving at once, with the hidden item.
const QUEST_ITEMS = new Set([1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209]);
const BOT_LANE_QUEST = 1202;
const SUPPORT_QUEST = new Set([1203, 1208]);
const BOOTS = new Set([
  1001, MAGICAL_FOOTWEAR, 3006, 3008, 3009, 3020, 3047, 3111, 3158, 3168, 3170, 3171, 3172, 3173,
  3174, 3175,
]);

// Viego possessing an enemy logs every item he holds leaving at once (his
// quest's hidden item too), and going back to himself logs every item the
// enemy held leaving. Neither changes his own items.
const VIEGO = "Viego";

export type Inventory = {
  // Item ids by slot, 0 for an empty slot, like Riot's item0 to item5.
  slots: number[];
  trinket: number; // 0 for none
  // The item in the slot the player's role quest adds (see QUEST_ITEMS): a
  // bot laner's boots or a support's control wards. 0 when empty.
  roleItem: number;
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

// A purchase or sale, so undoing it can put things back. For a purchase,
// what it used up and the trinket it replaced: Riot logs components leaving
// when an item is built from them, but not coming back when the purchase is
// undone.
type Undoable = {
  kind: "bought" | "sold";
  itemId: number;
  usedUp: number[];
  trinketBefore: number | null;
};

type Options = {
  // The items Riot lists for the player at the end (item0 to item6). They
  // tell which trinket a player kept all game, which support upgrade they
  // picked, and whether free items they never used up were there.
  finalItems?: number[];
  // The player's champion, for Viego.
  champion?: string;
};

// Every change to one player's items, in order. The first entry is what they
// start the game with.
export function itemHistory(
  events: TrimmedEvent[],
  participantId: number,
  { finalItems = [], champion = "" }: Options = {},
): ItemChange[] {
  let logged = events.filter(
    (e): e is ItemEvent => isItemEvent(e) && e.participantId === participantId,
  );
  if (champion === VIEGO) logged = withoutPossessions(logged);
  const mine = [...freeItems(logged, finalItems), ...logged].sort(
    (a, b) => a.timestamp - b.timestamp || leavingFirst(a) - leavingFirst(b),
  );

  // Each slot holds an item and how many of it are stacked there.
  const slots: { id: number; count: number }[] = [];
  let trinket = 0;
  let setAside = 0; // the trinket the Eye of the Herald replaced
  // The slot the player's role quest adds, and what goes in it: nothing
  // until the quest's hidden item first leaves.
  const role = { id: 0, count: 0 };
  let roleTakes: (id: number) => boolean = () => false;
  // The support upgrade Bounty of Worlds turns into: the one they still had
  // at the end, or else one they sold.
  const upgrade =
    finalItems.find((id) => SUPPORT_UPGRADES.has(id)) ??
    mine.map(itemOf).find((id) => SUPPORT_UPGRADES.has(id)) ??
    0;
  const undoable: Undoable[] = [];

  const give = (id: number) => {
    if (TRINKETS.has(id)) {
      trinket = id;
      return;
    }
    if (roleTakes(id)) {
      role.count = role.id === id ? role.count + 1 : 1;
      role.id = id;
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
  // Returns false when the player didn't have the item, like the role
  // quests' hidden items, which are never bought.
  const take = (id: number): boolean => {
    if (id === trinket && TRINKETS.has(id)) {
      trinket = 0;
      return true;
    }
    if (id === role.id) {
      role.count--;
      if (role.count === 0) role.id = 0;
      return true;
    }
    const slot = slots.find((s) => s.id === id && s.count > 0);
    if (!slot) return false;
    slot.count--;
    if (slot.count === 0) empty(slot);
    return true;
  };
  // Past six items, an emptied slot goes instead of staying empty, so the
  // extra one is only shown for as long as it's there.
  const empty = (slot: { id: number; count: number }) => {
    if (slots.length > ITEM_SLOTS) slots.splice(slots.indexOf(slot), 1);
    else [slot.id, slot.count] = [0, 0];
  };
  // An item turning into another where it is. 0 empties the slot.
  const turnInto = (id: number, next: number): boolean => {
    if (id === role.id) {
      role.id = next;
      return true;
    }
    const slot = slots.find((s) => s.id === id && s.count > 0);
    if (!slot) return false;
    if (next === 0) empty(slot);
    else [slot.id, slot.count] = [next, 1];
    return true;
  };

  const history: ItemChange[] = [{ from: 0, slots: emptySlots(), trinket: 0, roleItem: 0 }];
  for (const group of byMillisecond(mine)) {
    const at = group[0].timestamp;
    // What was bought at this millisecond: an item leaving at the same time
    // was used up building one of them.
    const bought = group.filter((e) => e.type === "ITEM_PURCHASED").map((e) => e.itemId);
    const usedUp: number[] = [];
    // A role quest's hidden item leaving: something is going in its slot.
    const destroyed = group.flatMap((e) => (e.type === "ITEM_DESTROYED" ? [e.itemId] : []));
    const quest = destroyed.find((id) => QUEST_ITEMS.has(id));
    const supportQuest = quest !== undefined && SUPPORT_QUEST.has(quest);
    if (quest === BOT_LANE_QUEST) roleTakes = (id) => BOOTS.has(id);
    if (supportQuest) roleTakes = (id) => id === CONTROL_WARD;

    // An item leaving without being sold. False when the player didn't have
    // it, at least not yet.
    const leave = (id: number): boolean => {
      if (QUEST_ITEMS.has(id)) return true;
      if (id === EYE_OF_THE_HERALD && trinket === EYE_OF_THE_HERALD) {
        trinket = setAside;
        return true;
      }
      if (TRINKETS.has(id) && id === trinket) {
        // When another trinket was bought at the same time, it takes this
        // one's place (and undoing it brings this one back). Otherwise the
        // Eye of the Herald took the slot.
        if (!bought.some((b) => TRINKETS.has(b))) [setAside, trinket] = [id, EYE_OF_THE_HERALD];
        return true;
      }
      // Moving to the role quest's slot: a bot laner's boots, or a support's
      // control ward, which the purchase at the same moment puts there.
      if (quest === BOT_LANE_QUEST && BOOTS.has(id) && take(id)) {
        give(id);
        return true;
      }
      if (supportQuest && id === CONTROL_WARD) {
        if (!bought.includes(id) && take(id)) give(id);
        return true;
      }
      const next = id === BOUNTY_OF_WORLDS ? upgrade : TURNS_INTO[id];
      if (next !== undefined && bought.every((b) => b === id)) return turnInto(id, next);
      if (!take(id)) return false;
      usedUp.push(id);
      return true;
    };

    // Items that leave before the purchase at the same millisecond, then
    // again after it, in case they left right as they were bought: an elixir
    // drunk at once, or boots that turned into tier 3 as they were bought.
    const notYet: number[] = [];
    for (const e of group) {
      switch (e.type) {
        case "ITEM_DESTROYED":
          if (!leave(e.itemId)) notYet.push(e.itemId);
          break;
        case "ITEM_SOLD":
          take(e.itemId);
          undoable.push({ kind: "sold", itemId: e.itemId, usedUp: [], trinketBefore: null });
          break;
        case "ITEM_PURCHASED": {
          const before = trinket;
          give(e.itemId);
          undoable.push({
            kind: "bought",
            itemId: e.itemId,
            usedUp: usedUp.splice(0),
            trinketBefore: TRINKETS.has(e.itemId) ? before : null,
          });
          break;
        }
        case "ITEM_UNDO": {
          // Riot logs an undone purchase as the item before and nothing
          // after. An undone sale, and an undone purchase that replaced
          // another item (a trinket, the support item's upgrade), both come
          // as nothing before and the item after, so then it's whichever of
          // the two happened last.
          const id = e.beforeId || e.afterId;
          const undoesPurchase = e.afterId === 0;
          const i = undoable.findLastIndex(
            (u) => u.itemId === id && (!undoesPurchase || u.kind === "bought"),
          );
          const undone = i === -1 ? null : undoable.splice(i, 1)[0];
          if (undone?.kind === "sold") {
            give(id);
          } else if (undone || undoesPurchase) {
            take(id);
            for (const item of undone?.usedUp ?? []) give(item);
            if (undone && undone.trinketBefore !== null) trinket = undone.trinketBefore;
          }
          break;
        }
      }
    }
    for (const id of notYet) leave(id);

    // Everything at one millisecond (components going into an item) is one
    // change.
    const now: ItemChange = { from: at, slots: currentSlots(slots), trinket, roleItem: role.id };
    const last = history[history.length - 1];
    if (sameInventory(last, now)) continue;
    if (last.from === at) history[history.length - 1] = now;
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

// Viego's events without his possessions (see VIEGO): several items leaving
// at once with nothing bought or sold, which for him is never a real change.
function withoutPossessions(events: ItemEvent[]): ItemEvent[] {
  return byMillisecond(events)
    .filter((group) => group.length === 1 || group.some((e) => e.type !== "ITEM_DESTROYED"))
    .flat();
}

// Items a player gets without a purchase in the log, as purchases at the
// moment they arrive: the trinket everyone starts with (a Stealth Ward, or
// Fiddlesticks' Scarecrow Effigy), World Atlas for supports, and Magical
// Footwear's boots by 12:00. Each shows up in the log when it first leaves,
// or in the final items if it never did.
function freeItems(logged: ItemEvent[], finalItems: number[]): ItemEvent[] {
  const participantId = logged[0]?.participantId ?? 0;
  const firstLeft = (has: (id: number) => boolean): ItemEvent | null => {
    const first = logged.find((e) => has(itemOf(e)));
    return first && leaves(first) ? first : null;
  };
  const neverLogged = (id: number) =>
    !logged.some((e) => itemOf(e) === id) && finalItems.includes(id);
  const free = (itemId: number, timestamp: number): ItemEvent => ({
    type: "ITEM_PURCHASED",
    timestamp,
    participantId,
    itemId,
  });

  const items: ItemEvent[] = [];
  const trinket = firstLeft((id) => TRINKETS.has(id));
  if (trinket) items.push(free(itemOf(trinket), 0));
  else if (!logged.some((e) => TRINKETS.has(itemOf(e))) && TRINKETS.has(finalItems[6])) {
    items.push(free(finalItems[6], 0));
  }
  if (firstLeft((id) => id === WORLD_ATLAS) || neverLogged(WORLD_ATLAS)) {
    items.push(free(WORLD_ATLAS, 0));
  }
  const footwear = firstLeft((id) => id === MAGICAL_FOOTWEAR);
  if (footwear || neverLogged(MAGICAL_FOOTWEAR)) {
    items.push(free(MAGICAL_FOOTWEAR, Math.min(MAGICAL_FOOTWEAR_MS, footwear?.timestamp ?? Infinity)));
  }
  return items;
}

// The item an event is about: for an undone purchase the item bought, for an
// undone sale the item sold.
function itemOf(e: ItemEvent): number {
  return e.type === "ITEM_UNDO" ? e.beforeId || e.afterId : e.itemId;
}

// True when the event takes an item away.
function leaves(e: ItemEvent): boolean {
  return (
    e.type === "ITEM_DESTROYED" ||
    e.type === "ITEM_SOLD" ||
    (e.type === "ITEM_UNDO" && e.beforeId > 0)
  );
}

// Within a millisecond, items leaving go before items arriving: Riot logs
// the components an item used up and the item itself in either order, and
// this way the new item takes a slot they freed.
function leavingFirst(e: ItemEvent): number {
  return e.type === "ITEM_DESTROYED" || e.type === "ITEM_SOLD" ? 0 : 1;
}

// The events grouped by the millisecond they happened at, in order.
function byMillisecond(events: ItemEvent[]): ItemEvent[][] {
  const groups: ItemEvent[][] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last[0].timestamp === e.timestamp) last.push(e);
    else groups.push([e]);
  }
  return groups;
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
    a.roleItem === b.roleItem &&
    a.slots.length === b.slots.length &&
    a.slots.every((id, i) => id === b.slots[i])
  );
}
