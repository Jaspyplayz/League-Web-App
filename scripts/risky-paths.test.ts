import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { SWITCH_FILE } from "./can-merge-gates";
import { jaspersFiles, JASPERS_PATHS, matchesPattern, PANEL_PATHS, riskyFiles, type RiskyPath } from "./risky-paths";

const RISKY_PATHS = [...JASPERS_PATHS, ...PANEL_PATHS];

// -z lists names unquoted, so a file named in other letters is still checked.
const repoFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

// The only risky patterns allowed to match no file in the repo (see the
// "names only paths that exist" test below).
const KEPT_WITHOUT_FILES = [".cursor/settings.json", ".cursor/rules/", "vite.config", ".npmrc", "npm-shrinkwrap.json", ".mcp.json", "scripts/package.json"];

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

const onPanel = (path: string) => riskyFiles([path]).length === 1 && jaspersFiles([path]).length === 0;

// What's wrong with a workflow's token: no top-level permissions line, so it
// gets the repo's default, or the word write anywhere but a comment line. It
// reads text, not YAML, so it also refuses a YAML escape or a quoted line that
// runs on, either of which could spell write. A trailing comment or a run step
// that says write is refused too, which only sends that workflow to Jasper.
function tokenProblems(workflow: string): string[] {
  const code = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  return [
    !/^permissions:/m.test(code) && "doesn't set its token's permissions",
    /\bwrite(-all)?\b/i.test(code) && "asks for write access",
    /\\[xuU]|\\\s*$/m.test(code) && "has a YAML escape or a line that runs on",
  ].filter((problem) => problem !== false);
}

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
        "docs/eslint.config.md",
        "src/lib/eslint.configs.json",
        ".cursor/skills/verify-turnpoint/SKILL.md",
      ]),
    ).toEqual([]);
  });

  // Jasper merges migrations and the merge gates' own code (JAS-191): only he
  // runs `npm run db:migrate`, and an agent could otherwise loosen a gate and
  // merge that.
  it.each([
    "drizzle/0014_notes.sql",
    "drizzle/meta/_journal.json",
    "drizzle.config.ts",
    "src/db/schema.ts",
    "scripts/can-merge.ts",
    "scripts/can-merge-gates.ts",
    "scripts/can-merge-gates.test.ts",
    "scripts/can-merge-action.ts",
    "scripts/can-merge-rest.ts",
    "scripts/can-merge-reviewer-check.ts",
    "scripts/can-merge-fixtures/body-245.md",
    "scripts/can-merge.tsconfig.json",
    "scripts/risky-paths.ts",
    "scripts/risky-paths.test.ts",
    ".github/workflows/agent-merge.yml",
    ".github/workflows/agent-merge-sweep.yml",
    ".github/workflows/reviewer.yml",
    ".claude/agent-merge.json",
    ".claude/settings.json",
    ".claude/settings.local.json",
    "scripts/package.json",
    "scripts/node_modules/zod/index.js",
    "scripts/node_modules/zod/package.json",
    "node_modules/zod/index.js",
    "src/lib/node_modules/react/index.js",
  ])("keeps %s Jasper's to merge", (path) => {
    expect(jaspersFiles([path]).map((file) => file.path)).toEqual([path]);
  });

  // Jasper chose exactly these on 2026-11-02 (decision record 0032), so a
  // change to his list shows up here as well as in a new record.
  it("keeps Jasper's list to migrations and the gates' own code", () => {
    expect(JASPERS_PATHS.map(({ pattern }) => pattern)).toEqual([
      "drizzle/",
      "drizzle.config.ts",
      "src/db/schema.ts",
      "scripts/can-merge",
      "scripts/risky-paths",
      ".github/workflows/agent-merge",
      ".github/workflows/reviewer",
      ".claude/agent-merge.json",
      ".claude/settings",
      "scripts/package.json",
    ]);
  });

  // GitHub runs a workflow named .yml or .yaml, Windows ignores case, and a
  // name that only starts like a gate's file could be a gate too.
  it.each([
    ".github/workflows/agent-merge.yaml",
    ".github/workflows/agent-merge-retry.yml",
    ".github/workflows/reviewer.yaml",
    ".github/workflows/Reviewer.yml",
    ".GitHub/Workflows/Agent-Merge.yml",
    ".claude/Agent-Merge.json",
    ".Claude/Settings.json",
    "scripts/Node_Modules/zod/index.js",
    "Scripts/Can-Merge-Gates.ts",
    "scripts/RISKY-PATHS.ts",
    "Drizzle/0015_x.sql",
    "src/DB/Schema.ts",
  ])("keeps %s Jasper's, though it's spelled another way", (path) => {
    expect(jaspersFiles([path]).map((file) => file.path)).toEqual([path]);
  });

  // Jasper chose on 2026-11-02 to let Claude merge these once the panel and
  // the reviewer clear them (JAS-191). They still need both, so each must stay
  // on the panel list, not drop off both lists.
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/smoke.yml",
    ".github/workflows/dependency-review.yml",
    ".github/workflows/new-check.yaml",
    ".github/pull_request_template.md",
    ".github/dependabot.yml",
    ".github/ISSUE_TEMPLATE/feature.md",
    ".claude/hooks/check-before-commit.mjs",
    ".claude/hooks/cloud-setup.mjs",
    ".claude/agents/reviewer.md",
    ".claude/skills/code-review-and-quality/SKILL.md",
    ".claude/skills/interrogate/SKILL.md",
    ".claude/skills/verify-turnpoint-ux/scripts/drive.ts",
    ".claude/rules/design.md",
    ".claude/commands/ship.md",
    ".cursor/settings.json",
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
    "npm-shrinkwrap.json",
    ".npmrc",
    ".nvmrc",
    ".mcp.json",
    "scripts/run-queue-pick.ts",
    "src/lib/.claude/rules/x.md",
  ])("lets Claude merge %s after the panel", (path) => {
    expect(onPanel(path)).toBe(true);
  });

  // It decides what builders run with nobody watching (JAS-143).
  it("flags the ticket queue's code, with its reason", () => {
    const paths = ["scripts/run-queue-pick.ts", "scripts/run-queue-pick.test.ts", "scripts/run-queue.ts", "scripts/run-queue-rest.ts"];
    expect(riskyFiles(paths)).toEqual(paths.map((path) => ({ path, why: "the ticket queue, which decides what builders run unattended" })));
  });

  // Each tool loads another file name ahead of the one the repo has today, so
  // an exact name would let a new file replace a check's config unreviewed.
  it.each(["eslint.config.js", "next.config.js", "vitest.config.ts", "vite.config.ts", "playwright.config.js", "tsconfig.base.json"])(
    "flags %s for the panel, which could replace a check's config",
    (path) => {
      expect(onPanel(path)).toBe(true);
    },
  );

  // ESLint 10 reads the eslint.config nearest each file instead of the root's,
  // so a one-line `export default []` in a folder turns lint off there. Until
  // JAS-191 this was on neither list, so a tiny PR could add one unreviewed.
  it.each([
    "src/lib/x/eslint.config.mjs",
    "src/eslint.config.js",
    "src/app/player/eslint.config.ts",
    "src/components/eslint.config.mts",
    "scripts/eslint.config.cjs",
    "docs/ESLint.config.mjs",
  ])("flags %s, which replaces lint for its folder, for the panel", (path) => {
    expect(riskyFiles([path])).toEqual([{ path, why: "lint for the files in its folder, which ESLint reads in place of the root's" }]);
    expect(jaspersFiles([path])).toEqual([]);
  });

  // These are risky, so they get the interrogate panel, but Claude merges them
  // once it clears them.
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

  // Most redesign PRs update the verify skills (JAS-146). Their scripts and
  // the skills' credits merge after the panel now too, like the rest of
  // .claude/skills/.
  it("lets Claude merge the verify and postmortem skills, and the skills' credits, after the panel", () => {
    const paths = [
      ".claude/skills/verify/SKILL.md",
      ".claude/skills/verify/features/match-page.md",
      ".claude/skills/verify-turnpoint/features/ask-teaser.md",
      ".claude/skills/verify-turnpoint-ux/README.md",
      ".claude/skills/verify-turnpoint-ux/scripts/drive.ts",
      ".claude/skills/postmortem/fix-ladder.md",
      ".claude/skills/THIRD-PARTY-NOTICES.md",
    ];
    expect(jaspersFiles(paths)).toEqual([]);
    expect(riskyFiles(paths)).toEqual(paths.map((path) => ({ path, why: "skills the reviewer loads, and skills agents follow" })));
  });

  // A new skill, or a new kind of Claude Code config such as a commands
  // folder, steers agents too, so it gets the panel.
  it("flags a brand-new skill, and a new file anywhere in .claude/, for the panel", () => {
    const paths = [".claude/skills/new-skill/SKILL.md", ".claude/commands/ship.md"];
    expect(riskyFiles(paths)).toEqual([
      { path: ".claude/skills/new-skill/SKILL.md", why: "skills the reviewer loads, and skills agents follow" },
      { path: ".claude/commands/ship.md", why: "Claude Code's own setup, which steers every agent here" },
    ]);
    expect(jaspersFiles(paths)).toEqual([]);
  });

  // Every file in these folders steers agents or runs a check. Of them, only
  // the merge switch, Claude's deny rules and the workflows that merge or check
  // the reviewer are Jasper's.
  it("flags every file in .claude/ and .github/, and keeps only the gates' files there Jasper's", () => {
    const files = repoFiles.filter((file) => file.startsWith(".claude/") || file.startsWith(".github/"));
    expect(files.length).toBeGreaterThan(100);
    expect(riskyFiles(files).map((file) => file.path)).toEqual(files);
    expect(jaspersFiles(files).map((file) => file.path).sort()).toEqual([
      ".claude/agent-merge.json",
      ".claude/settings.json",
      ".github/workflows/agent-merge-sweep.yml",
      ".github/workflows/agent-merge.yml",
      ".github/workflows/reviewer.yml",
    ]);
  });

  // Jasper's list is checked first, so an entry he adds wins over a panel
  // pattern that also matches, wherever it goes in his list. The test adds one
  // at each end and takes it out again.
  it.each([
    ["first", 0],
    ["last", JASPERS_PATHS.length],
  ])("keeps a panel path Jasper's once his list names it, with the entry %s", (_, at) => {
    const list = JASPERS_PATHS as RiskyPath[];
    list.splice(at, 0, { pattern: ".github/workflows/ci.yml", why: "an entry Jasper added" });
    try {
      expect(jaspersFiles([".github/workflows/ci.yml"])).toEqual([{ path: ".github/workflows/ci.yml", why: "an entry Jasper added" }]);
    } finally {
      list.splice(at, 1);
    }
    expect(jaspersFiles([".github/workflows/ci.yml"])).toEqual([]);
  });

  // These deny rules keep a session merging only through can-merge: without
  // them, one could merge a migration or a gate change with `gh pr merge`.
  // So the file that holds them stays Jasper's (JAS-191's reviewer blocker).
  it("keeps the deny rules on merging, and the file that holds them, Jasper's", () => {
    const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as { permissions: { deny: string[] } };
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining(["Edit(.claude/agent-merge.json)", "Bash(gh pr merge)", "Bash(gh pr merge*)", "Bash(gh api *pulls/*/merge*)"]),
    );
    expect(jaspersFiles([".claude/settings.json"])).toEqual([
      { path: ".claude/settings.json", why: "Claude's deny rules on merging, and local overrides of them" },
    ]);
  });

  // GitHub counts a check named check or reviewer from any workflow, and a
  // token that can write could merge a PR without can-merge. So a workflow
  // Claude merges after the panel sets its token's permissions and asks for no
  // write access; one that needs it changes this test, which is Jasper's. CI
  // runs this at the PR's head, so a PR would have to stop CI running it too.
  it("lets only the merge gates' own workflows ask for write access", () => {
    const workflows = repoFiles.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file) && existsSync(file));
    expect(workflows.length).toBeGreaterThan(3);
    const others = workflows.filter((file) => jaspersFiles([file]).length === 0);
    expect(others).toContain(".github/workflows/ci.yml");
    expect(others.flatMap((file) => tokenProblems(readFileSync(file, "utf8")).map((problem) => `${file} ${problem}`))).toEqual([]);
  });

  it.each([
    ["no permissions line", "name: X\non: push\njobs: {}\n"],
    ["a write permission", "permissions:\n  contents: write\n"],
    ["a job's write permission", "permissions: {}\njobs:\n  x:\n    permissions:\n      pull-requests: write\n"],
    ["write-all", "permissions: write-all\n"],
    ["a flow-style write", "permissions: { contents: read, actions: write }\n"],
    ["a write after a quoted #", 'permissions: { contents: "read #", pull-requests: write }\n'],
    ["a write spelled with a YAML escape", 'permissions:\n  pull-requests: "\\x77rite"\n'],
    ["a write split over a quoted line that runs on", 'permissions:\n  pull-requests: "wr\\\n    ite"\n'],
    ["Write in capitals", "permissions:\n  contents: Write\n"],
  ])("would refuse a workflow with %s", (_, text) => {
    expect(tokenProblems(text)).not.toEqual([]);
  });

  it("accepts a workflow that reads only, whatever its comment lines say", () => {
    expect(tokenProblems("# This job never writes; write access stays with Agent merge.\npermissions:\n  contents: read\n  # no write here\n")).toEqual([]);
  });

  // The gates' code is Jasper's by name, so a helper they load under another
  // name would be on neither list. This resolves what each gate loads, side
  // effects and dynamic imports included, with the esbuild tsx runs and the
  // tsconfig the Agent merge workflow gives it. Installed packages come from
  // the lockfile, which 0032 leaves to the panel.
  it("keeps every file the gates load, other than installed packages, Jasper's", async () => {
    const fromTsx = createRequire(createRequire(import.meta.url).resolve("tsx/package.json"));
    const esbuild = fromTsx("esbuild") as {
      build: (options: object) => Promise<{ metafile: { inputs: Record<string, unknown> } }>;
    };
    const gates = repoFiles.filter((file) => /^scripts\/can-merge[^/]*\.ts$/.test(file) && !/\.test\.ts$/.test(file));
    expect(gates).toContain("scripts/can-merge-action.ts");
    const { metafile } = await esbuild.build({
      entryPoints: gates,
      bundle: true,
      write: false,
      metafile: true,
      platform: "node",
      format: "esm",
      outdir: "out",
      tsconfig: "scripts/can-merge.tsconfig.json",
      logLevel: "silent",
    });
    const loaded = Object.keys(metafile.inputs);
    expect(loaded).toEqual(expect.arrayContaining(["scripts/risky-paths.ts", "scripts/can-merge-gates.ts"]));
    expect(loaded.some((file) => file.startsWith("node_modules/zod/"))).toBe(true);
    expect(loaded.filter((file) => !file.startsWith("node_modules/") && jaspersFiles([file]).length === 0)).toEqual([]);
  });

  // npx runs package.json's own bin ahead of node_modules/.bin, a package name
  // with exports, imports or workspaces can stand in for one the gates import,
  // and a dependency from a file, a Git host or another registry skips npm's
  // checks. The Agent merge workflow refuses the first group at run time; this
  // stops a PR bringing any of them in.
  it("keeps package.json and the lockfile from swapping what the gates load", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown> & {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    expect(["bin", "exports", "imports", "workspaces"].filter((key) => key in pkg)).toEqual([]);
    const specs = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    expect(Object.entries(specs).filter(([, spec]) => !/^[\^~]?\d+(\.\d+){0,2}(-[\w.]+)?$/.test(spec))).toEqual([]);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { resolved?: string; integrity?: string; link?: boolean; inBundle?: boolean }>;
    };
    const fetched = Object.entries(lock.packages).filter(([path, entry]) => path !== "" && !entry.inBundle);
    expect(fetched.length).toBeGreaterThan(100);
    expect(
      fetched.filter(([, entry]) => entry.link || !entry.resolved?.startsWith("https://registry.npmjs.org/") || !entry.integrity).map(([path]) => path),
    ).toEqual([]);
  });

  // A file on Jasper's list can sit in a panel folder, like src/db/schema.ts
  // in src/db/, but a whole panel pattern inside his list would do nothing.
  it("puts no panel pattern inside one of Jasper's", () => {
    const both = PANEL_PATHS.filter(({ pattern }) => JASPERS_PATHS.some((jaspers) => matchesPattern(jaspers.pattern, pattern)));
    expect(both).toEqual([]);
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
