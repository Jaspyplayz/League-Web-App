import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SWITCH_FILE } from "./can-merge-gates";
import { FEATURE_NOTE, jaspersFiles, JASPERS_PATHS, matchesPattern, PANEL_PATHS, riskyFiles } from "./risky-paths";

const RISKY_PATHS = [...JASPERS_PATHS, ...PANEL_PATHS];

// -z lists names unquoted, so a file named in other letters is still checked.
const repoFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

// The only risky patterns allowed to match no file in the repo (see the
// "names only paths that exist" test below).
const KEPT_WITHOUT_FILES = [".cursor/settings.json", ".cursor/rules/", "vite.config", ".npmrc", ".mcp.json"];

// The modules in src/db/ that never touch the database.
const PURE_DB_MODULES = new Set(["db/freshness"]);

// The in-repo functions that call Claude or create a Supabase client. The
// rest of their modules, such as recapsEnabled, are safe to import.
const WRAPPERS = [
  { name: "answerQuestion", file: "src/lib/ask.ts" },
  { name: "writeRecap", file: "src/lib/recap.ts" },
  { name: "createSupabaseClient", file: "src/lib/supabase/server.ts" },
  { name: "refreshSession", file: "src/lib/supabase/proxy.ts" },
];
const USES_WRAPPER = new RegExp(`\\b(?:${WRAPPERS.map(({ name }) => name).join("|")})\\b`);

// A file that belongs on the risky list: a route or a pages/api/ file, which
// Next.js serves as a public endpoint, or the proxy it runs on every request;
// a "use server" file; one that imports the Claude API or Supabase client,
// uses one of the wrappers above, or reads the Claude API key; or one that
// imports the Postgres client, Drizzle, or src/db/ by the @/ alias or a
// relative path, in either quote, as a re-export or a dynamic import.
function mustBeListed(file: string, source: string): boolean {
  if (/(^|\/)route\.(?:[cm]?[jt]s|[jt]sx)$|(^|\/)pages\/api\//.test(file)) return true;
  if (/^(src\/)?(proxy|middleware)\.[cm]?[jt]s$/.test(file)) return true;
  if (/^\s*["']use server["']/m.test(source)) return true;
  if (/["'](?:postgres|drizzle-orm(?:\/[^"']*)?|@anthropic-ai\/sdk(?:\/[^"']*)?|@supabase\/[^"']+)["']/.test(source)) {
    return true;
  }
  if (USES_WRAPPER.test(source)) return true;
  const readsKey =
    /env\??\.ANTHROPIC_API_KEY\b|env(?:\?\.)?\[\s*["']ANTHROPIC_API_KEY["']\s*\]|\{[^}]*\bANTHROPIC_API_KEY\b[^}]*\}\s*=\s*process\.env\b/;
  if (readsKey.test(source)) return true;
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
      { path: "src/db/schema.ts", why: "the tables migrations are generated from" },
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

  // Local settings override the commit hook, a copied agent can take the
  // reviewer's name, and a Cursor settings or rules file could still give an
  // AI tool instructions (JAS-13).
  it("flags local settings, every agent, and Cursor's settings and rules", () => {
    const paths = [
      ".claude/settings.local.json",
      ".claude/agents/helper.md",
      ".cursor/settings.json",
      ".cursor/rules/one-builder.mdc",
    ];
    expect(riskyFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  // Windows ignores case, so on Jasper's PC these land on the risky files.
  it("flags a risky path spelled with other capitals", () => {
    const paths = [".claude/Settings.json", "src/DB/schema.ts", "scripts/Remap-puuids-db.ts"];
    expect(riskyFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  // Claude Code and Cursor load skills and rules from these folders too (JAS-12).
  it("flags agent skills and rules below the repo root", () => {
    const paths = [
      "src/lib/.claude/rules/database.md",
      "src/lib/.Claude/rules/x.md",
      "docs/.claude/skills/x/SKILL.md",
      "src/.cursor/rules/x.mdc",
    ];
    expect(riskyFiles(paths)).toEqual(paths.map((path) => ({ path, why: "agent skills or rules below the repo root" })));
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
        "src/lib/match-store.ts.bak",
        "src/components/theme-store.ts",
        "scripts/shot.ts",
        ".cursor/skills/verify-turnpoint/SKILL.md",
      ]),
    ).toEqual([]);
  });

  // Jasper merges migrations and anything that defines or runs a check, since
  // an agent could otherwise loosen its own gate and merge that (JAS-128).
  it("keeps migrations and every check-defining path Jasper's to merge", () => {
    const paths = [
      "drizzle/0014_notes.sql",
      "drizzle.config.ts",
      "src/db/schema.ts",
      ".github/workflows/ci.yml",
      ".claude/settings.json",
      ".claude/hooks/check-before-commit.mjs",
      ".claude/agents/reviewer.md",
      ".claude/skills/verify-turnpoint-ux/SKILL.md",
      ".claude/rules/design.md",
      ".claude/agent-merge.json",
      ".cursor/rules/x.mdc",
      "eslint.config.mjs",
      "eslint-rules/no-green-classes.mjs",
      "tsconfig.json",
      "next.config.ts",
      "vercel.json",
      "vitest.config.mts",
      "playwright.config.ts",
      "e2e/fixtures.ts",
      "e2e/preview-login.ts",
      "e2e/preview-secret.spec.ts",
      "scripts/preview-login.test.ts",
      "src/app/themes.test.ts",
      "src/app/corners.test.ts",
      "package.json",
      "package-lock.json",
      ".npmrc",
      ".nvmrc",
      ".mcp.json",
      "scripts/can-merge-gates.ts",
      "scripts/risky-paths.ts",
      "src/lib/.claude/rules/x.md",
    ];
    expect(jaspersFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  // It decides what builders run with nobody watching (JAS-143). The Action's
  // own scripts in JAS-144 will start with the same name.
  it("keeps the ticket queue's code Jasper's to merge", () => {
    const paths = ["scripts/run-queue-pick.ts", "scripts/run-queue-pick.test.ts", "scripts/run-queue.ts", "scripts/run-queue-rest.ts"];
    expect(jaspersFiles(paths)).toEqual(
      paths.map((path) => ({ path, why: "the ticket queue, which decides what builders run unattended" })),
    );
  });

  // Each tool loads another file name ahead of the one the repo has today, so
  // an exact name would let a new file replace a check's config.
  it.each(["eslint.config.js", "next.config.js", "vitest.config.ts", "vite.config.ts", "playwright.config.js", "tsconfig.base.json"])(
    "keeps %s Jasper's, which could replace a check's config",
    (path) => {
      expect(jaspersFiles([path]).map((file) => file.path)).toEqual([path]);
    },
  );

  // These are risky, so they get the interrogate panel, but Claude merges them
  // once it clears them. e2e/ holds the smoke test's specs; what decides
  // whether and how they run (playwright.config.ts, .github/) stays Jasper's.
  it("lets Claude merge the product's risky paths after the panel", () => {
    const paths = [
      "src/db/freshness.ts",
      "src/lib/match-note-store.ts",
      "src/app/sign-in/page.tsx",
      "src/lib/riot/client.ts",
      "src/app/api/mcp/route.ts",
      "src/lib/ask.ts",
      "src/lib/analyzer/score-model.json",
      "src/app/privacy/page.tsx",
      "src/app/globals.css",
      "e2e/smoke.spec.ts",
    ];
    expect(jaspersFiles(paths)).toEqual([]);
    expect(riskyFiles(paths).map((file) => file.path)).toEqual(paths);
  });

  // Most redesign PRs update the verify skill's feature notes, so Jasper chose
  // to let Claude merge them; the skill itself stays his (JAS-128). Agents
  // follow the notes, so they still get the panel.
  it("lets Claude merge the verify skill's feature notes after the panel, and nothing else in .claude/skills/", () => {
    const notes = [".claude/skills/verify-turnpoint-ux/features/review-path.md", ".claude/skills/verify-turnpoint-ux/Features/x.md"];
    expect(jaspersFiles(notes)).toEqual([]);
    expect(riskyFiles(notes)).toEqual(notes.map((path) => ({ path, why: "the verify skill's feature notes, which agents follow" })));
    const still = [
      ".claude/skills/verify-turnpoint-ux/SKILL.md",
      ".claude/skills/verify-turnpoint-ux/scripts/drive.ts",
      ".claude/skills/verify-turnpoint-ux/features/drive.ts",
      ".claude/skills/verify-turnpoint-ux/features/.claude/rules/x.md",
      ".claude/skills/verify-turnpoint-ux/features/deep/SKILL.md",
      ".claude/skills/verify-turnpoint-ux/features/README.md",
      ".claude/skills/verify-turnpoint-ux/features/CLAUDE.md",
      ".claude/skills/verify-turnpoint-ux/features/CLAUDE.local.md",
      ".claude/skills/verify-turnpoint-ux/features/AGENTS.md",
      ".claude/skills/verify-turnpoint-ux/features/SKILL.md",
      ".claude/skills/verify-turnpoint/features/ask-teaser.md",
      "src/.claude/skills/verify-turnpoint-ux/features/x.md",
    ];
    expect(jaspersFiles(still).map((file) => file.path)).toEqual(still);
  });

  // A new kind of Claude Code config, such as a commands folder, could steer
  // agents too, so it is Jasper's until someone decides otherwise.
  it("keeps a new file anywhere in .claude/ Jasper's", () => {
    expect(jaspersFiles([".claude/commands/ship.md"])).toEqual([
      { path: ".claude/commands/ship.md", why: "Claude Code's own setup, which steers every agent here" },
    ]);
  });

  // A file on Jasper's list can sit in a panel folder, like src/db/schema.ts
  // in src/db/, but a whole panel pattern inside his list would do nothing.
  it("puts no panel pattern inside one of Jasper's", () => {
    const both = PANEL_PATHS.filter(({ pattern }) => JASPERS_PATHS.some((jaspers) => matchesPattern(jaspers.pattern, pattern)));
    expect(both).toEqual([]);
  });

  // A carve-out that matches no file does nothing, so renaming the skill's
  // folder would quietly send its notes back to Jasper.
  it("carves out feature notes that exist", () => {
    const notes = repoFiles.filter((file) => FEATURE_NOTE.test(file));
    expect(notes.length).toBeGreaterThan(0);
    expect(jaspersFiles(notes)).toEqual([]);
  });

  // A folder renamed without updating the list would quietly stop being risky.
  // The exceptions name files that don't exist yet: .cursor/ was deleted when
  // Cursor stopped being used (decision record 0012), and the others would
  // change how a check or an agent runs if someone added them.
  it("names only paths that exist in the repo, except the ones kept for files added later", () => {
    const missing = RISKY_PATHS.filter(
      ({ pattern }) => !KEPT_WITHOUT_FILES.includes(pattern) && !repoFiles.some((file) => matchesPattern(pattern, file)),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the Cursor patterns, and they still flag a Cursor settings or rules file added later", () => {
    expect(RISKY_PATHS.map(({ pattern }) => pattern)).toEqual(expect.arrayContaining(KEPT_WITHOUT_FILES));
    expect(riskyFiles([".cursor/settings.json", ".cursor/rules/x.mdc"])).toEqual([
      {
        path: ".cursor/settings.json",
        why: "Cursor isn't used any more, but its settings could still turn on an AI tool here",
      },
      {
        path: ".cursor/rules/x.mdc",
        why: "Cursor isn't used any more, but a rule here could still give an AI tool instructions",
      },
    ]);
  });

  // Anyone can call a server action, and a store under a new name would
  // otherwise merge as normal code (JAS-12). Claude spending and sign-in stay
  // Jasper's too (JAS-13).
  it("covers routes, the proxy, server actions, and database, Claude API or Supabase clients", () => {
    const unlisted = repoFiles.filter(
      (file) =>
        isSourceFile(file) &&
        existsSync(file) &&
        riskyFiles([file]).length === 0 &&
        mustBeListed(file, readFileSync(file, "utf8")),
    );
    expect(unlisted).toEqual([]);
  });

  // A renamed wrapper would quietly stop being checked.
  it.each(WRAPPERS)("finds $name exported from $file, which is risky", ({ name, file }) => {
    expect(readFileSync(file, "utf8")).toMatch(new RegExp(`export async function ${name}\\b`));
    expect(riskyFiles([file])).toHaveLength(1);
  });

  it.each([
    ["src/app/notes/route.ts", true],
    ["src/app/api/mcp/route.ts", true],
    ["src/pages/api/refresh.ts", true],
    ["src/proxy.ts", true],
    ["src/middleware.ts", true],
    ["src/app/notes/page.tsx", false],
    ["src/lib/reroute.ts", false],
    ["src/lib/supabase/proxy.ts", false],
  ])("counts %s as a route or the proxy: %s", (file, entry) => {
    expect(mustBeListed(file, "")).toBe(entry);
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
    'import postgres from "postgres";',
    'import { eq } from "drizzle-orm";',
    'import { drizzle } from "drizzle-orm/postgres-js";',
    'import { secondsUntilUpdate } from "@/db/freshness";\nimport { getDb } from "@/db";',
    'import Anthropic from "@anthropic-ai/sdk";',
    'import { createServerClient } from "@supabase/ssr";',
    "const key = process.env.ANTHROPIC_API_KEY;",
    'const key = process.env["ANTHROPIC_API_KEY"];',
    "const key = process.env?.ANTHROPIC_API_KEY;",
    "const { ANTHROPIC_API_KEY } = process.env;",
    'import { writeRecap } from "@/lib/recap";',
    "const result = await answerQuestion(region, account, question);",
    'import { createSupabaseClient } from "@/lib/supabase/server";',
    "return refreshSession(request);",
  ])("spots %s as a server action or a database, Claude API or Supabase client", (source) => {
    expect(mustBeListed("src/lib/notes.ts", `// a file\n${source}\n`)).toBe(true);
  });

  it.each([
    'import { secondsUntilUpdate } from "@/db/freshness";',
    'import { supabaseConfig } from "@/lib/supabase/config";',
    'throw new Error("Ask is off here (needs ANTHROPIC_API_KEY)");',
    'import { recapsEnabled } from "@/lib/recap";',
    'import type { Recap } from "@/lib/recap";',
    'import { askEnabled } from "@/lib/ask";',
  ])("lets a file use %s, which reaches no database, Claude API or sign-in", (source) => {
    expect(mustBeListed("src/lib/notes.ts", `${source}\n`)).toBe(false);
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
