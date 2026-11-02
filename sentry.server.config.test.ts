import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it, vi } from "vitest";
import * as schema from "./src/db/schema";
import "./sentry.server.config";

// Loading the config calls Sentry.init; this keeps the options it was given.
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  httpIntegration: vi.fn((options: object) => ({ name: "Http", options })),
}));

const options = vi.mocked(Sentry.init).mock.calls[0][0];

// Drizzle without a connection: it builds each query's SQL and values from
// the real tables, the way it does for the stores.
const db = drizzle.mock({ schema });
const ACCOUNT_ID = "ACCOUNT-ID-MARKER";
const PUUID = "PUUID-MARKER";

// The error Drizzle throws when a query fails, wrapping the driver's error.
function failed(query: { toSQL(): { sql: string; params: unknown[] } }): DrizzleQueryError {
  const { sql, params } = query.toSQL();
  return new DrizzleQueryError(sql, params, new Error("connect ECONNREFUSED 127.0.0.1:6543"));
}

// The report Sentry builds from it: the cause, then the error itself.
function reportOf(error: DrizzleQueryError): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        { type: "Error", value: (error.cause as Error).message },
        { type: "Error", value: error.message },
      ],
    },
  };
}

async function send(event: ErrorEvent) {
  return options.beforeSend?.(event, {});
}

describe("Sentry's server setup", () => {
  it.each([
    {
      // Notes can run over several lines, so the marker is on the second.
      write: "a match note",
      marker: "PRIVATE-NOTE-MARKER",
      query: db
        .insert(schema.matchNotes)
        .values({ userId: ACCOUNT_ID, matchId: "NA1_1", text: "Ward river first\nPRIVATE-NOTE-MARKER" }),
    },
    {
      write: "a day note",
      marker: "DAY-NOTE-MARKER",
      query: db.insert(schema.dayNotes).values({ userId: ACCOUNT_ID, day: "2026-11-01", text: "DAY-NOTE-MARKER" }),
    },
    {
      write: "an Ask question",
      marker: "ASK-QUESTION-MARKER",
      query: db.insert(schema.askQuestions).values({
        userId: ACCOUNT_ID,
        puuid: PUUID,
        question: "ASK-QUESTION-MARKER",
        answer: null,
        games: [],
        model: "model",
        costMicros: 500_000,
      }),
    },
    {
      write: "an Ask answer",
      marker: "ASK-ANSWER-MARKER",
      query: db
        .update(schema.askQuestions)
        .set({ answer: "ASK-ANSWER-MARKER" })
        .where(eq(schema.askQuestions.id, "question-id")),
    },
    {
      write: 'a "This is me" mark',
      marker: PUUID,
      query: db.insert(schema.userPlayers).values({ userId: ACCOUNT_ID, puuid: PUUID }),
    },
  ])("keeps the values of $write that failed out of the report", async ({ marker, query }) => {
    const event = reportOf(failed(query));
    // The marker is in Drizzle's message before beforeSend runs.
    expect(JSON.stringify(event)).toContain(marker);

    const sent = JSON.stringify(await send(event));
    expect(sent).not.toContain(marker);
    expect(sent).not.toContain(ACCOUNT_ID);
    expect(sent).not.toContain("params:");
    // What failed is still there to debug: the query and its cause.
    expect(sent).toContain("Failed query: ");
    expect(sent).toContain("connect ECONNREFUSED");
  });

  // Sentry's console breadcrumb holds the logged error in full, in its message
  // and again in its data.
  it("drops a logged failed query from the breadcrumbs", async () => {
    const error = failed(db.insert(schema.dayNotes).values({ userId: ACCOUNT_ID, day: "2026-11-01", text: "DAY-NOTE-MARKER" }));
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined" }] },
      breadcrumbs: [
        { category: "console", message: "Riot answered 429" },
        { category: "console", message: `save failed ${error}`, data: { arguments: ["save failed", error] } },
      ],
    };

    const sent = await send(event);
    expect(JSON.stringify(sent)).not.toContain("DAY-NOTE-MARKER");
    expect(sent?.breadcrumbs).toEqual([{ category: "console", message: "Riot answered 429" }]);
  });

  it("leaves other errors as they were", async () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined" }] },
      breadcrumbs: [{ category: "console", message: "Riot answered 429" }],
    };
    expect(await send(event)).toEqual({
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined" }] },
      breadcrumbs: [{ category: "console", message: "Riot answered 429" }],
    });
  });

  // Sentry quotes a request's body in its reports unless told not to. Bodies
  // hold notes being saved, and the saved players box's Riot IDs, which
  // /privacy says are only used to read ranks.
  it("never quotes a request's body", () => {
    expect(options.integrations).toContainEqual({
      name: "Http",
      options: expect.objectContaining({ maxRequestBodySize: "none" }),
    });
  });
});
