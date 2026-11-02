// The paths that make a PR risky (issue #158), in two lists (JAS-128):
//
// - JASPERS_PATHS: migrations, the schema they come from, anything that
//   defines or runs a check, apart from the smoke test's specs in e2e/, and
//   the ticket queue's code, which decides what builders run unattended.
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
  // Migrations are generated from it, and nothing checks that one was, so a
  // change here with no migration would break the live site's reads.
  { pattern: "src/db/schema.ts", why: "the tables migrations are generated from" },

  // Anything that defines or runs a check, since loosening one is risky.
  { pattern: ".github/", why: "CI, the smoke test and the PR template" },
  { pattern: ".claude/settings", why: "Claude's deny rules and commit hook, and local overrides of them" },
  { pattern: ".claude/hooks/", why: "the commit hook, and the startup hook that runs commands in every cloud session" },
  { pattern: ".claude/agents/", why: "the reviewer agent, and any agent that could take its name" },
  { pattern: ".cursor/settings.json", why: "Cursor isn't used any more, but its settings could still turn on an AI tool here" },
  { pattern: ".cursor/rules/", why: "Cursor isn't used any more, but a rule here could still give an AI tool instructions" },
  { pattern: ".claude/skills/", why: "skills the reviewer loads" },
  { pattern: ".claude/rules/", why: "rules the reviewer checks against" },
  // The configs match without an extension, because each tool loads other file
  // names first: an eslint.config.js would replace the .mjs.
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
  { pattern: "package.json", why: "the commands CI runs, and dependencies" },
  { pattern: "package-lock.json", why: "dependencies" },
  { pattern: ".npmrc", why: "how npm ci installs, in every workflow" },
  { pattern: ".nvmrc", why: "the Node version CI uses" },
  { pattern: ".mcp.json", why: "tools every agent here would load" },

  // The merge rules themselves.
  { pattern: ".claude/agent-merge.json", why: "the switch for agent merging" },
  { pattern: "scripts/can-merge", why: "the merge gates" },
  { pattern: "scripts/risky-paths", why: "these lists" },

  // /run-queue picks tickets and starts builders with nobody watching
  // (JAS-143, decision record 0026).
  { pattern: "scripts/run-queue", why: "the ticket queue, which decides what builders run unattended" },

  // Last, so the reasons above come first: any other Claude Code file, such
  // as a new commands folder, could steer agents too.
  { pattern: ".claude/", why: "Claude Code's own setup, which steers every agent here" },
];

// Inside JASPERS_PATHS, but Claude merges their Markdown after the panel, like
// PANEL_PATHS (JAS-146, decision record 0028). Most redesign PRs update the
// verify skills, so Jasper chose to let them go (2026-11-01). Agents follow
// them, so they still get the panel and the reviewer, and risky-paths.test.ts
// keeps each SKILL.md to its name and a description, since one could otherwise
// grant tools, add hooks or run commands.
export const PANEL_SKILLS: readonly string[] = ["verify", "verify-turnpoint", "verify-turnpoint-ux", "postmortem"];
const SKILL_CREDITS = ".claude/skills/THIRD-PARTY-NOTICES.md";

// Markdown directly in a listed skill's folder or its features/ folder. Exact
// capitals, and no backslash, which Windows reads as a folder break, so a path
// that could reach another skill stays Jasper's.
const PANEL_SKILL_FILE = new RegExp(`^\\.claude/skills/(?:${PANEL_SKILLS.join("|")})/(features/)?([^/\\\\]+\\.md)$`);

function isPanelSkillFile(path: string): boolean {
  const match = PANEL_SKILL_FILE.exec(path);
  if (!match) return false;
  const [, features, name] = match;
  // A CLAUDE or AGENTS file would steer every agent working in the folder.
  if (/^(claude|agents)/i.test(name)) return false;
  // Only the skill's own SKILL.md, spelled exactly so: a skill.md beside it
  // would replace it on Windows or a Mac, and one in features/ could become a
  // skill of its own.
  if (/^skill/i.test(name)) return !features && name === "SKILL.md";
  return true;
}

export const PANEL_PATHS: readonly RiskyPath[] = [
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

  // The smoke test's specs, which Jasper chose to let go. They're tests like
  // any other, which the reviewer and the panel read; what decides whether and
  // how they run (playwright.config.ts, .github/) stays on Jasper's list.
  { pattern: "e2e/", why: "the smoke test and accessibility scan" },

  // The look's foundation (JAS-94). Page restyles that only use the tokens
  // stay off this list.
  { pattern: "src/app/globals.css", why: "the palette in both themes, the corners and the fonts" },
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

// Claude Code and Cursor also load skills and rules from a .claude/ or
// .cursor/ folder below the root.
const NESTED_AGENT_CONFIG = /\/\.(claude|cursor)\//i;

type Owner = { why: string; jaspers: boolean };

// In this order, so a mistake lands on Jasper's side: his list wins over a
// panel pattern that also matches, such as src/db/schema.ts inside src/db/.
function owner(path: string): Owner | undefined {
  if (NESTED_AGENT_CONFIG.test(path)) return { why: "agent skills or rules below the repo root", jaspers: true };
  if (path === SKILL_CREDITS) return { why: "credits for the copied skills", jaspers: false };
  if (isPanelSkillFile(path)) return { why: "the verify and postmortem skills, which agents follow", jaspers: false };
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
