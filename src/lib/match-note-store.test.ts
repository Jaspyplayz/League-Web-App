import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMatchNote } from "./match-note-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const findFirst = vi.fn();
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ query: { matchNotes: { findFirst } } }),
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  findFirst.mockReset();
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readMatchNote", () => {
  it("returns the saved note", async () => {
    findFirst.mockResolvedValue({ text: "Ward river before 3:15" });
    expect(await readMatchNote("user-1", "NA1_1")).toEqual("Ward river before 3:15");
  });

  it("returns nothing saved when there's no note", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await readMatchNote("user-1", "NA1_1")).toEqual(null);
  });

  it("returns nothing saved without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await readMatchNote("user-1", "NA1_1")).toEqual(null);
  });

  it("reports a failed read when the query throws", async () => {
    const error = new Error("connection reset");
    findFirst.mockRejectedValue(error);
    expect(await readMatchNote("user-1", "NA1_1")).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
