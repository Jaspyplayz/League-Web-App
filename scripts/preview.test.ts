import { describe, expect, it } from "vitest";
import { previewUrl } from "./preview";

describe("previewUrl", () => {
  // The PR number goes into a GitHub API path, so anything else is refused
  // before gh runs.
  it.each(["abc", "196/merge", "../196", "196 "])("refuses %j", (pr) => {
    expect(() => previewUrl(pr)).toThrow(`--pr takes a PR number, not "${pr}".`);
  });
});
