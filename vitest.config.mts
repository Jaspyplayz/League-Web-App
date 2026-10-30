import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Lets tests load modules that import with "@/..." (set up in tsconfig.json),
  // the way Next.js does.
  resolve: { tsconfigPaths: true },
  // e2e/ holds the Playwright browser test, which runs with `npm run test:e2e`.
  // .claude/worktrees/ holds subagents' copies of the repo, whose tests would
  // otherwise run a second time, half-finished.
  // poteto-mode's scripts are a copy of pstack's code with Bun tests
  // (`bun:test`), which Vitest can't run (decision record 0014).
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/worktrees/**", ".claude/skills/poteto-mode/scripts/**"],
  },
});
