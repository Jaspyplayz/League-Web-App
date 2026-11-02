import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tables } from "@/db";
import { readDayNotes, writeDayNote } from "./day-note-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// The fake database records what it was asked, so the tests can check which
// rows a query names. The server's connection skips row level security
// (docs/database.md), so the account filter is the only thing keeping one
// account's notes from another's (JAS-256).
const findMany = vi.fn();
const deleteWhere = vi.fn();
const upsert = vi.fn();
let connects = true;
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => {
    if (!connects) throw new Error("can't connect");
    return {
      query: { dayNotes: { findMany } },
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
  findMany.mockReset();
  deleteWhere.mockReset();
  upsert.mockReset();
  connects = true;
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readDayNotes", () => {
  it("returns the saved notes by day", async () => {
    findMany.mockResolvedValue([
      { day: "2026-10-20", text: "Stopped after two losses" },
      { day: "2026-10-22", text: "Full clears on Viego" },
    ]);
    expect(await readDayNotes("user-1", "2026-09-25")).toEqual({
      ok: true,
      byDay: {
        "2026-10-20": "Stopped after two losses",
        "2026-10-22": "Full clears on Viego",
      },
    });
  });

  // Without the account filter, every account's notes on those days would
  // show on your By day.
  it("reads only this account's notes, from that day on", async () => {
    findMany.mockResolvedValue([]);
    await readDayNotes("user-1", "2026-09-25");
    const query = new PgDialect().sqlToQuery(findMany.mock.calls[0][0].where);
    expect(query.sql).toBe('("day_notes"."user_id" = $1 and "day_notes"."day" >= $2)');
    expect(query.params).toEqual(["user-1", "2026-09-25"]);
  });

  it("returns nothing saved when there are no notes", async () => {
    findMany.mockResolvedValue([]);
    expect(await readDayNotes("user-1", "2026-09-25")).toEqual({ ok: true, byDay: {} });
  });

  it("returns nothing saved without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await readDayNotes("user-1", "2026-09-25")).toEqual({ ok: true, byDay: {} });
  });

  // JAS-71: like readMyPlayer, a DATABASE_URL that gives no usable database
  // (getDb throws, for example on a malformed URL) isn't the same as no notes.
  it("reports a failed read when DATABASE_URL gives no usable database", async () => {
    connects = false;
    expect(await readDayNotes("user-1", "2026-09-25")).toEqual({ ok: false });
  });

  it("reports a failed read when the query throws", async () => {
    const error = new Error("connection reset");
    findMany.mockRejectedValue(error);
    expect(await readDayNotes("user-1", "2026-09-25")).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("writeDayNote", () => {
  // Without the account filter, clearing your note would delete every
  // account's note on that day, and there's no undo.
  it("clears only this account's note when the text is empty", async () => {
    expect(await writeDayNote("user-1", "2026-10-20", "")).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalledOnce();
    const [table, condition] = deleteWhere.mock.calls[0];
    expect(table).toBe(tables.dayNotes);
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toBe('("day_notes"."user_id" = $1 and "day_notes"."day" = $2)');
    expect(query.params).toEqual(["user-1", "2026-10-20"]);
  });

  // The conflict target is the account and the day, so saving replaces only
  // this account's note on it.
  it("saves the note for this account, replacing its earlier one", async () => {
    expect(await writeDayNote("user-1", "2026-10-20", "Stopped after two losses")).toBe(true);
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      tables.dayNotes,
      { userId: "user-1", day: "2026-10-20", text: "Stopped after two losses" },
      {
        target: [tables.dayNotes.userId, tables.dayNotes.day],
        set: { text: "Stopped after two losses", updatedAt: expect.any(Date) },
      },
    );
  });
});
