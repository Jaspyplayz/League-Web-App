import { describe, expect, it } from "vitest";
import { game, names, puuid, summonerId, type GameSpec } from "./remap-puuids-fixtures";
import {
  BOT_PUUID,
  buildMap,
  CUTOFF,
  findOldPuuids,
  keyCheckProblems,
  mapFileJson,
  pairGame,
  parseMapFile,
  parseMode,
  rewriteRaw,
  spaceProblem,
  type Anchor,
  type GameResult,
  type MapFile,
  type NewPuuid,
  type OldPuuid,
  type PuuidMap,
} from "./remap-puuids-map";

const oldId = (name: string) => puuid("old", name) as OldPuuid;
const newId = (name: string) => puuid("new", name) as NewPuuid;

const ranked: GameSpec = {
  matchId: "NA1_1",
  platformId: "NA1",
  players: ["jaspy", ...names("p", 9)],
  startedAt: "2026-10-19T20:00:00Z",
};
const botGame: GameSpec = {
  matchId: "NA1_2",
  platformId: "NA1",
  players: ["jaspy", ...names("h", 4), ...Array(5).fill(BOT_PUUID)],
  startedAt: "2026-10-18T20:00:00Z",
  humansOnlyInMetadata: true,
};

function paired(spec: GameSpec, changes: Parameters<typeof game>[2] = {}): GameResult {
  return pairGame(spec.matchId, game(spec, "old"), game(spec, "new", changes));
}

function mapOf(...players: string[]): PuuidMap {
  return new Map(players.map((name) => [oldId(name), newId(name)]));
}

describe("parseMode", () => {
  it("is a dry run unless told otherwise", () => {
    expect(parseMode([])).toEqual({ kind: "dry-run" });
  });

  it("reads the file for --apply and --rollback", () => {
    expect(parseMode(["--apply", "map.json"])).toEqual({ kind: "apply", mapFile: "map.json" });
    expect(parseMode(["--rollback", "backup.jsonl"])).toEqual({
      kind: "rollback",
      backupFile: "backup.jsonl",
    });
  });

  it("refuses anything else instead of falling back to a dry run", () => {
    expect(() => parseMode(["--apply", "a", "--rollback", "b"])).toThrow();
    expect(() => parseMode(["--apply"])).toThrow();
    expect(() => parseMode(["--aply", "map.json"])).toThrow();
    expect(() => parseMode(["map.json"])).toThrow();
  });
});

describe("spaceProblem", () => {
  const MB = 1024 * 1024;

  it("lets the apply run when the database stays under 450 MB", () => {
    expect(spaceProblem({ databaseBytes: 200 * MB, oldRawBytes: 60 * MB })).toBeUndefined();
  });

  it("stops the apply when the extra copies would pass 450 MB", () => {
    expect(spaceProblem({ databaseBytes: 400 * MB, oldRawBytes: 60 * MB })).toBe(
      "The database is 400 MB and the apply needs about 75 MB more, past the 450 MB this script " +
        "allows on the free tier's 500 MB. Make room before applying.",
    );
  });
});

describe("pairGame", () => {
  it("pairs each saved player with the same participant number in Riot's copy", () => {
    const result = paired(ranked);
    expect(result.kind).toBe("paired");
    if (result.kind !== "paired") return;
    expect(result.pairs).toEqual(ranked.players.map((name) => ({ old: oldId(name), new: newId(name) })));
    expect(result.summonerIds["1"]).toBe(summonerId("new", "jaspy"));
  });

  it("skips the bots, who all share one PUUID", () => {
    const result = paired(botGame);
    if (result.kind !== "paired") throw new Error(result.kind);
    expect(result.pairs.map((pair) => pair.old)).toEqual(["jaspy", "h1", "h2", "h3", "h4"].map(oldId));
  });

  it("trusts no pair from a game whose champions or teams differ", () => {
    expect(paired(ranked, { champions: { 3: 999 } })).toMatchObject({
      kind: "mismatch",
      reason: expect.stringContaining("participant 3 played champion"),
    });
    const fresh = game(ranked, "new");
    fresh.info.participants[0].teamId = 200;
    expect(pairGame(ranked.matchId, game(ranked, "old"), fresh)).toMatchObject({
      kind: "mismatch",
      reason: expect.stringContaining("participant 1 was on team 100"),
    });
  });

  it("calls it a mismatch when the copies have different players", () => {
    const fresh = game(ranked, "new");
    fresh.info.participants.pop();
    expect(pairGame(ranked.matchId, game(ranked, "old"), fresh)).toMatchObject({ kind: "mismatch" });

    const swapped = game(ranked, "new");
    swapped.info.participants[2].puuid = BOT_PUUID;
    expect(pairGame(ranked.matchId, game(ranked, "old"), swapped)).toMatchObject({
      kind: "mismatch",
      reason: expect.stringContaining("bot in only one copy"),
    });
  });

  it("calls JSON without players a mismatch instead of throwing", () => {
    expect(pairGame("NA1_9", { info: {} }, game(ranked, "new"))).toMatchObject({ kind: "mismatch" });
    expect(pairGame("NA1_9", game(ranked, "old"), "Not Found")).toMatchObject({ kind: "mismatch" });
  });
});

describe("buildMap", () => {
  it("maps every player seen in any game, once", () => {
    const { map, skips } = buildMap([paired(ranked), paired(botGame)]);
    expect(map).toEqual(mapOf("jaspy", ...names("p", 9), ...names("h", 4)));
    expect(skips).toEqual([]);
  });

  it("puts missing and mismatched games on the skip list with their reason", () => {
    const missing: GameResult = { kind: "missing", matchId: "NA1_3", reason: "Riot has no such game" };
    const { map, skips } = buildMap([paired(ranked, { champions: { 2: 1 } }), missing]);
    expect(map.size).toBe(0);
    expect(skips).toEqual([
      { kind: "mismatch", matchId: "NA1_1", reason: expect.stringContaining("participant 2") },
      missing,
    ]);
  });

  it("leaves out an old PUUID that came back as two different new ones", () => {
    const other = { ...ranked, matchId: "NA1_5" };
    const { map, skips } = buildMap([
      paired(ranked),
      paired(other, { puuids: { p1: puuid("new", "someone-else") } }),
    ]);
    expect(map.has(oldId("p1"))).toBe(false);
    expect(map.get(oldId("p2"))).toBe(newId("p2"));
    expect(skips).toEqual([
      {
        kind: "conflict",
        old: [oldId("p1")],
        new: [newId("p1"), newId("someone-else")],
        matchIds: ["NA1_1", "NA1_5"],
        reason: "one old PUUID came back as 2 different new ones",
      },
    ]);
  });

  it("leaves out two old PUUIDs that came back as the same new one", () => {
    const { map, skips } = buildMap([paired(ranked, { puuids: { p2: puuid("new", "p1") } })]);
    expect(map.has(oldId("p1"))).toBe(false);
    expect(map.has(oldId("p2"))).toBe(false);
    expect(map.size).toBe(8);
    expect(skips).toEqual([
      {
        kind: "conflict",
        old: [oldId("p1"), oldId("p2")],
        new: [newId("p1")],
        matchIds: ["NA1_1"],
        reason: "2 old PUUIDs came back as the same new one",
      },
    ]);
  });
});

describe("keyCheckProblems", () => {
  const recent: GameSpec[] = [
    { matchId: "NA1_90", platformId: "NA1", players: ["jaspy", ...names("t", 9)], startedAt: "2026-10-24T10:00:00Z" },
    { matchId: "NA1_91", platformId: "NA1", players: names("u", 10), startedAt: "2026-10-24T11:00:00Z" },
  ];
  const jaspy: Anchor = { riotId: "Jaspy#CA1", olds: [oldId("jaspy")], news: [newId("jaspy")] };

  function check(riot: "old" | "new" | "other", anchors = [jaspy]) {
    const sent = (spec: GameSpec, saved: "old" | "new") => {
      if (riot === "other") return game(spec, "new", { puuids: Object.fromEntries(spec.players.map((n) => [n, `other-${n}`])) });
      return game(spec, riot === "old" ? saved : "new");
    };
    return keyCheckProblems({
      newKeyGames: recent.map((spec) => ({ matchId: spec.matchId, saved: game(spec, "new"), fresh: sent(spec, "new") })),
      samples: [pairGame(ranked.matchId, game(ranked, "old"), sent(ranked, "old"))],
      anchors,
    });
  }

  it("passes the live site's key", () => {
    expect(check("new")).toEqual([]);
  });

  it("stops a key from the old app, which sends back the old PUUIDs", () => {
    expect(check("old")).toEqual([
      "10 of 10 PUUIDs in old games came back unchanged, so this key belongs to the old Riot app.",
      "Jaspy#CA1's old PUUID came back as a different PUUID from its new-key players row.",
    ]);
  });

  it("stops a key from a third app, whose PUUIDs match neither", () => {
    const problems = check("other");
    expect(problems).toContain(
      "NA1_90, saved since the cutoff, came back with different PUUIDs, so this isn't the key the live site uses.",
    );
    expect(problems).toContain("Jaspy#CA1's old PUUID came back as a different PUUID from its new-key players row.");
  });

  it("needs two recent games, and both players rows of each anchor", () => {
    const problems = keyCheckProblems({
      newKeyGames: [],
      samples: [paired(ranked)],
      anchors: [{ ...jaspy, news: [] }, { riotId: "Hide on bush#KR1", olds: [oldId("faker")], news: [newId("faker")] }],
    });
    expect(problems).toEqual([
      "Only 0 games were saved since the cutoff; the key check needs 2.",
      "Jaspy#CA1 has 0 new-key players rows; expected 1.",
      "Hide on bush#KR1's old PUUID isn't in the map.",
    ]);
  });
});

function differingPaths(a: unknown, b: unknown, path = ""): string[] {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Object.is(a, b) ? [] : [path];
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    differingPaths((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key),
  );
}

describe("rewriteRaw", () => {
  it("changes only the PUUIDs and summoner IDs, everything else stays as it was", () => {
    const saved = game(ranked, "old");
    const before = structuredClone(saved);
    const ids = { "1": summonerId("new", "jaspy"), "2": summonerId("new", "p1") };
    const after = JSON.parse(JSON.stringify(rewriteRaw(saved, mapOf("jaspy", "p1"), ids)));

    expect(saved).toEqual(before);
    expect(differingPaths(before, after).sort()).toEqual(
      [
        "metadata.participants.0",
        "metadata.participants.1",
        "info.participants.0.puuid",
        "info.participants.0.summonerId",
        "info.participants.1.puuid",
        "info.participants.1.summonerId",
      ].sort(),
    );
    expect(after.metadata.participants.slice(0, 3)).toEqual([newId("jaspy"), newId("p1"), oldId("p2")]);
    expect(after.info.participants[1]).toEqual({
      ...before.info.participants[1],
      puuid: newId("p1"),
      summonerId: summonerId("new", "p1"),
    });
  });

  it("goes by value, so the bot game's short metadata list stays in line", () => {
    const saved = game(botGame, "old");
    const after = rewriteRaw(saved, mapOf("h2")) as typeof saved & { metadata: { participants: string[] } };
    expect(after.metadata.participants).toEqual([
      oldId("jaspy"),
      oldId("h1"),
      newId("h2"),
      oldId("h3"),
      oldId("h4"),
    ]);
    expect(after.info.participants.map((p) => p.puuid)).toEqual([
      oldId("jaspy"),
      oldId("h1"),
      newId("h2"),
      oldId("h3"),
      oldId("h4"),
      ...Array(5).fill(BOT_PUUID),
    ]);
  });

  it("returns an equal game when the map knows nobody in it", () => {
    const saved = game(ranked, "old");
    expect(rewriteRaw(saved, mapOf("stranger"))).toEqual(saved);
  });
});

describe("findOldPuuids", () => {
  const find = findOldPuuids(mapOf("jaspy", "p1"));

  it("finds an old PUUID in any field, even inside a longer word", () => {
    const text = JSON.stringify({ note: `see ${oldId("p1")}`, deep: [{ id: `x${oldId("jaspy")}y` }] });
    expect(find(text).sort()).toEqual([oldId("jaspy"), oldId("p1")].sort());
  });

  it("ignores new PUUIDs and old ones the map doesn't know", () => {
    const text = JSON.stringify(rewriteRaw(game(ranked, "old"), mapOf("jaspy", "p1")));
    expect(text).toContain(oldId("p2"));
    expect(find(text)).toEqual([]);
  });

  it("still finds a PUUID with characters Riot doesn't use", () => {
    const odd = "old.player@1" as OldPuuid;
    const findOdd = findOldPuuids(new Map([[odd, "new" as NewPuuid]]));
    expect(findOdd(`{"x":"${odd}"}`)).toEqual([odd]);
    expect(findOdd(`{"x":"old.player@2"}`)).toEqual([]);
  });
});

describe("map file", () => {
  const file: MapFile = {
    cutoff: CUTOFF.toISOString(),
    writtenAt: "2026-10-24T21:00:00.000Z",
    oldPlayers: [oldId("jaspy")],
    oldMatches: 1,
    map: mapOf("jaspy", "p1"),
    summonerIds: new Map([["NA1_1", { "1": "s1" }]]),
    skips: [{ kind: "missing", matchId: "NA1_3", reason: "Riot has no such game" }],
  };

  it("reads back what the dry run wrote", () => {
    expect(parseMapFile(JSON.stringify(mapFileJson(file)))).toEqual(file);
  });

  it("refuses a map that isn't one to one, or maps a PUUID to itself", () => {
    const json = mapFileJson(file);
    const twice = { ...json, pairs: [...json.pairs, [oldId("p2"), newId("p1")]] };
    expect(() => parseMapFile(JSON.stringify(twice))).toThrow("two old ones");
    const itself = { ...json, pairs: [[oldId("p2"), oldId("p2")]] };
    expect(() => parseMapFile(JSON.stringify(itself))).toThrow("to themselves");
  });
});
