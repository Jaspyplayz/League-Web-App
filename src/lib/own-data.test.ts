import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnData } from "./own-data";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// database() is null without DATABASE_URL, and also when DATABASE_URL is set
// but gives no usable database (see match-store.ts).
let db: object | null;
vi.mock("@/lib/match-store", () => ({ database: () => db }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  db = {};
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readOwnData", () => {
  it("returns what the read found", async () => {
    expect(await readOwnData(async () => "saved", "")).toEqual({ ok: true, value: "saved" });
  });

  it("returns nothing saved without DATABASE_URL, since the feature is off", async () => {
    vi.stubEnv("DATABASE_URL", "");
    db = null;
    expect(await readOwnData(async () => "saved", "")).toEqual({ ok: true, value: "" });
  });

  it("reports a failure when DATABASE_URL gives no usable database", async () => {
    db = null;
    expect(await readOwnData(async () => "saved", "")).toEqual({ ok: false });
  });

  it("reports a failure when the read throws", async () => {
    const error = new Error("connection reset");
    expect(
      await readOwnData(async () => {
        throw error;
      }, ""),
    ).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
