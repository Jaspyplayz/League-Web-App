import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { RISKY_PATHS, riskyFiles } from "./risky-paths";

describe("riskyFiles", () => {
  it("flags files in risky folders and risky files, with the reason", () => {
    expect(
      riskyFiles([
        "src/db/schema.ts",
        "drizzle/0012_ask_budget.sql",
        "src/lib/riot/client.ts",
        "src/app/api/mcp/route.ts",
        ".github/workflows/ci.yml",
        "package.json",
      ]),
    ).toEqual([
      { path: "src/db/schema.ts", why: "the database schema and queries" },
      { path: "drizzle/0012_ask_budget.sql", why: "database migrations" },
      { path: "src/lib/riot/client.ts", why: "the Riot client and rate limiter" },
      { path: "src/app/api/mcp/route.ts", why: "API routes, including the MCP server" },
      { path: ".github/workflows/ci.yml", why: "CI, the smoke test and the PR template" },
      { path: "package.json", why: "the commands CI runs, and dependencies" },
    ]);
  });

  it("covers every file that starts with a prefix pattern", () => {
    const paths = [
      "src/lib/ask.ts",
      "src/lib/ask-store.ts",
      "src/lib/recap-points.test.ts",
      "scripts/train-win-chance.ts",
      "scripts/can-merge.ts",
      "scripts/can-merge-gates.test.ts",
      "scripts/risky-paths.ts",
    ];
    expect(riskyFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  it("passes docs, pages and components outside the list", () => {
    expect(
      riskyFiles([
        "docs/workflow.md",
        "CLAUDE.md",
        "src/app/page.tsx",
        "src/components/sign-in-link.tsx",
        "src/lib/analyzer/recap-facts.ts",
        "scripts/shot.ts",
      ]),
    ).toEqual([]);
  });

  // A folder renamed without updating the list would quietly stop being risky.
  it("names only paths that exist in the repo", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8",
    }).split("\n");
    const missing = RISKY_PATHS.filter(({ pattern }) => !files.some((file) => file.startsWith(pattern)));
    expect(missing).toEqual([]);
  });
});
