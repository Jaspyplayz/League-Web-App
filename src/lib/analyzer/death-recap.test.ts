import { describe, expect, it } from "vitest";
import {
  abilityOf,
  addUpDeaths,
  findGameDeaths,
  MIN_RECAP_DEATHS,
  type GameDeaths,
} from "./death-recap";
import { frames, kill, match } from "./test-fixtures";
import type { ChampionKill, DeathDamage, TrimmedEvent } from "./trim";

// Blue side: 1 top Gnar, 2 jungle Vi, 3 mid Ahri, 4 bot Jinx, 5 support Thresh.
// Red side: 6 top Darius, 7 jungle LeeSin, 8 mid Syndra, 9 bot Kaisa, 10 support Nautilus.
// "You" are Ahri (player-3) in every test.
const PUUID = "player-3";

function hit(
  participantId: number,
  spellSlot: number,
  damage: { physical?: number; magic?: number; true?: number } = {},
  extra: Partial<DeathDamage> = {},
): DeathDamage {
  return {
    participantId,
    type: "OTHER",
    basic: false,
    spellSlot,
    spellName: `spell${spellSlot}`,
    physicalDamage: damage.physical ?? 0,
    magicDamage: damage.magic ?? 0,
    trueDamage: damage.true ?? 0,
    ...extra,
  };
}

const tower = (physical: number) =>
  hit(0, 64, { physical }, { type: "TOWER", spellName: "TurretBasicAttack" });

// A death of yours (participant 3) with its damage list.
function death(at: string, killerId: number, damage: DeathDamage[] | undefined): TrimmedEvent {
  const event = kill(at, killerId, 3) as ChampionKill;
  return damage ? { ...event, victimDamageReceived: damage } : event;
}

function game(events: TrimmedEvent[], matchId = "NA1_1"): GameDeaths {
  const m = match();
  m.metadata.matchId = matchId;
  return findGameDeaths(m, { frames: frames(30), events }, PUUID)!;
}

describe("abilityOf", () => {
  it("names Q, W, E and R by their slot", () => {
    expect(abilityOf(hit(8, 0))).toBe("Q");
    expect(abilityOf(hit(8, 3))).toBe("R");
  });

  it("tells basic attacks, summoner spells and everything else apart", () => {
    expect(abilityOf(hit(8, 64, {}, { basic: true }))).toBe("basic");
    expect(abilityOf(hit(8, 4, {}, { spellName: "SummonerDot" }))).toBe("summoner");
    // A passive or an item's damage.
    expect(abilityOf(hit(8, 63, {}, { spellName: "SyndraPassive" }))).toBe("other");
  });
});

describe("findGameDeaths", () => {
  it("keeps only your deaths, with each enemy champion's hits", () => {
    const g = game([
      death("5:00", 8, [hit(8, 0, { magic: 300 }), hit(7, 2, { physical: 120 }), tower(200)]),
      // Someone else's death doesn't count.
      kill("6:00", 3, 8),
    ]);
    expect(g.deaths).toBe(1);
    expect(g.detailed).toHaveLength(1);
    const [d] = g.detailed!;
    expect(d.tower).toBe(true);
    expect(d.hits.map((h) => [h.championName, h.ability])).toEqual([
      ["Syndra", "Q"],
      ["LeeSin", "E"],
    ]);
  });

  it("is null for a timeline saved before Turnpoint kept death recaps", () => {
    const g = game([death("5:00", 8, undefined)]);
    expect(g.deaths).toBe(1);
    expect(g.detailed).toBeNull();
  });

  it("adds up two lines for the same ability, and drops hits for no damage", () => {
    const g = game([
      death("5:00", 8, [hit(8, 0, { magic: 100 }), hit(8, 0, { magic: 50 }), hit(7, 1)]),
    ]);
    expect(g.detailed![0].hits).toEqual([
      {
        championName: "Syndra",
        ability: "Q",
        spellName: "spell0",
        damage: { physical: 0, magic: 150, true: 0 },
      },
    ]);
  });

  it("ignores damage from players on your own team", () => {
    // Can't happen in a normal game, but the data comes from outside.
    const g = game([death("5:00", 8, [hit(2, 0, { physical: 99 }), hit(8, 1, { magic: 10 })])]);
    expect(g.detailed![0].hits.map((h) => h.championName)).toEqual(["Syndra"]);
  });
});

describe("addUpDeaths", () => {
  // Syndra's Q is in three of your four deaths to her; Lee Sin is in two.
  const games = [
    game(
      [
        death("4:00", 8, [hit(8, 0, { magic: 400 }), hit(8, 3, { magic: 600 })]),
        death("9:00", 7, [hit(7, 3, { physical: 500 }), hit(8, 0, { magic: 200 }), tower(300)]),
      ],
      "NA1_1",
    ),
    game(
      [
        death("6:00", 8, [hit(8, 0, { magic: 350 }), hit(7, 0, { physical: 150 })]),
        death("12:00", 8, [hit(8, 64, { physical: 100 }, { basic: true }), tower(250)]),
      ],
      "NA1_2",
    ),
    // Saved before death recaps: counted as missing, not as zero damage.
    game([death("3:00", 8, undefined)], "NA1_3"),
  ];

  it("counts deaths with and without the detail", () => {
    const recap = addUpDeaths(games);
    expect(recap.deaths).toBe(4);
    expect(recap.undetailed).toBe(1);
    expect(recap.towerDeaths).toBe(2);
  });

  it("puts the enemy who was in the most deaths first, with their abilities", () => {
    const [syndra, lee] = addUpDeaths(games).threats;
    expect(syndra.championName).toBe("Syndra");
    expect(syndra.deaths).toBe(4);
    expect(syndra.damage).toBe(1650);
    expect(syndra.abilities.map((a) => [a.ability, a.deaths])).toEqual([
      ["Q", 3],
      ["R", 1],
      ["basic", 1],
    ]);
    expect(lee.championName).toBe("LeeSin");
    expect(lee.deaths).toBe(2);
  });

  it("shares out the champion damage, and splits it by type", () => {
    const recap = addUpDeaths(games);
    // 1,650 from Syndra and 650 from Lee Sin. Tower damage isn't champion damage.
    expect(recap.threats[0].share).toBeCloseTo(1650 / 2300);
    expect(recap.damage).toEqual({ physical: 750, magic: 1550, true: 0 });
  });

  it("picks the ability to respect: the one in the most deaths to its champion", () => {
    expect(addUpDeaths(games).respect).toEqual({
      championName: "Syndra",
      ability: "Q",
      spellName: "spell0",
      deaths: 3,
      of: 4,
    });
  });

  it("would rather name an ability than basic attacks or passives", () => {
    const recap = addUpDeaths([
      game([
        death("4:00", 9, [
          hit(9, 64, { physical: 300 }, { basic: true }),
          hit(9, 1, { magic: 50 }),
        ]),
        death("8:00", 9, [
          hit(9, 64, { physical: 300 }, { basic: true }),
          hit(9, 1, { magic: 50 }),
        ]),
        death("9:00", 9, [hit(9, 64, { physical: 300 }, { basic: true })]),
      ]),
    ]);
    expect(recap.respect).toMatchObject({ championName: "Kaisa", ability: "W", deaths: 2, of: 3 });
  });

  it("names nobody to respect when no ability was in two deaths", () => {
    const recap = addUpDeaths([
      game([
        death("4:00", 8, [hit(8, 0, { magic: 300 })]),
        death("8:00", 9, [hit(9, 1, { magic: 300 })]),
        death("9:00", 6, [hit(6, 2, { physical: 300 })]),
      ]),
    ]);
    expect(recap.respect).toBeNull();
  });

  it("keeps at most three enemies", () => {
    const recap = addUpDeaths([
      game([
        death("4:00", 8, [hit(6, 0, { physical: 1 }), hit(7, 0, { physical: 1 })]),
        death("8:00", 9, [hit(8, 0, { magic: 1 }), hit(9, 0, { physical: 1 })]),
      ]),
    ]);
    expect(recap.threats).toHaveLength(3);
  });

  it("is empty when no death has the detail yet", () => {
    const recap = addUpDeaths([game([death("3:00", 8, undefined)])]);
    expect(recap.deaths).toBe(0);
    expect(recap.threats).toEqual([]);
    expect(recap.respect).toBeNull();
    expect(MIN_RECAP_DEATHS).toBeGreaterThan(0);
  });
});
