// Runs createRecap against a real Postgres, since only a real one shows what
// many requests at the same moment do: a pretend database runs them one after
// another. It needs a throwaway database with the migrations applied and a
// stub of Supabase's auth.users, so it's skipped unless RECAP_TEST_DATABASE_URL
// points at one on this machine (docs/match-recap.md, "Testing the cap").

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { writeRecap } from "@/lib/recap";
import { createRecap, RECAPS_PER_DAY } from "./recap-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const url = process.env.RECAP_TEST_DATABASE_URL;
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
const PUUID = "player-1";

let db: Db;
vi.mock("@/lib/match-store", () => ({
  database: () => db,
  readCache: (read: (db: Db) => Promise<unknown>) => read(db),
  // The games are already saved, as on a match page someone just opened.
  loadMatch: async (_region: string, matchId: string) => ({ metadata: { matchId } }),
}));
vi.mock("@/lib/match-facts", () => ({ loadMatchFacts: async () => ({ result: "win" }) }));
// Claude takes a moment, which is the gap the requests race through.
vi.mock("@/lib/recap", () => ({
  RECAP_MODEL: "claude-haiku-5-5",
  writeRecap: vi.fn(),
}));

const games = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `NA1_${from + i + 1}`);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!url)("createRecap on a throwaway Postgres", () => {
  beforeAll(async () => {
    if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url!)) {
      throw new Error("RECAP_TEST_DATABASE_URL must point at a local throwaway database");
    }
    db = drizzle({ client: postgres(url!, { prepare: false, max: 10, onnotice: () => {} }), schema });
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  beforeEach(async () => {
    vi.mocked(writeRecap).mockReset();
    await db.execute(sql`truncate match_recaps, matches cascade`);
    await db.execute(sql`delete from auth.users`);
    await db.execute(sql`insert into auth.users (id) values (${USER}), (${OTHER_USER})`);
    // match_recaps needs each game in matches.
    for (const matchId of games(60)) {
      await db.execute(sql`
        insert into matches (match_id, platform_id, queue_id, game_version, game_start_at, duration_s, raw)
        values (${matchId}, 'NA1', 420, '16.20.1', now(), 1800, '{}')`);
    }
  });

  it("calls Claude at most RECAPS_PER_DAY times when one account asks for many games at once", async () => {
    vi.mocked(writeRecap).mockImplementation(async () => {
      await wait(100);
      return { headline: "You won.", detail: "Overall\tYou won." };
    });

    const results = await Promise.all(
      games(RECAPS_PER_DAY + 10).map((matchId) => createRecap("na", matchId, PUUID, USER)),
    );

    expect(vi.mocked(writeRecap).mock.calls.length).toBe(RECAPS_PER_DAY);
    expect(results.filter((r) => r.status === "written")).toHaveLength(RECAPS_PER_DAY);
    expect(results.filter((r) => r.status === "failed")).toHaveLength(10);
  });

  it("counts tries Claude couldn't finish toward the day", async () => {
    vi.mocked(writeRecap)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("overloaded"))
      .mockResolvedValue(null);

    for (const matchId of games(RECAPS_PER_DAY)) {
      expect(await createRecap("na", matchId, PUUID, USER)).toMatchObject({ status: "failed" });
    }
    const calls = vi.mocked(writeRecap).mock.calls.length;
    const next = await createRecap("na", games(1, RECAPS_PER_DAY)[0], PUUID, USER);

    expect(calls).toBe(RECAPS_PER_DAY);
    expect(vi.mocked(writeRecap).mock.calls.length).toBe(calls);
    expect(next).toEqual({
      status: "failed",
      message: `You've asked for ${RECAPS_PER_DAY} recaps today. Try again tomorrow.`,
    });
  });

  it("counts each account on its own", async () => {
    vi.mocked(writeRecap).mockResolvedValue({ headline: "You won.", detail: "Overall\tYou won." });

    await Promise.all(games(RECAPS_PER_DAY).map((matchId) => createRecap("na", matchId, PUUID, USER)));
    const other = await createRecap("na", games(1, RECAPS_PER_DAY)[0], PUUID, OTHER_USER);

    expect(other).toMatchObject({ status: "written" });
  });

  it("counts two clicks on the same game as two tries, and keeps one recap", async () => {
    vi.mocked(writeRecap).mockImplementation(async () => {
      await wait(50);
      return { headline: "You won.", detail: "Overall\tYou won." };
    });

    const [first, second] = await Promise.all([
      createRecap("na", "NA1_1", PUUID, USER),
      createRecap("na", "NA1_1", PUUID, USER),
    ]);
    const rows = await db.execute(sql`select count(*)::int as n from match_recaps`);

    expect([first.status, second.status]).toEqual(["written", "written"]);
    expect(rows[0]).toEqual({ n: 1 });
    expect(vi.mocked(writeRecap).mock.calls.length).toBe(2);
  });
});
