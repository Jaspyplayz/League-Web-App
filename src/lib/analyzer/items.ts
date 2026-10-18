// Each player's items at every moment of the game, for the replay's
// scoreboard. Riot logs every item a player buys, sells or undoes, and every
// item that leaves their inventory another way (a component used up by an
// item built from it, a potion drunk), each to the millisecond. Playing those
// events back in order rebuilds the inventory at any moment.
//
// Some items come, go or change without a purchase in the log, so they have
// rules of their own below: free items (the starting trinket, the support
// item, the boots and biscuits from runes), items that upgrade themselves
// (tier 3 boots, Muramana and the like), the Eye of the Herald, the slot
// each role's quest adds, and Viego. scripts/check-items.ts checks the rules
// against the items Riot lists at the end of real games (docs/replay.md).
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
// Effigy. Everyone starts with a Stealth Ward, or Fiddlesticks with his
// Effigy, which Riot only sometimes logs.
export const TRINKETS = new Set([3330, 3340, 3363, 3364]);
const STEALTH_WARD = 3340;
const SCARECROW_EFFIGY = 3330;
const FIDDLESTICKS = "fiddlesticks"; // Riot spells it FiddleSticks

// Picking up the Eye of the Herald puts it in the trinket slot until it's
// used. Riot logs the trinket leaving and the Eye leaving, but neither one
// arriving.
const EYE_OF_THE_HERALD = 3513;

// Items that stack in one slot: Health Potion, Control Ward, and the
// biscuits from the Biscuit Delivery rune, one every 2 minutes until 6:00,
// which wait for an empty slot when the six are full.
const CONTROL_WARD = 2055;
const BISCUIT = 2010;
const BISCUIT_TIMES = [2 * 60_000, 4 * 60_000, 6 * 60_000];
const STACKS = new Set([2003, BISCUIT, CONTROL_WARD]);

// Nothing is built from these, so one bought at the moment another item
// leaves didn't use that item up: potions, control wards and elixirs.
const CONSUMABLES = new Set([2003, 2031, CONTROL_WARD, 2138, 2139, 2140]);

// The support item. Supports start with World Atlas, which the log doesn't
// show them buying. It turns into Runic Compass, then Bounty of Worlds, then
// the upgrade the player picks: Celestial Opposition, Dream Maker, Zaz'Zak's
// Realmspike, Solstice Sleigh or Bloodsong.
const WORLD_ATLAS = 3865;
const BOUNTY_OF_WORLDS = 3867;
const SUPPORT_UPGRADES = new Set([3869, 3870, 3871, 3876, 3877]);

// The free boots from the Magical Footwear rune, which arrive by 12:00 (45
// seconds sooner for each takedown), and wait for an empty slot when the
// six are full.
const MAGICAL_FOOTWEAR = 2422;
const MAGICAL_FOOTWEAR_MS = 12 * 60_000;
const WAITS_FOR_SLOT = new Set([BISCUIT, MAGICAL_FOOTWEAR]);

// Items that turn into another without a purchase: the support item's steps;
// tier 2 boots into tier 3 (finishing the mid lane quest upgrades them for
// free); Seeker's Armguard into Shattered Armguard once its stasis is used;
// and the items built from a Tear of the Goddess once it's charged. Riot logs
// the old item leaving and nothing else.
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
  2420: 2421, // Seeker's Armguard into Shattered Armguard
  3003: 3040, // Archangel's Staff into Seraph's Embrace
  3004: 3042, // Manamune into Muramana
  3119: 3121, // Winter's Approach into Fimbulwinter
  2526: 2530, // into Diadem of Songs
};

// Each role has a slot of its own holding its quest's hidden item, which is
// never bought: Top Lane Quest (1200), Mid Lane Quest (1201) and so on while
// the quest is under way, then a reward (1205 to 1209, and 1220 and 1221 for
// top lane in the check's games). Riot logs the hidden item leaving whenever
// something else goes in the slot:
// - A bot laner's boots once their quest is done ("Boots move to a 7th
//   slot"). Boots bought later go there too.
// - A support's control wards, all game long ("Control wards always go into
//   your role quest slot"). Riot logs each ward that goes there as bought and
//   leaving at once. A ward still there when the quest is done is lost.
// - A jungler's pet, which leaves their items when it evolves at the end of
//   their quest.
export const QUEST_ITEMS = new Set([
  1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1220, 1221,
]);
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
  // bot laner's boots or a support's control wards. 0 when empty or when it
  // holds the quest's hidden item.
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
  // The player's champion, for Fiddlesticks' trinket and Viego.
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
  const free = freeItems(logged, finalItems, champion);
  const mine = [...free, ...logged].sort(
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
  // Free items waiting for an empty slot (see WAITS_FOR_SLOT).
  const waiting: number[] = [];
  // Purchases and sales that can still be undone, latest last.
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
    else if (slots.length < ITEM_SLOTS) slots.push({ id, count: 1 });
    else if (WAITS_FOR_SLOT.has(id)) waiting.push(id);
    // Past six items only when the events say so, which the game doesn't
    // allow; then they're shown rather than hidden.
    else slots.push({ id, count: 1 });
  };
  // Returns false when the player didn't have the item, like the role
  // quests' hidden items, which are never bought.
  const take = (id: number): boolean => {
    if (id === 0) return false;
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
  // Takes an item off the waiting list, when it's used before a slot is
  // free. False if it wasn't waiting.
  const stopWaiting = (id: number): boolean => {
    const i = waiting.indexOf(id);
    if (i !== -1) waiting.splice(i, 1);
    return i !== -1;
  };
  // Past six items, an emptied slot goes instead of staying empty, so the
  // extra one is only shown for as long as it's there.
  const empty = (slot: { id: number; count: number }) => {
    if (slots.length > ITEM_SLOTS) slots.splice(slots.indexOf(slot), 1);
    else [slot.id, slot.count] = [0, 0];
  };
  // An item turning into another where it is.
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
  // The upgrade a Bounty of Worlds leaving at moment t turned into: the next
  // one the events mention (being sold, say), or else the one the player had
  // at the end, or nothing if they had none. Selling it and buying the
  // support item again lets them pick another.
  const upgradeAfter = (t: number): number => {
    const next = mine.find((e) => e.timestamp > t && SUPPORT_UPGRADES.has(itemOf(e)));
    return next ? itemOf(next) : (finalItems.find((id) => SUPPORT_UPGRADES.has(id)) ?? 0);
  };

  const history: ItemChange[] = [{ from: 0, slots: emptySlots(), trinket: 0, roleItem: 0 }];
  for (const group of byMillisecond(mine)) {
    const at = group[0].timestamp;
    // What was bought at this millisecond: an item leaving at the same time
    // was used up building one of them, unless they're all things nothing is
    // built from.
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
      // A bot laner's boots moving to the role quest's slot (Magical
      // Footwear's too, even while they wait for a slot).
      if (quest === BOT_LANE_QUEST && BOOTS.has(id)) {
        if (!take(id) && !stopWaiting(id)) return false;
        give(id);
        return true;
      }
      // A support's control ward going in the role quest's slot, which the
      // purchase at the same moment puts there. With nothing bought, it's
      // the ward already there leaving as their quest is done.
      if (supportQuest && id === CONTROL_WARD && bought.includes(id)) return true;
      const next = id === BOUNTY_OF_WORLDS ? upgradeAfter(at) : TURNS_INTO[id];
      const builtInto = bought.filter((b) => b !== id && !CONSUMABLES.has(b));
      if (next !== undefined && builtInto.length === 0) return turnInto(id, next);
      if (!take(id) && !stopWaiting(id)) return false;
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
          if (!take(e.itemId)) stopWaiting(e.itemId);
          undoable.push({ kind: "sold", itemId: e.itemId, usedUp: [], trinketBefore: null });
          break;
        case "ITEM_PURCHASED": {
          const before = trinket;
          give(e.itemId);
          // Free items aren't the player's doing, so they can't be undone.
          if (free.includes(e)) break;
          undoable.push({
            kind: "bought",
            itemId: e.itemId,
            usedUp: usedUp.splice(0),
            trinketBefore: TRINKETS.has(e.itemId) ? before : null,
          });
          break;
        }
        case "ITEM_UNDO": {
          // Undoing takes back the latest purchase or sale. Riot names its
          // item, as the item before for a purchase and the item after for a
          // sale, except that a purchase that replaced another item (a
          // trinket, the support item's upgrade) is named like a sale, and
          // one whose item has already turned into another (boots upgraded
          // by the mid lane quest) or moved (a support's control ward) isn't
          // named at all.
          const id = e.beforeId || e.afterId;
          const i = id ? undoable.findLastIndex((u) => u.itemId === id) : undoable.length - 1;
          if (i === -1) break;
          const [undone] = undoable.splice(i, 1);
          if (undone.kind === "sold") {
            give(undone.itemId);
            break;
          }
          if (!take(undone.itemId)) take(TURNS_INTO[undone.itemId] ?? 0);
          for (const item of undone.usedUp) give(item);
          if (undone.trinketBefore !== null) trinket = undone.trinketBefore;
          break;
        }
      }
    }
    for (const id of notYet) leave(id);
    // Waiting items take any slot that emptied, or wait on.
    for (const id of waiting.splice(0)) give(id);

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
// The one exception is his quest's hidden item leaving with one other item:
// that's the quest moving it to its slot, like his pet when it evolves.
function withoutPossessions(events: ItemEvent[]): ItemEvent[] {
  return byMillisecond(events)
    .filter((group) => {
      if (group.length === 1 || group.some((e) => e.type !== "ITEM_DESTROYED")) return true;
      return group.length === 2 && group.some((e) => QUEST_ITEMS.has(itemOf(e)));
    })
    .flat();
}

// Items a player gets without a purchase in the log, as purchases at the
// moment they arrive: the trinket everyone starts with, World Atlas for
// supports, Magical Footwear's boots by 12:00 and Biscuit Delivery's
// biscuits. Each shows up in the log when it first leaves, or in the final
// items if it never did.
function freeItems(logged: ItemEvent[], finalItems: number[], champion: string): ItemEvent[] {
  const participantId = logged[0]?.participantId ?? 0;
  const mentions = (id: number) => logged.some((e) => itemOf(e) === id);
  const firstLeft = (has: (id: number) => boolean): ItemEvent | null => {
    const first = logged.find((e) => has(itemOf(e)));
    return first && leaves(first) ? first : null;
  };
  const neverLogged = (id: number) => !mentions(id) && finalItems.includes(id);
  const free = (itemId: number, timestamp: number): ItemEvent => ({
    type: "ITEM_PURCHASED",
    timestamp,
    participantId,
    itemId,
  });

  const items: ItemEvent[] = [];
  // The starting trinket: the first one in the log when that's it leaving.
  // When the log starts with a trinket bought instead, the usual one was
  // there before it (undoing that purchase brings it back). With no trinket
  // in the log at all, the one Riot lists at the end, if any: some game modes
  // have none.
  const trinket = firstLeft((id) => TRINKETS.has(id));
  if (trinket) items.push(free(itemOf(trinket), 0));
  else if (logged.some((e) => TRINKETS.has(itemOf(e)))) {
    items.push(free(champion.toLowerCase() === FIDDLESTICKS ? SCARECROW_EFFIGY : STEALTH_WARD, 0));
  } else if (TRINKETS.has(finalItems[6])) items.push(free(finalItems[6], 0));
  if (firstLeft((id) => id === WORLD_ATLAS) || neverLogged(WORLD_ATLAS)) {
    items.push(free(WORLD_ATLAS, 0));
  }
  const footwear = firstLeft((id) => id === MAGICAL_FOOTWEAR);
  if (footwear || neverLogged(MAGICAL_FOOTWEAR)) {
    items.push(free(MAGICAL_FOOTWEAR, Math.min(MAGICAL_FOOTWEAR_MS, footwear?.timestamp ?? Infinity)));
  }
  if (mentions(BISCUIT) || finalItems.includes(BISCUIT)) {
    for (const t of BISCUIT_TIMES) items.push(free(BISCUIT, t));
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
