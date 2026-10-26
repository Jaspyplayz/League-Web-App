import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SWITCH_FILE } from "./can-merge-gates";
import { matchesPattern, RISKY_PATHS, riskyFiles } from "./risky-paths";

const repoFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
}).split("\n");

// The modules in src/db/ that never touch the database.
const PURE_DB_MODULES = new Set(["db/freshness"]);

// A "use server" directive, or an import of src/db/ by the @/ alias or a
// relative path, in either quote, as a re-export or a dynamic import.
function talksToDatabaseOrCallers(source: string): boolean {
  if (/^\s*["']use server["']/m.test(source)) return true;
  const imports = source.matchAll(/["'](?:@\/|(?:\.\.?\/)+(?:src\/)?)(db(?:\/[^"']*)?)["']/g);
  return [...imports].some((match) => !PURE_DB_MODULES.has(match[1]));
}

const isSourceFile = (file: string) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !/\.test\./.test(file);

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
        "src/components/theme-store.ts",
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
    const unlisted = repoFiles.filter(
      (file) =>
        isSourceFile(file) &&
        existsSync(file) &&
        riskyFiles([file]).length === 0 &&
        talksToDatabaseOrCallers(readFileSync(file, "utf8")),
    );
    expect(unlisted).toEqual([]);
  });

  it.each([
    '"use server";',
    "  'use server';",
    'import { getDb } from "@/db";',
    "import { getDb } from '@/db';",
    'import { tables } from "../../db/schema";',
    'import { getDb } from "../src/db";',
    'export { getDb } from "@/db";',
    'const { getDb } = await import("@/db");',
    'import { secondsUntilUpdate } from "@/db/freshness";\nimport { getDb } from "@/db";',
  ])("spots %s as a server action or database import", (source) => {
    expect(talksToDatabaseOrCallers(`// a file\n${source}\n`)).toBe(true);
  });

  it("lets a file import a module in src/db/ that never touches the database", () => {
    expect(talksToDatabaseOrCallers('import { secondsUntilUpdate } from "@/db/freshness";\n')).toBe(false);
  });

  it.each([
    ["a.ts", true],
    ["a.tsx", true],
    ["a.mts", true],
    ["a.mjs", true],
    ["a.cjs", true],
    ["a.js", true],
    ["a.test.ts", false],
    ["a.json", false],
  ])("scans %s for database imports: %s", (file, scanned) => {
    expect(isSourceFile(file)).toBe(scanned);
  });
});
