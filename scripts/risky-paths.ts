// The paths that make a PR risky (issue #158), in two lists (JAS-128):
//
// - JASPERS_PATHS: migrations, and anything that defines or runs a check.
//   `npm run can-merge` refuses a PR that touches one, whatever its tier
//   says, since an agent could otherwise loosen its own gate and merge that.
// - PANEL_PATHS: the rest of the risky code. Claude merges a PR that touches
//   one only after the interrogate panel and the reviewer clear it.
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

  // Anything that defines or runs a check, since loosening one is risky.
  { pattern: ".github/", why: "CI, the smoke test and the PR template" },
  { pattern: ".claude/settings", why: "Claude's deny rules and commit hook, and local overrides of them" },
  { pattern: ".claude/hooks/", why: "the commit hook, and the startup hook that runs commands in every cloud session" },
  { pattern: ".claude/agents/", why: "the reviewer agent, and any agent that could take its name" },
  { pattern: ".cursor/settings.json", why: "Cursor isn't used any more, but its settings could still turn on an AI tool here" },
  { pattern: ".cursor/rules/", why: "Cursor isn't used any more, but a rule here could still give an AI tool instructions" },
  { pattern: ".claude/skills/", why: "skills the reviewer loads" },
  { pattern: ".claude/rules/", why: "rules the reviewer checks against" },
  { pattern: "eslint.config.mjs", why: "lint" },
  { pattern: "eslint-rules/", why: "lint" },
  { pattern: "tsconfig.json", why: "the type check" },
  { pattern: "next.config.ts", why: "the build, which can skip type errors" },
  { pattern: "vercel.json", why: "Vercel's build settings" },
  { pattern: "vitest.config.mts", why: "unit tests" },
  { pattern: "playwright.config.ts", why: "which smoke tests run, and how" },
  { pattern: "package.json", why: "the commands CI runs, and dependencies" },
  { pattern: "package-lock.json", why: "dependencies" },

  // The merge rules themselves.
  { pattern: ".claude/agent-merge.json", why: "the switch for agent merging" },
  { pattern: "scripts/can-merge", why: "the merge gates" },
  { pattern: "scripts/risky-paths", why: "these lists" },

  // Last, so the reasons above come first: any other Claude Code file, such
  // as a new commands folder, could steer agents too.
  { pattern: ".claude/", why: "Claude Code's own setup, which steers every agent here" },
];

// Inside JASPERS_PATHS, but Claude merges these after the panel, like
// PANEL_PATHS. Most redesign PRs update the verify skill's feature notes, so
// Jasper chose to let them go (2026-11-01). Only Markdown notes: a script
// there could be run by the skill.
export const CARVED_OUT: readonly RiskyPath[] = [
  { pattern: ".claude/skills/verify-turnpoint-ux/features/*.md", why: "the verify skill's feature notes, which agents follow" },
];

export const PANEL_PATHS: readonly RiskyPath[] = [
  // The risky row of docs/workflow.md's tier table.
  { pattern: "src/db/", why: "the database schema and queries" },
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
  { pattern: "src/components/ask/", why: "Ask spends Claude API money" },
  { pattern: "src/lib/analyzer/score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/phase-score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/win-chance-model.json", why: "a trained model" },
  { pattern: "scripts/train-", why: "model training" },
  { pattern: "src/app/privacy/", why: "Riot reviews it for production keys" },
  { pattern: "src/app/terms/", why: "Riot reviews it for production keys" },

  // The smoke test's specs. They're tests like any other, which the reviewer
  // and the panel read; what decides whether and how they run
  // (playwright.config.ts, .github/) stays on Jasper's list.
  { pattern: "e2e/", why: "the smoke test and accessibility scan" },

  // The look's foundations (JAS-94): the palette and the test that guards it.
  // Page restyles that only use the tokens stay off this list.
  { pattern: "src/app/globals.css", why: "the palette in both themes, the corners and the fonts" },
  { pattern: "src/app/themes.test.ts", why: "the check that every colour has a light value" },
];

export const RISKY_PATHS: readonly RiskyPath[] = [...JASPERS_PATHS, ...PANEL_PATHS];

// Windows ignores case, so src/DB/schema.ts would land on src/db/schema.ts.
export function matchesPattern(pattern: string, path: string): boolean {
  const [lowerPattern, lowerPath] = [pattern.toLowerCase(), path.toLowerCase()];
  const star = lowerPattern.indexOf("*");
  if (star === -1) return lowerPath.startsWith(lowerPattern);
  const head = lowerPattern.slice(0, star);
  const tail = lowerPattern.slice(star + 1);
  return lowerPath.length >= head.length + tail.length && lowerPath.startsWith(head) && lowerPath.endsWith(tail);
}

// Claude Code and Cursor also load skills and rules from a .claude/ or
// .cursor/ folder below the root.
const NESTED_AGENT_CONFIG = /\/\.(claude|cursor)\//i;

type Owner = { why: string; jaspers: boolean };

// In this order, so a mistake lands on Jasper's side: a nested agent folder
// is his even inside the carve-out (features/.claude/rules/x.md ends in .md
// too), and Jasper's list wins over a panel pattern that also matches.
function owner(path: string): Owner | undefined {
  if (NESTED_AGENT_CONFIG.test(path)) return { why: "agent skills or rules below the repo root", jaspers: true };
  const carved = CARVED_OUT.find(({ pattern }) => matchesPattern(pattern, path));
  if (carved) return { why: carved.why, jaspers: false };
  const jaspers = JASPERS_PATHS.find(({ pattern }) => matchesPattern(pattern, path));
  if (jaspers) return { why: jaspers.why, jaspers: true };
  const panel = PANEL_PATHS.find(({ pattern }) => matchesPattern(pattern, path));
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
