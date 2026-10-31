import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetMyPlayer, readMyPlayer } from "./my-player";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// The query chain readMyPlayer runs, ending in `limit`, which answers with
// the rows or throws.
const limit = vi.fn();
const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit };
let db: { select: () => typeof chain; delete?: () => { where: (condition: SQL) => Promise<void> } } | null;
vi.mock("@/lib/match-store", () => ({ database: () => db }));

const saved = { puuid: "player-1", region: "na", gameName: "Jaspy", tagLine: "CA1", profileIconId: 29 };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  db = { select: () => chain };
  limit.mockReset();
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readMyPlayer", () => {
  it("returns the marked player", async () => {
    limit.mockResolvedValue([saved]);
    expect(await readMyPlayer("user-1")).toEqual({ ok: true, player: saved });
  });

  it("returns no player when none is marked", async () => {
    limit.mockResolvedValue([]);
    expect(await readMyPlayer("user-1")).toEqual({ ok: true, player: null });
  });

  it("returns no player without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    db = null;
    expect(await readMyPlayer("user-1")).toEqual({ ok: true, player: null });
  });

  // #167: a failed read looked like nothing marked, so "This is me" offered
  // to mark the profile again, and clicking it cleared the saved one.
  it("reports a failed read when the query throws", async () => {
    const error = new Error("connection reset");
    limit.mockRejectedValue(error);
    expect(await readMyPlayer("user-1")).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("reports a failed read when the database is set up but can't connect", async () => {
    db = null;
    expect(await readMyPlayer("user-1")).toEqual({ ok: false });
  });
});

describe("forgetMyPlayer", () => {
  // #167: a page that still shows an old mark sends "clear" for that player,
  // which mustn't clear a different one picked since.
  it("deletes the mark only when it's this player", async () => {
    let condition: SQL | undefined;
    db = { select: () => chain, delete: () => ({ where: async (c: SQL) => void (condition = c) }) };
    expect(await forgetMyPlayer("user-1", "player-1")).toBe(true);
    const query = new PgDialect().sqlToQuery(condition!);
    expect(query.sql).toBe('("user_players"."user_id" = $1 and "user_players"."puuid" = $2)');
    expect(query.params).toEqual(["user-1", "player-1"]);
  });
});
