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
const SCARECROW_EFFIGY = 3330; // Fiddlesticks' Stealth Ward
const WORLD_ATLAS = 3865;
const RUNIC_COMPASS = 3866;
const BOUNTY_OF_WORLDS = 3867;
const REALMSPIKE = 3871; // Zaz'Zak's Realmspike, one of the support upgrades
const CELESTIAL_OPPOSITION = 3869; // another
const BLOODSONG = 3877; // and another
const EYE_OF_THE_HERALD = 3513;
const BOOTS = 1001;
const DAGGER = 1042;
const BERSERKERS = 3006; // Berserker's Greaves, from Boots and two Daggers
const GUNMETAL = 3172; // Gunmetal Greaves, their tier 3
const SORCERERS = 3020; // Sorcerer's Shoes
const SPELLSLINGERS = 3175; // their tier 3
const MERCURYS = 3111; // Mercury's Treads
const CHAINLACED = 3173; // Chainlaced Crushers, their tier 3
const ELIXIR = 2140; // Elixir of Wrath
const SEEKERS_ARMGUARD = 2420;
const SHATTERED_ARMGUARD = 2421;
const ZHONYAS = 3157; // built from a Seeker's Armguard, among others
const TEAR = 3070; // Tear of the Goddess
const FORBIDDEN_IDOL = 3114;
const RUBY_CRYSTAL = 1028;
const UNCHARGED_DIADEM = 2526; // built from those three
const DIADEM_OF_SONGS = 2530; // what it turns into once the Tear is charged
const BISCUIT = 2010;
const SCORCHCLAW_PUP = 1101; // a jungle pet
// Hidden items for the role quests, which Riot logs leaving when something
// goes in the slot the quest adds.
const MID_LANE_QUEST = 1201;
const BOT_LANE_QUEST = 1202;
const SUPPORT_QUEST = 1203;
const SUPPORT_QUEST_DONE = 1208;
const JUNGLE_QUEST = 1204;
const JUNGLE_QUEST_DONE = 1209;
const CONTROL_WARD = 2055;
const MAGICAL_FOOTWEAR = 2422;

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

// The usual start: a Doran's Blade, a potion and the free trinket, which
// everyone has from the start but Riot sometimes logs as bought.
const start = [
  bought(1_000, DORANS_BLADE),
  bought(1_500, HEALTH_POTION),
  bought(2_000, STEALTH_WARD),
];

const last = (events: TrimmedEvent[]) => itemHistory(events, ME).at(-1)!;

describe("itemHistory", () => {
  it("starts with just the trinket and puts each new item in the first empty slot", () => {
    const history = itemHistory(start, ME);
    expect(history[0]).toEqual({
      from: 0,
      slots: [0, 0, 0, 0, 0, 0],
      trinket: STEALTH_WARD,
      roleItem: 0,
    });
    expect(history.at(-1)).toEqual({
      from: 1_500,
      slots: [DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0],
      trinket: STEALTH_WARD,
      roleItem: 0,
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

  it("keeps the starting trinket when buying another one is undone", () => {
    // From a real game (Irelia): Riot doesn't log the trinket she started
    // with, only buying one and undoing it.
    const events = [bought(6_688, STEALTH_WARD), undo(8_692, 0, STEALTH_WARD)];
    expect(last(events).trinket).toBe(STEALTH_WARD);
    // Fiddlesticks starts with his own.
    const fiddlesticks = itemHistory([bought(6_000, ORACLE_LENS)], ME, { champion: "FiddleSticks" });
    expect(fiddlesticks[0].trinket).toBe(SCARECROW_EFFIGY);
  });

  it("gives a player who never changed trinket the one Riot lists at the end, all game", () => {
    const finalItems = [DORANS_BLADE, 0, 0, 0, 0, 0, STEALTH_WARD];
    expect(itemHistory([bought(1_000, DORANS_BLADE)], ME, { finalItems })[0].trinket).toBe(
      STEALTH_WARD,
    );
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
    const history = itemHistory(events, ME, {
      finalItems: [REALMSPIKE, 0, 0, 0, 0, 0, ORACLE_LENS],
    });
    expect(inventoryAt(history, 0).slots).toEqual([WORLD_ATLAS, 0, 0, 0, 0, 0]);
    expect(inventoryAt(history, 500_000).slots).toEqual([RUNIC_COMPASS, HEALTH_POTION, 0, 0, 0, 0]);
    expect(inventoryAt(history, 730_000).slots[0]).toBe(BOUNTY_OF_WORLDS);
    expect(inventoryAt(history, 733_000).slots[0]).toBe(REALMSPIKE);
  });

  it("puts the Eye of the Herald in the trinket slot until it's used", () => {
    // From a real game: the trinket leaves with nothing bought, then the Eye
    // leaves when it's used, and the trinket is back at the end.
    const events = [
      usedUp(282_621, STEALTH_WARD),
      bought(282_621, ORACLE_LENS),
      usedUp(1_125_896, ORACLE_LENS),
      usedUp(1_129_622, EYE_OF_THE_HERALD),
    ];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 1_126_000).trinket).toBe(EYE_OF_THE_HERALD);
    expect(inventoryAt(history, 1_130_000).trinket).toBe(ORACLE_LENS);
  });

  it("brings the old trinket back when a swap is undone", () => {
    // From a real game: Riot logs undoing a purchase that replaced an item
    // like an undone sale, nothing before and the item after.
    const events = [
      bought(10_374, STEALTH_WARD),
      usedUp(1_518_580, STEALTH_WARD),
      bought(1_518_580, ORACLE_LENS),
    ];
    expect(last([...events, undo(1_520_150, 0, ORACLE_LENS)]).trinket).toBe(STEALTH_WARD);
    expect(last([...events, undo(1_520_150, ORACLE_LENS, 0)]).trinket).toBe(STEALTH_WARD);
  });

  it("brings Bounty of Worlds back when picking its upgrade is undone", () => {
    // From a real game: the upgrade is undone, then a different one picked.
    const events = [
      usedUp(409_000, WORLD_ATLAS),
      usedUp(729_000, RUNIC_COMPASS),
      usedUp(900_263, BOUNTY_OF_WORLDS),
      bought(900_263, REALMSPIKE),
      undo(902_703, 0, REALMSPIKE),
    ];
    const history = itemHistory(events, ME, {
      finalItems: [CELESTIAL_OPPOSITION, 0, 0, 0, 0, 0, STEALTH_WARD],
    });
    expect(inventoryAt(history, 901_000).slots[0]).toBe(REALMSPIKE);
    expect(inventoryAt(history, 903_000).slots).toEqual([BOUNTY_OF_WORLDS, 0, 0, 0, 0, 0]);
    const picked = [...events, usedUp(950_000, BOUNTY_OF_WORLDS), bought(950_000, CELESTIAL_OPPOSITION)];
    expect(last(picked).slots).toEqual([CELESTIAL_OPPOSITION, 0, 0, 0, 0, 0]);
  });

  it("turns Bounty of Worlds into the upgrade the player had then, when they swap it later", () => {
    // From a real game (Braum): the first upgrade only shows up when it's
    // sold. Buying the support item again goes through its steps at once,
    // here as two control wards are bought, and ends in the one Riot lists.
    const events = [
      usedUp(412_000, WORLD_ATLAS),
      usedUp(916_000, RUNIC_COMPASS),
      usedUp(932_000, BOUNTY_OF_WORLDS),
      sold(1_807_000, BLOODSONG),
      bought(1_808_000, WORLD_ATLAS),
      usedUp(1_810_000, WORLD_ATLAS),
      usedUp(1_810_000, CONTROL_WARD),
      usedUp(1_810_000, SUPPORT_QUEST_DONE),
      bought(1_810_000, CONTROL_WARD),
      bought(1_810_000, CONTROL_WARD),
      usedUp(1_811_000, RUNIC_COMPASS),
      usedUp(1_815_000, BOUNTY_OF_WORLDS),
    ];
    const history = itemHistory(events, ME, {
      finalItems: [CELESTIAL_OPPOSITION, 0, 0, 0, 0, 0, ORACLE_LENS],
    });
    expect(inventoryAt(history, 1_000_000).slots[0]).toBe(BLOODSONG);
    expect(inventoryAt(history, 1_810_000)).toMatchObject({
      slots: [RUNIC_COMPASS, 0, 0, 0, 0, 0],
      roleItem: CONTROL_WARD,
    });
    expect(history.at(-1)!.slots).toEqual([CELESTIAL_OPPOSITION, 0, 0, 0, 0, 0]);
  });

  it("turns tier 2 boots into tier 3 when they leave with nothing bought", () => {
    const events = [
      ...start,
      bought(300_000, BOOTS),
      usedUp(500_000, BOOTS),
      bought(500_000, SORCERERS),
      usedUp(1_100_000, SORCERERS),
    ];
    expect(inventoryAt(itemHistory(events, ME), 1_000_000).slots[2]).toBe(SORCERERS);
    expect(last(events).slots[2]).toBe(SPELLSLINGERS);
  });

  it("upgrades boots bought already upgraded, whichever order Riot logs it in", () => {
    // From a real game: the boots leave at the same millisecond they're bought.
    const events = [
      ...start,
      bought(300_000, BOOTS),
      usedUp(896_752, BOOTS),
      usedUp(896_752, SORCERERS),
      bought(896_752, SORCERERS),
    ];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, SPELLSLINGERS, 0, 0, 0]);
  });

  it("undoes a purchase whose item has already turned into another", () => {
    // From a real game (Hwei): with the mid lane quest done, boots are
    // upgraded as they're bought, and undoing that names neither item.
    const events = [
      ...start,
      bought(440_000, BOOTS),
      usedUp(721_000, MID_LANE_QUEST),
      usedUp(763_000, BOOTS),
      usedUp(763_000, MERCURYS),
      bought(763_000, MERCURYS),
      undo(764_000, 0, 0),
      usedUp(764_500, BOOTS),
      usedUp(764_500, SORCERERS),
      bought(764_500, SORCERERS),
    ];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 763_000).slots[2]).toBe(CHAINLACED);
    expect(inventoryAt(history, 764_000).slots[2]).toBe(BOOTS);
    expect(history.at(-1)!.slots).toEqual([DORANS_BLADE, HEALTH_POTION, SPELLSLINGERS, 0, 0, 0]);
  });

  it("drops an elixir drunk as it's bought", () => {
    const events = [...start, usedUp(2_295_731, ELIXIR), bought(2_295_731, ELIXIR)];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0]);
  });

  it("shatters a used Seeker's Armguard, but uses it up when an item is built from it", () => {
    const withArmguard = [...start, bought(1_000_000, SEEKERS_ARMGUARD)];
    expect(last([...withArmguard, usedUp(1_200_000, SEEKERS_ARMGUARD)]).slots[2]).toBe(
      SHATTERED_ARMGUARD,
    );
    expect(
      last([...withArmguard, usedUp(1_200_000, SEEKERS_ARMGUARD), bought(1_200_000, ZHONYAS)])
        .slots[2],
    ).toBe(ZHONYAS);
  });

  it("turns an item built from a charged Tear into its next form at once", () => {
    // From a real game (Sona): Riot logs the new item leaving as it's bought.
    const events = [
      ...start,
      bought(209_000, TEAR),
      bought(960_000, FORBIDDEN_IDOL),
      bought(961_000, RUBY_CRYSTAL),
      usedUp(1_169_000, FORBIDDEN_IDOL),
      usedUp(1_169_000, RUBY_CRYSTAL),
      usedUp(1_169_000, TEAR),
      bought(1_169_000, UNCHARGED_DIADEM),
      usedUp(1_169_000, UNCHARGED_DIADEM),
    ];
    expect(last(events).slots).toEqual([DORANS_BLADE, HEALTH_POTION, DIADEM_OF_SONGS, 0, 0, 0]);
  });

  it("moves a bot laner's boots to their own slot when the role quest is done", () => {
    // From a real game: the quest's hidden item and the boots leave together,
    // and boots bought later go to the new slot too.
    const events = [
      ...start,
      bought(856_904, BOOTS),
      usedUp(892_256, BOT_LANE_QUEST),
      usedUp(892_256, BOOTS),
      bought(900_000, DAGGER),
      bought(900_100, DAGGER),
      usedUp(916_671, BOOTS),
      usedUp(916_671, DAGGER),
      usedUp(916_671, DAGGER),
      bought(916_671, BERSERKERS),
    ];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 893_000)).toMatchObject({
      slots: [DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0],
      roleItem: BOOTS,
    });
    expect(history.at(-1)).toMatchObject({
      slots: [DORANS_BLADE, HEALTH_POTION, 0, 0, 0, 0],
      roleItem: BERSERKERS,
    });
    expect(last([...events, usedUp(1_500_000, BERSERKERS)]).roleItem).toBe(GUNMETAL);
  });

  it("keeps a support's control wards in the role quest's slot", () => {
    // From a real game (Leona): each ward that goes in the empty slot is
    // logged as bought and leaving, with the quest's hidden item leaving.
    const goesInSlot = (timestamp: number, questItem: number) => [
      usedUp(timestamp, CONTROL_WARD),
      usedUp(timestamp, questItem),
      bought(timestamp, CONTROL_WARD),
    ];
    const events = [
      bought(1_000, DORANS_BLADE),
      ...goesInSlot(399_194, SUPPORT_QUEST),
      usedUp(505_942, CONTROL_WARD), // placed
      ...goesInSlot(757_190, SUPPORT_QUEST),
      bought(875_540, CONTROL_WARD), // a second one stacks there
      usedUp(895_756, CONTROL_WARD),
      ...goesInSlot(1_588_743, SUPPORT_QUEST_DONE),
      bought(1_589_044, CONTROL_WARD),
    ];
    const history = itemHistory(events, ME);
    const at = (t: number) => inventoryAt(history, t);
    expect(at(400_000)).toMatchObject({ slots: [DORANS_BLADE, 0, 0, 0, 0, 0], roleItem: CONTROL_WARD });
    expect(at(600_000).roleItem).toBe(0);
    expect(at(880_000).roleItem).toBe(CONTROL_WARD);
    expect(at(900_000).roleItem).toBe(CONTROL_WARD);
    expect(history.at(-1)).toMatchObject({ slots: [DORANS_BLADE, 0, 0, 0, 0, 0], roleItem: CONTROL_WARD });
    // Anyone else keeps control wards with their other items.
    expect(last([...start, bought(300_000, CONTROL_WARD)]).slots[2]).toBe(CONTROL_WARD);
  });

  it("ignores Viego's possessions, which log his items and the enemy's leaving", () => {
    // From a real game: his own items and his quest's hidden item leave when
    // he possesses an enemy, and the enemy's items when he goes back.
    const events = [
      ...start,
      bought(300_000, LONG_SWORD),
      bought(300_200, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
      usedUp(500_000, LONG_SWORD),
      bought(500_000, SERRATED_DIRK),
      usedUp(871_957, DORANS_BLADE),
      usedUp(871_957, HEALTH_POTION),
      usedUp(871_957, SERRATED_DIRK),
      usedUp(871_957, JUNGLE_QUEST_DONE),
      usedUp(881_976, 1086),
      usedUp(881_976, SERRATED_DIRK),
      usedUp(881_976, BOOTS),
      usedUp(900_000, HEALTH_POTION), // drunk
    ];
    const expected = [DORANS_BLADE, 0, SERRATED_DIRK, 0, 0, 0];
    expect(itemHistory(events, ME, { champion: "Viego" }).at(-1)!.slots).toEqual(expected);
    expect(last(events).slots).not.toEqual(expected);
  });

  it("takes Viego's pet away when his jungle quest is done", () => {
    // From a real game: possessing logs the pet leaving with his other items
    // and the quest's hidden item, but the pet evolving logs only those two.
    const events = [
      bought(9_705, SCORCHCLAW_PUP),
      bought(300_000, SERRATED_DIRK),
      usedUp(446_160, SCORCHCLAW_PUP),
      usedUp(446_160, SERRATED_DIRK),
      usedUp(446_160, JUNGLE_QUEST),
      usedUp(1_096_373, JUNGLE_QUEST),
      usedUp(1_096_373, SCORCHCLAW_PUP),
    ];
    const history = itemHistory(events, ME, { champion: "Viego" });
    expect(inventoryAt(history, 500_000).slots).toEqual([SCORCHCLAW_PUP, SERRATED_DIRK, 0, 0, 0, 0]);
    expect(history.at(-1)!.slots).toEqual([0, SERRATED_DIRK, 0, 0, 0, 0]);
  });

  it("gives Magical Footwear's boots by 12:00, or sooner if they're upgraded sooner", () => {
    const upgraded = [usedUp(1_246_849, MAGICAL_FOOTWEAR), bought(1_246_849, 3111)];
    const history = itemHistory([...start, ...upgraded], ME);
    expect(inventoryAt(history, 12 * 60_000 - 1).slots[2]).toBe(0);
    expect(inventoryAt(history, 12 * 60_000).slots[2]).toBe(MAGICAL_FOOTWEAR);
    expect(history.at(-1)!.slots[2]).toBe(3111);
    // Never upgraded: Riot lists it at the end.
    const kept = itemHistory(start, ME, {
      finalItems: [DORANS_BLADE, MAGICAL_FOOTWEAR, 0, 0, 0, 0, STEALTH_WARD],
    });
    expect(kept.at(-1)!.slots).toContain(MAGICAL_FOOTWEAR);
  });

  it("holds Magical Footwear's boots until a slot is free", () => {
    // From real games (Ekko, Kaisa): all six slots were full at 12:00.
    const events = [
      ...start,
      bought(300_000, LONG_SWORD),
      bought(300_200, LONG_SWORD),
      bought(400_000, DAGGER),
      bought(400_200, DAGGER),
      sold(780_000, DORANS_BLADE),
      usedUp(900_000, MAGICAL_FOOTWEAR),
      bought(900_000, SORCERERS),
    ];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 12 * 60_000).slots).toEqual([
      DORANS_BLADE, HEALTH_POTION, LONG_SWORD, LONG_SWORD, DAGGER, DAGGER,
    ]);
    expect(inventoryAt(history, 780_000).slots[0]).toBe(MAGICAL_FOOTWEAR);
    expect(history.at(-1)!.slots[0]).toBe(SORCERERS);
  });

  it("gives Biscuit Delivery's biscuits at 2, 4 and 6 minutes", () => {
    // From a real game (Kaisa): Riot logs each biscuit eaten but none
    // arriving, and she kept the last one.
    const events = [...start, usedUp(190_988, BISCUIT), usedUp(308_823, BISCUIT)];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 125_000).slots[2]).toBe(BISCUIT);
    expect(inventoryAt(history, 200_000).slots[2]).toBe(0);
    expect(history.at(-1)!.slots).toEqual([DORANS_BLADE, HEALTH_POTION, BISCUIT, 0, 0, 0]);
  });

  it("holds a biscuit until a slot is free", () => {
    // From a real game (Ahri): all six slots were full at 6:00.
    const events = [
      ...start,
      usedUp(130_000, BISCUIT),
      usedUp(250_000, BISCUIT),
      bought(300_000, LONG_SWORD),
      bought(300_200, LONG_SWORD),
      bought(301_000, DAGGER),
      bought(301_200, DAGGER),
      usedUp(420_000, LONG_SWORD),
      usedUp(420_000, LONG_SWORD),
      bought(420_000, SERRATED_DIRK),
    ];
    const history = itemHistory(events, ME);
    expect(inventoryAt(history, 400_000).slots).toEqual([
      DORANS_BLADE, HEALTH_POTION, LONG_SWORD, LONG_SWORD, DAGGER, DAGGER,
    ]);
    expect(history.at(-1)!.slots).toEqual([
      DORANS_BLADE, HEALTH_POTION, SERRATED_DIRK, BISCUIT, DAGGER, DAGGER,
    ]);
  });

  it("ignores other players, and items the player never had", () => {
    const events = [...start, bought(10_000, LONG_SWORD, 8), usedUp(130_000, SERRATED_DIRK)];
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
