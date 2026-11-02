import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { refresh } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "@/lib/profile-store";
import { updateProfileAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// The Riot calls and the other action's module, which these tests don't reach.
vi.mock("@/lib/riot/api", () => ({}));
vi.mock("@/lib/match-builds", () => ({}));

// Stands in for Postgres's players table. Like the real one, it refuses a
// query whose text holds a NUL character; anything else finds no saved
// player, so updateProfile answers "updated".
const findPlayer = vi.fn(async ({ where }: { where: SQL }) => {
  const { params } = new PgDialect().sqlToQuery(where);
  if (params.some((param) => typeof param === "string" && param.includes("\u0000"))) {
    throw new Error('invalid byte sequence for encoding "UTF8": 0x00');
  }
  return undefined;
});
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ query: { players: { findFirst: findPlayer } } }),
}));

const refused = { status: "failed", kind: "not-found" };

// Made up, since the repo is public: 78 characters like Riot's PUUIDs, with
// letters, digits, "-" and "_".
const MADE_UP_PUUID = "Ab1-_".repeat(15) + "Cd2";

// The golden games' PUUIDs, read from the files so the format is checked
// against whatever they hold.
function fixturePuuids(): string[] {
  const dir = join(process.cwd(), "src/lib/analyzer/fixtures");
  const ids = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const game: { match: { metadata: { participants: string[] } } } = JSON.parse(
        readFileSync(join(dir, name), "utf8"),
      );
      return game.match.metadata.participants;
    });
  return [...new Set(ids)];
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  findPlayer.mockClear();
  vi.mocked(Sentry.captureException).mockReset();
  vi.mocked(refresh).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateProfileAction", () => {
  // Without the check, this is what a NUL did: the query failed and the
  // error went to Sentry.
  it("files a Sentry error when a NUL reaches the database", async () => {
    await updateProfile("na", "\u0000");
    expect(findPlayer).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  // JAS-214: so the action refuses an ID that can't be a PUUID before it
  // asks the database.
  it.each([
    ["a NUL", "\u0000"],
    ["a Riot-shaped ID with a NUL in it", `${MADE_UP_PUUID.slice(0, 39)}\u0000${MADE_UP_PUUID.slice(40)}`],
    ["an empty ID", ""],
    ["an ID over 100 characters", "x".repeat(101)],
    ["an ID with a space", "player 1"],
    ["an ID ending in a line break", "player-1\n"],
    ["an ID with a slash and dots", "../player-1"],
    ["an ID with a non-ASCII letter", "playér-1"],
    ["a number", 42 as unknown as string],
  ])("refuses %s without asking the database", async (_name, puuid) => {
    expect(await updateProfileAction("na", puuid)).toEqual(refused);
    expect(findPlayer).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([...fixturePuuids(), MADE_UP_PUUID])("updates %s", async (puuid) => {
    expect(await updateProfileAction("na", puuid)).toEqual({ status: "updated" });
    expect(findPlayer).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("refuses a region Turnpoint doesn't know, even with a good PUUID", async () => {
    expect(await updateProfileAction("moon", MADE_UP_PUUID)).toEqual(refused);
    expect(findPlayer).not.toHaveBeenCalled();
  });
});
