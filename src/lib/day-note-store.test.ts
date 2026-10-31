import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDayNotes } from "./day-note-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const findMany = vi.fn();
let connects = true;
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => {
    if (!connects) throw new Error("can't connect");
    return { query: { dayNotes: { findMany } } };
  },
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  findMany.mockReset();
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
