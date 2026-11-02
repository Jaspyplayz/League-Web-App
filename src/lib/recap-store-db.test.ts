// Runs createRecap against a real Postgres, since only a real one shows what
// many requests at the same moment do: a pretend database runs them one after
// another. It needs a throwaway database with the migrations applied and a
// stub of Supabase's auth.users, so it's skipped unless RECAP_TEST_DATABASE_URL
// points at one on this machine whose name has "test" in it (docs/match-recap.md,
// "Testing the cap"). It only adds and deletes its own rows.

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
const USER = "00000000-0000-4000-8000-0000000003a1";
const OTHER_USER = "00000000-0000-4000-8000-0000000003a2";
const PUUID = "player-1";
const CAPPED = `You've asked for ${RECAPS_PER_DAY} recaps today. Try again tomorrow.`;

let db: Db;
vi.mock("@/lib/match-store", () => ({
  database: () => db,
  readCache: (read: (db: Db) => Promise<unknown>) => read(db),
  // The games are already saved, as on a match page someone just opened.
  loadMatch: async (_region: string, matchId: string) => ({ metadata: { matchId } }),
}));
vi.mock("@/lib/match-facts", () => ({ loadMatchFacts: async () => ({ result: "win" }) }));
vi.mock("@/lib/recap", () => ({
  RECAP_MODEL: "claude-haiku-5-5",
  writeRecap: vi.fn(),
}));

const games = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `RECAPTEST_${from + i + 1}`);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const recap = { headline: "You won.", detail: "Overall\tYou won." };

async function triesOf(userId: string): Promise<number> {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from recap_tries where user_id = ${userId}`,
  );
  return row.n;
}

async function addTries(userId: string, n: number, hoursAgo: number) {
  await db.execute(sql`
    insert into recap_tries (user_id, created_at)
    select ${userId}::uuid, now() - make_interval(hours => ${hoursAgo})
    from generate_series(1, ${n})`);
}

// Holds the account's lock from another connection, as a try in another
// request would, until the returned function is called.
async function holdLock(userId: string): Promise<() => Promise<void>> {
  const other = postgres(url!, { max: 1, onnotice: () => {} });
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const done = other.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('recap-tries'), hashtext(${userId}))`;
    locked();
    await released;
  });
  await isLocked;
  return async () => {
    release();
    await done;
    await other.end();
  };
}

describe.skipIf(!url)("createRecap on a throwaway Postgres", () => {
  beforeAll(async () => {
    const { hostname, pathname } = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(hostname) || !/test/i.test(pathname)) {
      throw new Error(
        'RECAP_TEST_DATABASE_URL must point at a database on this machine with "test" in its name',
      );
    }
    // The same pool size as the app (src/db/index.ts).
    db = drizzle({ client: postgres(url!, { prepare: false, max: 5, onnotice: () => {} }), schema });
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  beforeEach(async () => {
    vi.mocked(writeRecap).mockReset();
    // Deleting the two accounts deletes their tries too.
    await db.execute(sql`delete from match_recaps where starts_with(match_id, 'RECAPTEST_')`);
    await db.execute(sql`delete from matches where starts_with(match_id, 'RECAPTEST_')`);
    await db.execute(sql`delete from auth.users where id in (${USER}, ${OTHER_USER})`);
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
      // Claude takes a moment, which is the gap the requests race through.
      await wait(100);
      return recap;
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
    expect(next).toEqual({ status: "failed", message: CAPPED });
  });

  it("counts only the last 24 hours, and deletes the account's older tries", async () => {
    vi.mocked(writeRecap).mockResolvedValue(recap);
    await addTries(USER, RECAPS_PER_DAY - 1, 23);
    await addTries(USER, 5, 25);
    await addTries(OTHER_USER, 3, 25);

    const last = await createRecap("na", "RECAPTEST_1", PUUID, USER);
    const over = await createRecap("na", "RECAPTEST_2", PUUID, USER);

    expect(last).toMatchObject({ status: "written" });
    expect(over).toEqual({ status: "failed", message: CAPPED });
    expect(await triesOf(USER)).toBe(RECAPS_PER_DAY);
    // Another account's old tries wait for that account's next try.
    expect(await triesOf(OTHER_USER)).toBe(3);
  });

  it("turns an account at the cap away at once, even while another of its tries holds the lock", async () => {
    await addTries(USER, RECAPS_PER_DAY, 1);
    const release = await holdLock(USER);

    const started = Date.now();
    const result = await createRecap("na", "RECAPTEST_1", PUUID, USER);
    const took = Date.now() - started;
    await release();

    expect(result).toEqual({ status: "failed", message: CAPPED });
    expect(took).toBeLessThan(1000);
  });

  it("gives up after 3 seconds waiting for the lock, without counting the try", { timeout: 15_000 }, async () => {
    vi.mocked(writeRecap).mockResolvedValue(recap);
    const release = await holdLock(USER);

    const started = Date.now();
    const result = await createRecap("na", "RECAPTEST_1", PUUID, USER);
    const took = Date.now() - started;
    await release();

    expect(result).toEqual({
      status: "failed",
      message: "Couldn't write the recap. Try again in a moment.",
    });
    expect(took).toBeGreaterThanOrEqual(2900);
    expect(took).toBeLessThan(6000);
    expect(writeRecap).not.toHaveBeenCalled();
    expect(await triesOf(USER)).toBe(0);
  });

  it("counts each account on its own", async () => {
    vi.mocked(writeRecap).mockResolvedValue(recap);

    await Promise.all(games(RECAPS_PER_DAY).map((matchId) => createRecap("na", matchId, PUUID, USER)));
    const other = await createRecap("na", games(1, RECAPS_PER_DAY)[0], PUUID, OTHER_USER);

    expect(other).toMatchObject({ status: "written" });
  });

  it("counts two clicks on the same game as two tries, and saves one recap", async () => {
    vi.mocked(writeRecap).mockImplementation(async () => {
      await wait(50);
      return recap;
    });

    await Promise.all([
      createRecap("na", "RECAPTEST_1", PUUID, USER),
      createRecap("na", "RECAPTEST_1", PUUID, USER),
    ]);
    const [saved] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from match_recaps where match_id = 'RECAPTEST_1'`,
    );

    expect(await triesOf(USER)).toBe(2);
    expect(saved.n).toBe(1);
  });
});
