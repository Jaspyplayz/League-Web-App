import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMatchNote } from "./match-note-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const findFirst = vi.fn();
let connects = true;
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => {
    if (!connects) throw new Error("can't connect");
    return { query: { matchNotes: { findFirst } } };
  },
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  findFirst.mockReset();
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

  it("returns nothing saved when there's no note", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: true, text: "" });
  });

  it("returns nothing saved without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: true, text: "" });
  });

  // JAS-71: like readMyPlayer, a database that's set up but can't be
  // reached isn't the same as no note.
  it("reports a failed read when the database can't be reached", async () => {
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
