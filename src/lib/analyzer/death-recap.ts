// "What keeps killing you" on Insights: the death recaps of your recent
// games, added up. In a game, League shows a death recap for a few seconds
// and then it's gone; across 20 games the same few champions and abilities
// keep showing up, and that's what you can learn to respect or build against.
// See docs/death-recaps.md.
//
// Riot's timeline gives each death's recap as victimDamageReceived: the
// damage the victim took in the last seconds, one line per source and spell.
// Turnpoint only keeps it in timelines downloaded since death recaps were
// added, so older saved games don't have it (see trim.ts).

import type { Match } from "@/lib/riot/types";
import { findPlayer } from "./index";
import type { ChampionKill, DeathDamage, TrimmedTimeline } from "./trim";

// Q, W, E and R by slot; "summoner" for Flash, Ignite and the rest; "other"
// for passives, items and runes, which Riot doesn't tell apart by slot.
export type Ability = "Q" | "W" | "E" | "R" | "basic" | "summoner" | "other";

const SLOTS: Ability[] = ["Q", "W", "E", "R"];

export type DamageSplit = { physical: number; magic: number; true: number };

// One enemy champion's ability in one of your deaths.
export type Hit = {
  championName: string;
  ability: Ability;
  // Riot's name for it, which says which summoner spell it was
  // ("SummonerDot" is Ignite).
  spellName: string;
  damage: DamageSplit;
};

export type DeathDetail = {
  timestamp: number;
  hits: Hit[];
  // A tower hit you too: you died under or near a tower.
  tower: boolean;
};

export type GameDeaths = {
  matchId: string;
  deaths: number;
  // Null when the game's timeline was saved before Turnpoint kept death
  // recaps, so its deaths can't be broken down.
  detailed: DeathDetail[] | null;
};

export function abilityOf(d: DeathDamage): Ability {
  if (d.basic) return "basic";
  if (d.spellName.toLowerCase().startsWith("summoner")) return "summoner";
  return SLOTS[d.spellSlot] ?? "other";
}

// Your deaths in one game, each with what hit you. Null if you're not in it.
export function findGameDeaths(
  match: Match,
  timeline: TrimmedTimeline,
  puuid: string,
): GameDeaths | null {
  const me = findPlayer(match, puuid);
  if (!me) return null;
  const enemies = new Map(
    match.info.participants
      .filter((p) => p.teamId !== me.teamId)
      .map((p) => [p.participantId, p.championName]),
  );
  const mine = timeline.events.filter(
    (e): e is ChampionKill => e.type === "CHAMPION_KILL" && e.victimId === me.participantId,
  );
  const saved = mine.every((k) => k.victimDamageReceived !== undefined);
  return {
    matchId: match.metadata.matchId,
    deaths: mine.length,
    detailed: saved
      ? mine.map((k) => ({
          timestamp: k.timestamp,
          hits: hitsIn(k.victimDamageReceived ?? [], enemies),
          tower: (k.victimDamageReceived ?? []).some((d) => d.type === "TOWER"),
        }))
      : null,
  };
}

// The enemy champions' lines of one death recap, with two lines for the same
// ability (Riot sometimes splits one) added together. Any line with an enemy's
// participantId counts, whatever its type, so a pet's damage (Annie's Tibbers,
// Zyra's plants) goes to its champion; towers, minions and monsters have
// participantId 0.
function hitsIn(damage: DeathDamage[], enemies: Map<number, string>): Hit[] {
  const hits = new Map<string, Hit>();
  for (const d of damage) {
    const championName = enemies.get(d.participantId);
    if (!championName) continue;
    if (d.physicalDamage + d.magicDamage + d.trueDamage <= 0) continue;
    const ability = abilityOf(d);
    const key = `${championName}:${abilityKey(ability, d.spellName)}`;
    const hit = hits.get(key) ?? {
      championName,
      ability,
      spellName: d.spellName,
      damage: { physical: 0, magic: 0, true: 0 },
    };
    hit.damage.physical += d.physicalDamage;
    hit.damage.magic += d.magicDamage;
    hit.damage.true += d.trueDamage;
    hits.set(key, hit);
  }
  return [...hits.values()];
}

// Flash and Ignite share the "summoner" ability, so they're told apart by name.
const abilityKey = (ability: Ability, spellName: string) =>
  ability === "summoner" ? `summoner:${spellName.toLowerCase()}` : ability;

const total = (d: DamageSplit) => d.physical + d.magic + d.true;

// Below this many deaths with an enemy champion in the recap, the card says
// it's still filling in rather than calling one or two deaths a pattern.
export const MIN_RECAP_DEATHS = 3;
// "Respect" needs an ability in at least this many deaths, so it isn't
// advice from one or two.
export const MIN_RESPECT_DEATHS = 3;
// The card shows this many enemy champions.
const MAX_THREATS = 3;

export type AbilityCount = {
  ability: Ability;
  spellName: string;
  deaths: number; // how many of your deaths to this champion it hit you in
  damage: number;
};

export type Threat = {
  championName: string;
  // Your deaths they did damage in, and how much in total.
  deaths: number;
  damage: number;
  // Their share of all the champion damage that killed you, 0 to 1.
  share: number;
  // In the most deaths first.
  abilities: AbilityCount[];
};

export type DeathRecap = {
  deaths: number; // your deaths with a recap
  // Of those, the ones an enemy champion did damage in. A death to a tower
  // alone has a recap but nothing to learn about champions.
  championDeaths: number;
  undetailed: number; // deaths in games saved before Turnpoint kept recaps
  // All the champion damage in those deaths, by type: what to build against.
  damage: DamageSplit;
  towerDeaths: number;
  // The enemy champions in the most of your deaths, at most three.
  threats: Threat[];
  // The one ability to respect: the Q, W, E or R that hit you in the most of
  // your deaths with its champion in them, in at least MIN_RESPECT_DEATHS.
  // Picked from every enemy champion, not only the three on the card.
  // Null when none did.
  respect: {
    championName: string;
    ability: Ability;
    spellName: string;
    deaths: number;
    of: number;
  } | null;
};

// Only the games the rest of Insights shows, so the champion filter applies.
export function deathsInGames(deaths: GameDeaths[], games: { matchId: string }[]): GameDeaths[] {
  const shown = new Set(games.map((g) => g.matchId));
  return deaths.filter((d) => shown.has(d.matchId));
}

export function addUpDeaths(games: GameDeaths[]): DeathRecap {
  const details = games.flatMap((g) => g.detailed ?? []);
  const undetailed = games.reduce((sum, g) => sum + (g.detailed ? 0 : g.deaths), 0);

  const damage: DamageSplit = { physical: 0, magic: 0, true: 0 };
  const byChampion = new Map<
    string,
    { deaths: number; damage: number; abilities: Map<string, AbilityCount> }
  >();
  for (const death of details) {
    const seen = new Set<string>();
    for (const hit of death.hits) {
      damage.physical += hit.damage.physical;
      damage.magic += hit.damage.magic;
      damage.true += hit.damage.true;

      const champion = byChampion.get(hit.championName) ?? {
        deaths: 0,
        damage: 0,
        abilities: new Map<string, AbilityCount>(),
      };
      // A champion with three abilities in one death is still one death.
      if (!seen.has(hit.championName)) champion.deaths++;
      seen.add(hit.championName);
      champion.damage += total(hit.damage);

      const key = abilityKey(hit.ability, hit.spellName);
      const ability = champion.abilities.get(key) ?? {
        ability: hit.ability,
        spellName: hit.spellName,
        deaths: 0,
        damage: 0,
      };
      // Hits are added up per ability in hitsIn, so each one is a new death.
      ability.deaths++;
      ability.damage += total(hit.damage);
      champion.abilities.set(key, ability);
      byChampion.set(hit.championName, champion);
    }
  }

  const allDamage = total(damage);
  const everyone: Threat[] = [...byChampion.entries()]
    .map(([championName, c]) => ({
      championName,
      deaths: c.deaths,
      damage: c.damage,
      share: allDamage > 0 ? c.damage / allDamage : 0,
      abilities: [...c.abilities.values()].sort(mostDeaths),
    }))
    .sort(mostDeaths);

  return {
    deaths: details.length,
    championDeaths: details.filter((d) => d.hits.length > 0).length,
    undetailed,
    damage,
    towerDeaths: details.filter((d) => d.tower).length,
    threats: everyone.slice(0, MAX_THREATS),
    respect: pickRespect(everyone),
  };
}

// Most deaths first; between equals, the one that did more damage.
const mostDeaths = (a: { deaths: number; damage: number }, b: { deaths: number; damage: number }) =>
  b.deaths - a.deaths || b.damage - a.damage;

// Basic attacks, summoner spells and passives are left out: "respect Kai'Sa's
// basic attacks" doesn't say what to look out for; "respect Kai'Sa's W" does.
function pickRespect(threats: Threat[]): DeathRecap["respect"] {
  let best: DeathRecap["respect"] = null;
  for (const threat of threats) {
    for (const a of threat.abilities) {
      if (!SLOTS.includes(a.ability) || a.deaths < MIN_RESPECT_DEATHS) continue;
      const better =
        !best ||
        a.deaths > best.deaths ||
        (a.deaths === best.deaths && a.deaths / threat.deaths > best.deaths / best.of);
      if (better) {
        best = {
          championName: threat.championName,
          ability: a.ability,
          spellName: a.spellName,
          deaths: a.deaths,
          of: threat.deaths,
        };
      }
    }
  }
  return best;
}
