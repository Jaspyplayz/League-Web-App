// The one list of paths that make a PR Jasper's to merge (issue #158).
// `npm run can-merge` refuses a PR that touches any of them, whatever its
// tier says. The docs link here instead of copying the list.
//
// A path is risky when it starts with a pattern, so a pattern ending in "/"
// covers a whole folder and "src/lib/ask" covers ask.ts, ask-store.ts and
// their tests. A pattern with a "*" must match the whole path, so
// "src/lib/*-store.ts" covers the stores but not their tests.

export type RiskyPath = { pattern: string; why: string };

export const RISKY_PATHS: readonly RiskyPath[] = [
  // The risky row of docs/workflow.md's tier table.
  { pattern: "src/db/", why: "the database schema and queries" },
  { pattern: "drizzle/", why: "database migrations" },
  { pattern: "drizzle.config.ts", why: "where migrations run" },
  { pattern: "src/lib/*-store.ts", why: "database reads and writes, including deletes" },
  { pattern: "src/lib/my-player.ts", why: "links a user to their player in the database" },
  { pattern: "scripts/remap-puuids", why: "rewrites player IDs in the live database" },
  { pattern: "scripts/collect-benchmarks", why: "writes and deletes rows in the live database" },
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
  { pattern: "src/app/player/[region]/[riotId]/insights/advance.ts", why: "a server action anyone can call, which spends Riot calls" },
  { pattern: "src/lib/ask", why: "Ask spends Claude API money" },
  { pattern: "src/lib/recap", why: "AI recaps spend Claude API money" },
  { pattern: "src/app/player/[region]/[riotId]/ask/", why: "Ask spends Claude API money" },
  { pattern: "src/lib/analyzer/score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/phase-score-model.json", why: "a trained model" },
  { pattern: "src/lib/analyzer/win-chance-model.json", why: "a trained model" },
  { pattern: "scripts/train-", why: "model training" },
  { pattern: "src/app/privacy/", why: "Riot reviews it for production keys" },
  { pattern: "src/app/terms/", why: "Riot reviews it for production keys" },

  // Anything that defines or runs a check, since loosening one is risky.
  { pattern: ".github/", why: "CI, the smoke test and the PR template" },
  { pattern: ".claude/settings.json", why: "Claude's deny rules and commit hook" },
  { pattern: ".claude/hooks/", why: "the commit hook" },
  { pattern: ".claude/agents/reviewer.md", why: "the reviewer agent" },
  { pattern: ".claude/skills/", why: "skills the reviewer loads" },
  { pattern: ".claude/rules/", why: "rules the reviewer checks against" },
  { pattern: "eslint.config.mjs", why: "lint" },
  { pattern: "eslint-rules/", why: "lint" },
  { pattern: "tsconfig.json", why: "the type check" },
  { pattern: "next.config.ts", why: "the build, which can skip type errors" },
  { pattern: "vercel.json", why: "Vercel's build settings" },
  { pattern: "vitest.config.mts", why: "unit tests" },
  { pattern: "playwright.config.ts", why: "the smoke test" },
  { pattern: "e2e/", why: "the smoke test and accessibility scan" },
  { pattern: "package.json", why: "the commands CI runs, and dependencies" },
  { pattern: "package-lock.json", why: "dependencies" },

  // The merge rules themselves.
  { pattern: ".claude/agent-merge.json", why: "the switch for agent merging" },
  { pattern: "scripts/can-merge", why: "the merge gates" },
  { pattern: "scripts/risky-paths", why: "this list" },
];

export function matchesPattern(pattern: string, path: string): boolean {
  const star = pattern.indexOf("*");
  if (star === -1) return path.startsWith(pattern);
  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);
  return path.length >= head.length + tail.length && path.startsWith(head) && path.endsWith(tail);
}

export function riskyFiles(paths: readonly string[]): { path: string; why: string }[] {
  return paths.flatMap((path) => {
    const match = RISKY_PATHS.find(({ pattern }) => matchesPattern(pattern, path));
    return match ? [{ path, why: match.why }] : [];
  });
}
