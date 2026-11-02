// The paths that make a PR risky (issue #158), in two lists (JAS-128, JAS-191):
//
// - JASPERS_PATHS: migrations, the schema they come from, the ticket queue, and
//   the merge gates (their code, Claude's deny rules, the switch, the lockfile,
//   and the package files Node would load in place of the gates' imports). `npm run can-merge`
//   refuses a PR that touches one, whatever its tier says. Only Jasper runs
//   `npm run db:migrate`, so code merged before its migration would break the
//   live site's reads; and an agent could otherwise loosen a gate and merge
//   that.
// - PANEL_PATHS: the rest of the risky code, including every other check (CI,
//   lint, test configs, hooks, the reviewer agent and the skills). Claude
//   merges a PR that touches one only after the interrogate panel and the
//   reviewer clear it, since Jasper's click on these checked nothing more
//   (decision record 0032).
//
// The docs link here instead of copying the lists.
//
// A path matches when it starts with a pattern, so a pattern ending in "/"
// covers a whole folder and "src/lib/ask" covers ask.ts, ask-store.ts and
// their tests. A pattern with a "*" must match the whole path, so
// "src/lib/*-store.ts" covers the stores but not their tests.

export type RiskyPath = { pattern: string; why: string };

export const JASPERS_PATHS: readonly RiskyPath[] = [
  // Only Jasper runs `npm run db:migrate`.
  { pattern: "drizzle/", why: "database migrations" },
  { pattern: "drizzle.config.ts", why: "where migrations run" },
  // Migrations are generated from it, and nothing checks that one was, so a
  // change here with no migration would break the live site's reads.
  { pattern: "src/db/schema.ts", why: "the tables migrations are generated from" },

  // The merge gates. A builder can propose a change here, but only Jasper
  // merges it. GitHub runs a workflow named .yml or .yaml, so the two workflow
  // patterns have no extension. scripts/can-merge covers the tsconfig the Agent
  // merge workflow gives tsx too.
  { pattern: "scripts/can-merge", why: "the merge gates" },
  { pattern: "scripts/risky-paths", why: "these lists" },
  { pattern: ".github/workflows/agent-merge", why: "the workflows that run can-merge with a token that can merge" },
  { pattern: ".github/workflows/reviewer", why: "GitHub's required reviewer check" },
  { pattern: ".claude/agent-merge.json", why: "the switch for agent merging" },
  // Its deny rules stop a session merging around can-merge with `gh pr merge`
  // or the REST merge request, or editing the switch, by mistake. They aren't
  // a security boundary (docs/workflow.md), but a PR shouldn't drop them
  // unseen. Local overrides match too.
  { pattern: ".claude/settings", why: "Claude's deny rules on merging, and local overrides of them" },
  // Node reads the package.json nearest each gate, so one here with a name and
  // exports would stand in for a package the gates import, such as zod.
  { pattern: "scripts/package.json", why: "a package scope the gates would load in place of an installed package" },
  // It decides which tsx, esbuild and zod the Agent merge job runs with its
  // token, and an entry can install another package under any name in ways a
  // test kept missing (decision record 0032), so it stays Jasper's until the
  // gates have a lockfile of their own (JAS-252). npm ci refuses a package.json
  // that doesn't match it, so package.json alone can't change what's installed.
  { pattern: "package-lock.json", why: "the dependencies the merge gates run with" },

  // /run-queue picks tickets and starts builders with nobody watching (JAS-143,
  // decision record 0026), holding the Linear key and the task token. A change
  // here could send those anywhere, which the job's own guards can't stop, so
  // Jasper chose to keep it on his list (decision record 0032).
  { pattern: "scripts/run-queue", why: "the ticket queue, which decides what builders run unattended" },
  { pattern: ".github/workflows/run-queue", why: "the workflow that holds the Linear key and the task token" },
];

export const PANEL_PATHS: readonly RiskyPath[] = [
  // Anything else that defines or runs a check, and anything that steers the
  // agents. These were Jasper's until JAS-191.
  { pattern: ".github/", why: "CI, the smoke test and the PR template" },
  { pattern: ".claude/hooks/", why: "the commit hook, and the startup hook that runs commands in every cloud session" },
  { pattern: ".claude/agents/", why: "the reviewer agent, and any agent that could take its name" },
  { pattern: ".cursor/settings.json", why: "Cursor isn't used any more, but its settings could still turn on an AI tool here" },
  { pattern: ".cursor/rules/", why: "Cursor isn't used any more, but a rule here could still give an AI tool instructions" },
  { pattern: ".claude/skills/", why: "skills the reviewer loads, and skills agents follow" },
  { pattern: ".claude/rules/", why: "rules the reviewer checks against" },
  // The configs match without an extension, because each tool loads other file
  // names first: an eslint.config.js would replace the .mjs. ESLint also reads
  // the eslint.config nearest each file, which PANEL_ANYWHERE below covers.
  { pattern: "eslint.config", why: "lint" },
  { pattern: "eslint-rules/", why: "lint" },
  { pattern: "tsconfig", why: "the type check" },
  { pattern: "next.config", why: "the build, which can skip type errors" },
  { pattern: "vercel.json", why: "Vercel's build settings" },
  { pattern: "vitest.config", why: "unit tests" },
  { pattern: "vite.config", why: "unit tests, since Vitest reads it too" },
  { pattern: "src/app/themes.test.ts", why: "the check that every colour has a light value" },
  { pattern: "src/app/corners.test.ts", why: "the check that keeps every corner to the three approved ones" },
  { pattern: "playwright.config", why: "which smoke tests run, and how" },
  // These hold the preview's bypass secret and check that it goes nowhere else.
  { pattern: "e2e/fixtures.ts", why: "the check that the preview's secret stays on the preview" },
  { pattern: "e2e/preview-login.ts", why: "the code that sends the preview's secret" },
  { pattern: "e2e/preview-secret.spec.ts", why: "the check that the preview's secret stays on the preview" },
  { pattern: "scripts/preview-login", why: "the test of the check that the preview's secret stays on the preview" },
  // The Agent merge workflow refuses a package.json with a bin, exports,
  // imports or workspaces, deletes .npmrc and npm-shrinkwrap.json, and installs
  // with scripts off (decision record 0032).
  { pattern: "package.json", why: "the commands CI runs, and dependencies" },
  { pattern: "npm-shrinkwrap.json", why: "dependencies, in place of the lockfile" },
  { pattern: ".npmrc", why: "how npm ci installs, in every workflow" },
  { pattern: ".nvmrc", why: "the Node version CI uses" },
  { pattern: ".mcp.json", why: "tools every agent here would load" },

  // The risky row of docs/workflow.md's tier table.
  { pattern: "src/db/", why: "the database client and queries" },
  { pattern: "src/lib/*-store.ts", why: "database reads and writes, including deletes" },
  { pattern: "src/lib/my-player.ts", why: "links a user to their player in the database" },
  { pattern: "src/lib/own-data.ts", why: "how a failed read of a player's own data is reported" },
  { pattern: "scripts/remap-puuids", why: "rewrites player IDs in the live database" },
  { pattern: "scripts/collect-benchmarks", why: "writes and deletes rows in the live database" },
  { pattern: "scripts/check-score", why: "reads the live database" },
  { pattern: "src/lib/auth.ts", why: "sign-in" },
  { pattern: "src/lib/sign-in.ts", why: "sign-in" },
  { pattern: "src/lib/supabase/", why: "sign-in sessions" },
  { pattern: "src/app/auth/", why: "sign-in" },
  { pattern: "src/app/sign-in/", why: "sign-in" },
  { pattern: "src/app/account/", why: "account actions, including the paid recap" },
  { pattern: "src/proxy.ts", why: "refreshes the sign-in session on every request" },
  { pattern: "src/lib/riot/", why: "the Riot client and rate limiter" },
  { pattern: "src/app/api/", why: "API routes, including the MCP server" },
  { pattern: "src/lib/mcp/", why: "the MCP server's cap on Riot calls" },
  { pattern: "src/app/actions.ts", why: "a server action anyone can call" },
  { pattern: "src/app/player/[region]/[riotId]/actions.ts", why: "server actions anyone can call, which spend Riot calls" },
  { pattern: "src/app/player/[region]/[riotId]/match-details-action.tsx", why: "a server action anyone can call, which can spend a Riot call" },
  { pattern: "src/app/player/[region]/[riotId]/insights/advance.ts", why: "a server action anyone can call, which spends Riot calls" },
  { pattern: "src/lib/ask", why: "Ask spends Claude API money" },
  { pattern: "src/lib/recap", why: "AI recaps spend Claude API money" },
  { pattern: "src/app/player/[region]/[riotId]/ask/", why: "the old Ask address, now a redirect" },
  { pattern: "src/app/player/[region]/[riotId]/log/", why: "the old Log address, now a redirect" },
  { pattern: "src/components/ask/", why: "Ask spends Claude API money" },
  { pattern: "src/lib/analyzer/score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/phase-score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/win-chance-model.json", why: "a trained model" },
  { pattern: "scripts/train-", why: "model training" },
  { pattern: "src/app/privacy/", why: "Riot reviews it for production keys" },
  { pattern: "src/app/terms/", why: "Riot reviews it for production keys" },

  // The smoke test's specs. The three files above that hold or guard the
  // preview's secret come first, so they keep their own reasons.
  { pattern: "e2e/", why: "the smoke test and accessibility scan" },

  // The look's foundation (JAS-94). Page restyles that only use the tokens
  // stay off this list.
  { pattern: "src/app/globals.css", why: "the palette in both themes, the corners and the fonts" },

  // Last, so the reasons above come first: any other Claude Code file, such
  // as a new commands folder, could steer agents too.
  { pattern: ".claude/", why: "Claude Code's own setup, which steers every agent here" },
];

// Files a tool reads in any folder, not only the root (JAS-191).
type Anywhere = { test: RegExp; why: string };

// Node looks for a package in node_modules/ beside the importing file first, so
// a committed scripts/node_modules/zod would replace the zod the gates import.
// Nothing here commits node_modules/.
const JASPERS_ANYWHERE: readonly Anywhere[] = [
  { test: /(^|\/)node_modules\//i, why: "a package folder Node would load in place of an installed one" },
];

// Claude Code and Cursor load skills and rules from a .claude/ or .cursor/
// folder in any folder, and ESLint 10 reads the eslint.config nearest each
// file, so a one-line one in src/lib/x/ turns lint off for every file there.
const PANEL_ANYWHERE: readonly Anywhere[] = [
  { test: /\/\.(claude|cursor)\//i, why: "agent skills or rules below the repo root" },
  { test: /\/eslint\.config\.[cm]?[jt]s$/i, why: "lint for the files in its folder, which ESLint reads in place of the root's" },
];

// Windows ignores case, so src/DB/schema.ts would land on src/db/schema.ts.
export function matchesPattern(pattern: string, path: string): boolean {
  const [lowerPattern, lowerPath] = [pattern.toLowerCase(), path.toLowerCase()];
  const star = lowerPattern.indexOf("*");
  if (star === -1) return lowerPath.startsWith(lowerPattern);
  const head = lowerPattern.slice(0, star);
  const tail = lowerPattern.slice(star + 1);
  return lowerPath.length >= head.length + tail.length && lowerPath.startsWith(head) && lowerPath.endsWith(tail);
}

type Owner = { why: string; jaspers: boolean };

// Jasper's list first, so a mistake lands on his side: his list wins over a
// panel pattern that also matches, such as src/db/schema.ts inside src/db/, or
// .claude/agent-merge.json inside .claude/.
function owner(path: string): Owner | undefined {
  const jaspers = JASPERS_PATHS.find(({ pattern }) => matchesPattern(pattern, path)) ?? JASPERS_ANYWHERE.find(({ test }) => test.test(path));
  if (jaspers) return { why: jaspers.why, jaspers: true };
  const panel = PANEL_PATHS.find(({ pattern }) => matchesPattern(pattern, path)) ?? PANEL_ANYWHERE.find(({ test }) => test.test(path));
  return panel ? { why: panel.why, jaspers: false } : undefined;
}

/** Every changed path on either list: these need the panel, and a new review if they change after a verdict. */
export function riskyFiles(paths: readonly string[]): { path: string; why: string }[] {
  return paths.flatMap((path) => {
    const found = owner(path);
    return found ? [{ path, why: found.why }] : [];
  });
}

/** The changed paths only Jasper merges. */
export function jaspersFiles(paths: readonly string[]): { path: string; why: string }[] {
  return paths.flatMap((path) => {
    const found = owner(path);
    return found?.jaspers ? [{ path, why: found.why }] : [];
  });
}
