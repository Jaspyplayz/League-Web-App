import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import turnpoint from "./eslint-rules/turnpoint.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turnpoint's own rules. Each is a named rule, not a no-restricted-syntax
  // pattern: when two blocks set the same rule, the later block's options
  // replace the earlier ones, so overlapping patterns would silently drop.
  { plugins: { turnpoint } },
  {
    ignores: ["src/lib/riot/**"],
    rules: { "turnpoint/no-riot-api-host": "error" },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}", "src/db/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "turnpoint/server-only-env": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "turnpoint/no-green-classes": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "turnpoint/review-board-type": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    // The three files JAS-94 allows their own colours: the share image can't
    // read CSS variables, and the brand logos and rank badge tints are fixed.
    ignores: [
      "**/*.test.{ts,tsx}",
      "src/app/player/**/opengraph-image.tsx",
      "src/components/icons.tsx",
      "src/components/rank-tints.ts",
    ],
    rules: { "turnpoint/tokens-only": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Subagents' copies of the repo. The commit hook lints each one in its own folder.
    ".claude/worktrees/**",
    // poteto-mode's scripts, copied unchanged from pstack's repo, which checks
    // them with its own Bun tools (decision record 0014).
    ".claude/skills/poteto-mode/scripts/**",
    // Git-ignored scratch files and downloaded data. Nobody else can see them,
    // so one with a lint error shouldn't block a commit through the hook.
    ".cache/**",
  ]),
]);

export default eslintConfig;
