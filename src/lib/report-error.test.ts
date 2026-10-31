import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./report-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("reporting an error that reached an error page", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("sends an error thrown in the browser", () => {
    const error = new Error("clicked something broken");
    reportError(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("skips a server error, which onRequestError already sent", () => {
    reportError(Object.assign(new Error("An error occurred in the Server Components render."), { digest: "123" }));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
