import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SWITCH_FILE } from "./can-merge-gates";
import { matchesPattern, RISKY_PATHS, riskyFiles } from "./risky-paths";

const repoFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
}).split("\n");

// A "use server" directive, or any import of src/db/: by the @/ alias or a
// relative path, in either quote, as a re-export or a dynamic import.
const talksToDatabaseOrCallers = (source: string) =>
  /^\s*["']use server["']|["'](?:@\/|(?:\.\.?\/)+(?:src\/)?)db(?:\/[^"']*)?["']/m.test(source);

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

  // Otherwise a PR that turns agent merging on could merge itself.
  it("flags the agent-merge switch that can-merge reads", () => {
    expect(riskyFiles([SWITCH_FILE])).toEqual([{ path: SWITCH_FILE, why: "the switch for agent merging" }]);
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

  // The stores and my-player.ts write and delete rows outside src/db/, and the
  // MCP server caps how many Riot calls one request makes (JAS-12).
  it("flags database code and the MCP server outside src/db/ and src/app/api/", () => {
    const paths = [
      "src/lib/match-note-store.ts",
      "src/lib/profile-store.ts",
      "src/lib/my-player.ts",
      "scripts/remap-puuids-db.ts",
      "scripts/collect-benchmarks.ts",
      "src/lib/mcp/tools.ts",
    ];
    expect(riskyFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  // The reviewer agent loads these, so changing them changes the review.
  it("flags the skills and rules the reviewer loads", () => {
    const paths = [".claude/skills/code-review-and-quality/SKILL.md", ".claude/rules/database.md"];
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
        "src/lib/regions.ts",
        "src/lib/match-store.test.ts",
        "scripts/shot.ts",
      ]),
    ).toEqual([]);
  });

  // A folder renamed without updating the list would quietly stop being risky.
  it("names only paths that exist in the repo", () => {
    const missing = RISKY_PATHS.filter(({ pattern }) => !repoFiles.some((file) => matchesPattern(pattern, file)));
    expect(missing).toEqual([]);
  });

  // Anyone can call a server action, and a store under a new name would
  // otherwise merge as normal code (JAS-12).
  it("covers every server action and every file that imports the database", () => {
    const allowed: Record<string, string> = {
      "scripts/check-score.ts": "only reads scores",
      "src/app/player/[region]/[riotId]/profile-header.tsx": "imports secondsUntilUpdate, which has no database access",
    };
    const unlisted = repoFiles.filter(
      (file) =>
        /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) &&
        !/\.test\./.test(file) &&
        existsSync(file) &&
        !(file in allowed) &&
        riskyFiles([file]).length === 0 &&
        talksToDatabaseOrCallers(readFileSync(file, "utf8")),
    );
    expect(unlisted).toEqual([]);
  });

  it.each([
    '"use server";',
    'import { getDb } from "@/db";',
    "import { getDb } from '@/db';",
    'import { tables } from "../../db/schema";',
    'import { getDb } from "../src/db";',
    'export { getDb } from "@/db";',
    'const { getDb } = await import("@/db");',
  ])("spots %s as a server action or database import", (source) => {
    expect(talksToDatabaseOrCallers(`// a file\n${source}\n`)).toBe(true);
  });
});
