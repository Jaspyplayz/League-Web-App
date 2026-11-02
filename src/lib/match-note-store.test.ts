import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tables } from "@/db";
import { readMatchNote, writeMatchNote } from "./match-note-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// The fake database records what it was asked, so the tests can check which
// rows a query names. The server's connection skips row level security
// (docs/database.md), so the account filter is the only thing keeping one
// account's note from another's (JAS-256).
const findFirst = vi.fn();
const deleteWhere = vi.fn();
const upsert = vi.fn();
let connects = true;
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => {
    if (!connects) throw new Error("can't connect");
    return {
      query: { matchNotes: { findFirst } },
      delete: (table: unknown) => ({ where: (condition: SQL) => deleteWhere(table, condition) }),
      insert: (table: unknown) => ({
        values: (values: unknown) => ({
          onConflictDoUpdate: (conflict: unknown) => upsert(table, values, conflict),
        }),
      }),
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  findFirst.mockReset();
  deleteWhere.mockReset();
  upsert.mockReset();
  connects = true;
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readMatchNote", () => {
  it("returns the saved note", async () => {
    findFirst.mockResolvedValue({ text: "Ward river before 3:15" });
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({
      ok: true,
      text: "Ward river before 3:15",
    });
  });

  // Without the account filter, the first note anyone wrote on this game
  // would show on your match page.
  it("reads only this account's note on this game", async () => {
    findFirst.mockResolvedValue(undefined);
    await readMatchNote("user-1", "NA1_1");
    const query = new PgDialect().sqlToQuery(findFirst.mock.calls[0][0].where);
    expect(query.sql).toBe('("match_notes"."user_id" = $1 and "match_notes"."match_id" = $2)');
    expect(query.params).toEqual(["user-1", "NA1_1"]);
  });

  it("returns nothing saved when there's no note", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: true, text: "" });
  });

  it("returns nothing saved without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: true, text: "" });
  });

  // JAS-71: like readMyPlayer, a DATABASE_URL that gives no usable database
  // (getDb throws, for example on a malformed URL) isn't the same as no note.
  it("reports a failed read when DATABASE_URL gives no usable database", async () => {
    connects = false;
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: false });
  });

  it("reports a failed read when the query throws", async () => {
    const error = new Error("connection reset");
    findFirst.mockRejectedValue(error);
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("writeMatchNote", () => {
  // Without the account filter, clearing your note would delete every
  // account's note on this game, and there's no undo.
  it("clears only this account's note when the text is empty", async () => {
    expect(await writeMatchNote("user-1", "NA1_1", "")).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalledOnce();
    const [table, condition] = deleteWhere.mock.calls[0];
    expect(table).toBe(tables.matchNotes);
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toBe('("match_notes"."user_id" = $1 and "match_notes"."match_id" = $2)');
    expect(query.params).toEqual(["user-1", "NA1_1"]);
  });

  // The conflict target is the account and the game, so saving replaces only
  // this account's note on it.
  it("saves the note for this account, replacing its earlier one", async () => {
    expect(await writeMatchNote("user-1", "NA1_1", "Ward river before 3:15")).toBe(true);
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      tables.matchNotes,
      { userId: "user-1", matchId: "NA1_1", text: "Ward river before 3:15" },
      {
        target: [tables.matchNotes.userId, tables.matchNotes.matchId],
        set: { text: "Ward river before 3:15", updatedAt: expect.any(Date) },
      },
    );
  });
});
