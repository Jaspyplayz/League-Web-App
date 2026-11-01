import * as Sentry from "@sentry/nextjs";
import { expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), httpIntegration: vi.fn((options) => options) }));

// /privacy says the saved players box's Riot IDs are only used to read ranks,
// and Sentry quotes a request's body in its reports unless told not to.
it("keeps the saved players route's body out of Sentry, and only that route's", async () => {
  await import("../../sentry.server.config");

  const [http] = vi.mocked(Sentry.init).mock.lastCall![0]!.integrations as unknown as [
    { ignoreRequestBody: (url: string) => boolean },
  ];
  expect(http.ignoreRequestBody("/api/saved-players")).toBe(true);
  expect(http.ignoreRequestBody("/api/mcp")).toBe(false);
});
