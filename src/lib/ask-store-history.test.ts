import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readQuestions } from "./ask-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/ask", () => ({ answerQuestion: vi.fn(), ASK_MODEL: "claude-sonnet-5-5" }));

// The query chain readQuestions runs, ending in `limit`, which answers with
// the rows or throws. ask-store.test.ts covers asking; this file covers
// reading the history back.
const limit = vi.fn();
const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit };
let db: { select: () => typeof chain } | null;
vi.mock("@/lib/match-store", () => ({ database: () => db }));

const askedAt = new Date("2026-10-30T12:00:00Z");
const row = { id: "q-1", question: "Why do I lose?", answer: "You die early.", games: [], askedAt };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  db = { select: () => chain };
  limit.mockReset();
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readQuestions", () => {
  it("returns the answered questions", async () => {
    limit.mockResolvedValue([row]);
    expect(await readQuestions("user-1", "player-1")).toEqual({ ok: true, questions: [row] });
  });

  it("returns no questions when none were asked", async () => {
    limit.mockResolvedValue([]);
    expect(await readQuestions("user-1", "player-1")).toEqual({ ok: true, questions: [] });
  });

  it("returns no questions without a database, not a failure", async () => {
    vi.stubEnv("DATABASE_URL", "");
    db = null;
    expect(await readQuestions("user-1", "player-1")).toEqual({ ok: true, questions: [] });
  });

  // #167: a failed read showed an empty history, as if nothing was asked.
  it("reports a failed read when the query throws", async () => {
    const error = new Error("connection reset");
    limit.mockRejectedValue(error);
    expect(await readQuestions("user-1", "player-1")).toEqual({ ok: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("reports a failed read when the database is set up but can't connect", async () => {
    db = null;
    expect(await readQuestions("user-1", "player-1")).toEqual({ ok: false });
  });
});
