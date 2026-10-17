import { describe, expect, it } from "vitest";
import { inventoryAt, itemHistory, keepsItemChanges } from "./items";
import type { TrimmedEvent } from "./trim";

const ME = 3;
const DORANS_BLADE = 1055;
const LONG_SWORD = 1036;
const SERRATED_DIRK = 3134; // built from two Long Swords
const HEALTH_POTION = 2003;
const STEALTH_WARD = 3340;
const ORACLE_LENS = 3364;
const WORLD_ATLAS = 3865;
const RUNIC_COMPASS = 3866;
const BOUNTY_OF_WORLDS = 3867;
const REALMSPIKE = 3871; // Zaz'Zak's Realmspike, one of the support upgrades

const bought = (timestamp: number, itemId: number, participantId = ME): TrimmedEvent => ({
  type: "ITEM_PURCHASED",
  timestamp,
  participantId,
  itemId,
});
const sold = (timestamp: number, itemId: number): TrimmedEvent => ({
  type: "ITEM_SOLD",
  timestamp,
  participantId: ME,
  itemId,
});
const usedUp = (timestamp: number, itemId: number): TrimmedEvent => ({
  type: "ITEM_DESTROYED",
  timestamp,
  participantId: ME,
  itemId,
});
const undo = (timestamp: number, beforeId: number, afterId: number): TrimmedEvent => ({
  type: "ITEM_UNDO",
  timestamp,
  participantId: ME,
  beforeId,
  afterId,
});

// The usual start: a Doran's Blade, a potion and the free trinket.
const start = [
  bought(1_000, DORANS_BLADE),
  bought(1_500, HEALTH_POTION),
  bought(2_000, STEALTH_WARD),
];

const last = (events: TrimmedEvent[]) => itemHistory(events, ME).at(-1)!;

describe("itemHistory", () => {
  it("starts empty and puts each new item in the first empty slot, trinkets in their own", () => {
    const history = itemHistory(start, ME);
    expect(history[0]).toEqual({ from: 0, slots: [0, 0, 0, 0, 0, 0], trinket: 0 });
    expect(history.at(-1)).toEqual({
      from: 2_000,
      slots: [DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0],
      trinket: STEALTH_WARD,
    });
  });

  it("stacks potions in one slot and empties it when the last one is drunk", () => {
    const events = [...start, bought(2_500, HEALTH_POTION), usedUp(90_000, HEALTH_POTION)];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0]);
    expect(last([...events, usedUp(95_000, HEALTH_POTION)]).slots).toEqual([
      DORANS_BLADE, 0, 0, 0, 0, 0,
    ]);
  });

  it("uses up an item's components when it's built, whichever order Riot logs them in", () => {
    const swords = [...start, bought(300_000, LONG_SWORD), bought(300_200, LONG_SWORD)];
    const componentsFirst = [
      ...swords,
      usedUp(500_000, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
      bought(500_000, SERRATED_DIRK),
    ];
    const itemFirst = [
      ...swords,
      bought(500_000, SERRATED_DIRK),
      usedUp(500_000, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
    ];
    for (const events of [componentsFirst, itemFirst]) {
      const history = itemHistory(events, ME);
      expect(history.at(-1)!.slots).toEqual([DORANS_BLADE, HEALTH_POTION, SERRATED_DIRK, 0, 0, 0]);
      // Everything at that millisecond is one change.
      expect(history.filter((change) => change.from === 500_000)).toHaveLength(1);
    }
  });

  it("takes sold items away, and the next item fills the empty slot", () => {
    const events = [...start, sold(600_000, DORANS_BLADE)];
    expect(last(events).slots).toEqual([0, HEALTH_POTION, 0, 0, 0, 0]);
    expect(last([...events, bought(600_500, LONG_SWORD)]).slots).toEqual([
      LONG_SWORD, HEALTH_POTION, 0, 0, 0, 0,
    ]);
  });

  it("gives back what a purchase used up when it's undone", () => {
    const events = [
      ...start,
      bought(300_000, LONG_SWORD),
      bought(300_200, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
      bought(500_000, SERRATED_DIRK),
      undo(503_000, SERRATED_DIRK, 0),
    ];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, LONG_SWORD, LONG_SWORD, 0, 0]);
  });

  it("gives a sold item back when the sale is undone", () => {
    const events = [...start, sold(600_000, DORANS_BLADE), undo(601_000, 0, DORANS_BLADE)];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0]);
  });

  it("swaps trinkets, and brings the old one back when the swap is undone", () => {
    const swapped = [...start, bought(400_000, ORACLE_LENS)];
    expect(last(swapped).trinket).toBe(ORACLE_LENS);
    expect(last([...swapped, undo(401_000, ORACLE_LENS, 0)]).trinket).toBe(STEALTH_WARD);
  });

  it("starts with the free trinket when the first sign of it is it leaving", () => {
    // Riot doesn't log the Stealth Ward everyone starts with, only the swap.
    const history = itemHistory([usedUp(260_901, STEALTH_WARD), bought(260_901, ORACLE_LENS)], ME);
    expect(history[0].trinket).toBe(STEALTH_WARD);
    expect(history.at(-1)!.trinket).toBe(ORACLE_LENS);
  });

  it("gives a player who never changed trinket the one Riot lists at the end, all game", () => {
    const final = [DORANS_BLADE, 0, 0, 0, 0, 0, STEALTH_WARD];
    expect(itemHistory([bought(1_000, DORANS_BLADE)], ME, final)[0].trinket).toBe(STEALTH_WARD);
  });

  it("starts supports with World Atlas and upgrades it in its slot, up to the one they picked", () => {
    // From a real game: Riot logs each support item leaving, but not the
    // next one arriving or the World Atlas being bought.
    const events = [
      bought(13_505, HEALTH_POTION),
      usedUp(409_307, WORLD_ATLAS),
      usedUp(729_746, RUNIC_COMPASS),
      usedUp(732_629, BOUNTY_OF_WORLDS),
    ];
    const history = itemHistory(events, ME, [REALMSPIKE, 0, 0, 0, 0, 0, ORACLE_LENS]);
    expect(inventoryAt(history, 0).slots).toEqual([WORLD_ATLAS, 0, 0, 0, 0, 0]);
    expect(inventoryAt(history, 500_000).slots).toEqual([RUNIC_COMPASS, HEALTH_POTION, 0, 0, 0, 0]);
    expect(inventoryAt(history, 730_000).slots[0]).toBe(BOUNTY_OF_WORLDS);
    expect(inventoryAt(history, 733_000).slots[0]).toBe(REALMSPIKE);
  });

  it("ignores other players, and items the player never had", () => {
    const events = [...start, bought(10_000, LONG_SWORD, 8), usedUp(130_000, 2010)];
    expect(itemHistory(events, ME)).toEqual(itemHistory(start, ME));
  });
});

describe("inventoryAt", () => {
  const history = itemHistory([...start, sold(600_000, DORANS_BLADE)], ME);

  it("finds the items held at any moment", () => {
    expect(inventoryAt(history, 500).slots).toEqual([0, 0, 0, 0, 0, 0]);
    expect(inventoryAt(history, 1_200).slots).toEqual([DORANS_BLADE, 0, 0, 0, 0, 0]);
    expect(inventoryAt(history, 600_000).slots).toEqual([0, HEALTH_POTION, 0, 0, 0, 0]);
    expect(inventoryAt(history, 9_999_999).trinket).toBe(STEALTH_WARD);
  });
});

describe("keepsItemChanges", () => {
  it("is true only for timelines that kept sales or used-up items", () => {
    expect(keepsItemChanges({ events: start })).toBe(false);
    expect(keepsItemChanges({ events: [...start, usedUp(90_000, HEALTH_POTION)] })).toBe(true);
    expect(keepsItemChanges({ events: [...start, sold(600_000, DORANS_BLADE)] })).toBe(true);
  });
});
