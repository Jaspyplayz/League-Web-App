// The pure half of `npm run remap-puuids` (scripts/remap-puuids.ts): pairing
// each saved game with Riot's copy of it today, building the old -> new PUUID
// map from those pairs, and rewriting a game's JSON through the map. Kept
// apart so it can be tested without Riot or a database.
//
// Riot encrypts PUUIDs separately for each app. After the site moved to a key
// from another app, every player has a new PUUID, while the games saved before
// the move still hold the old ones (issue #154). Downloading an old game again
// gives both PUUIDs of all its players, matched up by participant number.

import { parseArgs } from "node:util";
import { z } from "zod";

// Both kinds are strings, and handing an old one to code that expects a new
// one is exactly the bug this script fixes, so the compiler keeps them apart.
export type OldPuuid = string & { readonly __brand: "OldPuuid" };
export type NewPuuid = string & { readonly __brand: "NewPuuid" };
export type PuuidMap = ReadonlyMap<OldPuuid, NewPuuid>;
export type Pair = { old: OldPuuid; new: NewPuuid };

// Games saved before this were saved with the old app's key. The last old-key
// write was 2026-10-20 18:51 UTC and the first new-key one this minute.
export const CUTOFF = new Date("2026-10-24T09:00:00Z");

// Every bot in a bot game has this PUUID instead of a real one.
export const BOT_PUUID = "BOT";

// How many games saved since the cutoff the key check downloads again.
export const NEW_KEY_GAMES = 2;

export type Mode =
  | { kind: "dry-run" }
  | { kind: "apply"; mapFile: string }
  | { kind: "rollback"; backupFile: string };

export function parseMode(argv: string[]): Mode {
  const { values } = parseArgs({
    args: argv,
    options: { apply: { type: "string" }, rollback: { type: "string" } },
  });
  if (values.apply !== undefined && values.rollback !== undefined) {
    throw new Error("Use --apply or --rollback, not both");
  }
  if (values.apply !== undefined) return { kind: "apply", mapFile: values.apply };
  if (values.rollback !== undefined) return { kind: "rollback", backupFile: values.rollback };
  return { kind: "dry-run" };
}

// What the remap reads from each player in a game. The rest of Riot's JSON
// is left as it is.
const slotSchema = z.object({
  participantId: z.number(),
  puuid: z.string(),
  championId: z.number(),
  teamId: z.number(),
  summonerId: z.string().optional(),
});
const gameSchema = z.object({ info: z.object({ participants: z.array(slotSchema) }) });
type Slot = z.infer<typeof slotSchema>;

export type GameResult =
  | {
      kind: "paired";
      matchId: string;
      pairs: Pair[];
      // Participant number -> summoner ID, from Riot's copy.
      summonerIds: Record<string, string>;
    }
  | { kind: "mismatch" | "missing"; matchId: string; reason: string };

// Pairs each player in the saved copy of a game with the same participant
// number in Riot's copy. If any champion or team differs, the two copies
// can't be trusted to be the same game, so none of its pairs are used. The
// summoner ID isn't checked: no code reads it, and Riot sometimes sends it
// blank.
export function pairGame(matchId: string, saved: unknown, fresh: unknown): GameResult {
  const mismatch = (reason: string): GameResult => ({ kind: "mismatch", matchId, reason });
  const before = slotsOf(saved);
  const after = slotsOf(fresh);
  if (typeof before === "string") return mismatch(`saved copy: ${before}`);
  if (typeof after === "string") return mismatch(`Riot's copy: ${after}`);
  if (before.size !== after.size) {
    return mismatch(`${before.size} players saved, ${after.size} in Riot's copy`);
  }

  const pairs: Pair[] = [];
  for (const [id, old] of before) {
    const now = after.get(id);
    if (!now) return mismatch(`Riot's copy has no participant ${id}`);
    if (now.championId !== old.championId) {
      return mismatch(`participant ${id} played champion ${old.championId}, Riot's copy says ${now.championId}`);
    }
    if (now.teamId !== old.teamId) {
      return mismatch(`participant ${id} was on team ${old.teamId}, Riot's copy says ${now.teamId}`);
    }
    if (old.puuid === BOT_PUUID || now.puuid === BOT_PUUID) {
      if (old.puuid !== now.puuid) return mismatch(`participant ${id} is a bot in only one copy`);
      continue;
    }
    pairs.push({ old: old.puuid as OldPuuid, new: now.puuid as NewPuuid });
  }

  const summonerIds: Record<string, string> = {};
  for (const [id, now] of after) {
    if (now.summonerId !== undefined) summonerIds[id] = now.summonerId;
  }
  return { kind: "paired", matchId, pairs, summonerIds };
}

// A game's players by participant number, or what's wrong with its JSON.
function slotsOf(raw: unknown): Map<number, Slot> | string {
  const parsed = gameSchema.safeParse(raw);
  if (!parsed.success) return "a player is missing participantId, puuid, championId or teamId";
  const list = parsed.data.info.participants;
  const slots = new Map(list.map((slot) => [slot.participantId, slot]));
  if (slots.size !== list.length) return "two players share a participant number";
  return slots;
}

export type Skip =
  | { kind: "mismatch" | "missing"; matchId: string; reason: string }
  | { kind: "conflict"; old: OldPuuid[]; new: NewPuuid[]; matchIds: string[]; reason: string };

export type RemapPlan = {
  map: PuuidMap;
  skips: Skip[];
  // Match ID -> participant number -> summoner ID, for the games Riot sent.
  summonerIds: ReadonlyMap<string, Record<string, string>>;
};

// Puts every game's pairs together. Each old PUUID must come back as one new
// PUUID in every game it's in, and each new PUUID must belong to one old one.
// A PUUID that breaks either rule is left out of the map with everything it
// was paired with, and goes on the skip list.
export function buildMap(games: Iterable<GameResult>): RemapPlan {
  const skips: Skip[] = [];
  const summonerIds = new Map<string, Record<string, string>>();
  const seen: (Pair & { matchId: string })[] = [];
  const newsOf = new Map<OldPuuid, Set<NewPuuid>>();
  const oldsOf = new Map<NewPuuid, Set<OldPuuid>>();

  for (const game of games) {
    if (game.kind !== "paired") {
      skips.push({ kind: game.kind, matchId: game.matchId, reason: game.reason });
      continue;
    }
    summonerIds.set(game.matchId, game.summonerIds);
    for (const pair of game.pairs) {
      seen.push({ ...pair, matchId: game.matchId });
      addTo(newsOf, pair.old, pair.new);
      addTo(oldsOf, pair.new, pair.old);
    }
  }

  const gamesWith = (has: (pair: Pair) => boolean) => [
    ...new Set(seen.filter(has).map((pair) => pair.matchId)),
  ];
  for (const [old, news] of newsOf) {
    if (news.size === 1) continue;
    skips.push({
      kind: "conflict",
      old: [old],
      new: [...news],
      matchIds: gamesWith((pair) => pair.old === old),
      reason: `one old PUUID came back as ${news.size} different new ones`,
    });
  }
  for (const [now, olds] of oldsOf) {
    if (olds.size === 1) continue;
    skips.push({
      kind: "conflict",
      old: [...olds],
      new: [now],
      matchIds: gamesWith((pair) => pair.new === now),
      reason: `${olds.size} old PUUIDs came back as the same new one`,
    });
  }

  const map = new Map<OldPuuid, NewPuuid>();
  for (const [old, news] of newsOf) {
    const [now] = news;
    if (news.size === 1 && oldsOf.get(now)?.size === 1) map.set(old, now);
  }
  return { map, skips, summonerIds };
}

function addTo<K, V>(index: Map<K, Set<V>>, key: K, value: V) {
  const values = index.get(key) ?? new Set<V>();
  values.add(value);
  index.set(key, values);
}

// Old PUUIDs that came back unchanged. Under the live site's key there are
// none: an old-app key sends back the old PUUIDs.
export function mapsToItself(map: PuuidMap): OldPuuid[] {
  return [...map].filter(([old, now]) => sameText(old, now)).map(([old]) => old);
}

// The brands make `old === now` a type error, which is the point everywhere
// except these two checks for a PUUID that didn't change.
function sameText(a: string, b: string) {
  return a === b;
}

// A player whose old-key and new-key players rows are both known, such as
// Jaspy#CA1. The map has to agree with them.
export type Anchor = { riotId: string; olds: OldPuuid[]; news: NewPuuid[] };

export type KeyCheck = {
  // Games saved since the cutoff, each with Riot's copy of it now.
  newKeyGames: { matchId: string; saved: unknown; fresh: unknown }[];
  // Old-key games the anchors played, paired with Riot's copy.
  samples: GameResult[];
  anchors: Anchor[];
};

// Everything that says this isn't the live site's key. A key from the old
// app would send back the old PUUIDs, every player would map to themselves,
// and every other check would still pass, so the dry run stops on any of
// these before it downloads the rest.
export function keyCheckProblems({ newKeyGames, samples, anchors }: KeyCheck): string[] {
  const problems: string[] = [];
  if (newKeyGames.length < NEW_KEY_GAMES) {
    problems.push(
      `Only ${newKeyGames.length} games were saved since the cutoff; the key check needs ${NEW_KEY_GAMES}.`,
    );
  }
  for (const game of newKeyGames) {
    // Here "old" is just the saved copy: these games already have new PUUIDs.
    const result = pairGame(game.matchId, game.saved, game.fresh);
    if (result.kind !== "paired") {
      problems.push(`${game.matchId} (saved since the cutoff): ${result.reason}.`);
    } else if (result.pairs.some((pair) => !sameText(pair.old, pair.new))) {
      problems.push(
        `${game.matchId}, saved since the cutoff, came back with different PUUIDs, so this isn't the key the live site uses.`,
      );
    }
  }
  for (const sample of samples) {
    if (sample.kind !== "paired") problems.push(`${sample.matchId}: ${sample.reason}.`);
  }
  const { map } = buildMap(samples);
  const unchanged = mapsToItself(map);
  if (unchanged.length > 0) {
    problems.push(
      `${unchanged.length} of ${map.size} PUUIDs in old games came back unchanged, so this key belongs to the old Riot app.`,
    );
  }
  problems.push(...anchorProblems(map, anchors));
  return problems;
}

export function anchorProblems(map: PuuidMap, anchors: Anchor[]): string[] {
  return anchors.flatMap(({ riotId, olds, news }) => {
    if (olds.length !== 1) return [`${riotId} has ${olds.length} old-key players rows; expected 1.`];
    if (news.length !== 1) return [`${riotId} has ${news.length} new-key players rows; expected 1.`];
    const now = map.get(olds[0]);
    if (now === undefined) return [`${riotId}'s old PUUID isn't in the map.`];
    if (now !== news[0]) {
      return [`${riotId}'s old PUUID came back as a different PUUID from its new-key players row.`];
    }
    return [];
  });
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Swaps the old PUUIDs in a saved game's JSON for new ones. It goes by value,
// not by position: any PUUID the map knows is replaced wherever the game
// lists it, so a game whose own download failed is still fixed for players
// the map learned from other games, and the bot game's short
// metadata.participants list can't shift out of line. `summonerIds` comes
// from Riot's copy of this game. Nothing else changes, and `raw` itself is
// left untouched.
export function rewriteRaw(
  raw: unknown,
  map: PuuidMap,
  summonerIds: Readonly<Record<string, string>> = {},
): unknown {
  if (!isObject(raw)) return raw;
  const swap = (value: unknown) =>
    typeof value === "string" ? (map.get(value as OldPuuid) ?? value) : value;

  let out: JsonObject = raw;
  const { metadata, info } = raw;
  if (isObject(metadata) && Array.isArray(metadata.participants)) {
    out = { ...out, metadata: { ...metadata, participants: metadata.participants.map(swap) } };
  }
  if (isObject(info) && Array.isArray(info.participants)) {
    const participants = info.participants.map((player: unknown) => {
      if (!isObject(player)) return player;
      const copy = { ...player };
      if ("puuid" in copy) copy.puuid = swap(copy.puuid);
      const summonerId = summonerIds[String(copy.participantId)];
      if (summonerId !== undefined) copy.summonerId = summonerId;
      return copy;
    });
    out = { ...out, info: { ...info, participants } };
  }
  return out;
}

// Riot's PUUIDs use only letters, digits, "-" and "_", so only a run of those
// characters can hold one.
const PLAIN = /^[\w-]+$/;
const RUNS = /[\w-]+/g;

// Returns a function that lists every old PUUID from the map found anywhere
// in a game's JSON text, in any field. Only the runs of PUUID characters are
// checked, which keeps it quick on 60 KB games.
export function findOldPuuids(map: PuuidMap): (text: string) => OldPuuid[] {
  const olds = [...map.keys()];
  const plain = new Set(olds.filter((old) => PLAIN.test(old)));
  const other = olds.filter((old) => !plain.has(old));
  const lengths = [...new Set([...plain].map((old) => old.length))];

  return (text) => {
    const found = new Set(other.filter((old) => text.includes(old)));
    for (const run of text.match(RUNS) ?? []) {
      for (const length of lengths) {
        for (let i = 0; i + length <= run.length; i++) {
          const piece = run.slice(i, i + length) as OldPuuid;
          if (plain.has(piece)) found.add(piece);
        }
      }
    }
    return [...found];
  };
}

// The file the dry run writes and --apply reads, in .cache/puuid-remap/.
export type MapFile = {
  cutoff: string;
  writtenAt: string;
  // Every old-key players row at the time of the dry run.
  oldPlayers: OldPuuid[];
  // How many games were saved before the cutoff.
  oldMatches: number;
  map: PuuidMap;
  summonerIds: ReadonlyMap<string, Record<string, string>>;
  skips: Skip[];
};

const oldPuuid = z.string().transform((value) => value as OldPuuid);
const newPuuid = z.string().transform((value) => value as NewPuuid);

const mapFileSchema = z.object({
  version: z.literal(1),
  cutoff: z.string(),
  writtenAt: z.string(),
  oldPlayers: z.array(oldPuuid),
  oldMatches: z.number(),
  pairs: z.array(z.tuple([oldPuuid, newPuuid])),
  summonerIds: z.record(z.string(), z.record(z.string(), z.string())),
  skips: z.array(
    z.union([
      z.object({
        kind: z.enum(["mismatch", "missing"]),
        matchId: z.string(),
        reason: z.string(),
      }),
      z.object({
        kind: z.literal("conflict"),
        old: z.array(oldPuuid),
        new: z.array(newPuuid),
        matchIds: z.array(z.string()),
        reason: z.string(),
      }),
    ]),
  ),
});

export function mapFileJson(file: MapFile): z.input<typeof mapFileSchema> {
  return {
    version: 1,
    cutoff: file.cutoff,
    writtenAt: file.writtenAt,
    oldPlayers: file.oldPlayers,
    oldMatches: file.oldMatches,
    pairs: [...file.map],
    summonerIds: Object.fromEntries(file.summonerIds),
    skips: file.skips,
  };
}

// The map file sits on disk between the dry run and --apply, so it's checked
// again here rather than trusted: one-to-one, and nobody mapped to themselves.
export function parseMapFile(text: string): MapFile {
  const file = mapFileSchema.parse(JSON.parse(text));
  const map = new Map<OldPuuid, NewPuuid>();
  const news = new Set<string>();
  for (const [old, now] of file.pairs) {
    if (map.has(old)) throw new Error(`Map file lists old PUUID ${old} twice`);
    if (news.has(now)) throw new Error(`Map file gives new PUUID ${now} to two old ones`);
    map.set(old, now);
    news.add(now);
  }
  const unchanged = mapsToItself(map);
  if (unchanged.length > 0) {
    throw new Error(`Map file maps ${unchanged.length} PUUIDs to themselves; that's the old app's key`);
  }
  return {
    cutoff: file.cutoff,
    writtenAt: file.writtenAt,
    oldPlayers: file.oldPlayers,
    oldMatches: file.oldMatches,
    map,
    summonerIds: new Map(Object.entries(file.summonerIds)),
    skips: file.skips,
  };
}
