import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The browser tests in e2e/ find buttons, tabs and headings by the words on
// them. Rename "Deep dive" in a page and the smoke test breaks, but only on
// the Vercel preview, after a deploy we have few of. This walks the same
// words and fails here first if a page no longer says them.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Names a page builds from data, so the full words never appear in src.
// Each says where the words come from.
const BUILT_FROM_DATA: Record<string, string> = {
  "Continue with Google": "src/app/sign-in/page.tsx: Continue with {PROVIDERS[provider]}",
  "Continue with Discord": "src/app/sign-in/page.tsx: Continue with {PROVIDERS[provider]}",
  "You vs Challenger": "insights/tier-comparison.tsx: You vs {tierName(tier)}",
};

// A quoted name in getByRole(..., { name: "..." }), or the first argument of
// getByText, getByLabel and the like. Regex names (/.../) are left out on purpose.
const LOOKUPS = [
  /getByRole\(\s*["']\w+["']\s*,\s*\{[^}]*?\bname:\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g,
  /getBy(?:Text|Label|Placeholder|Title|AltText)\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g,
];

function e2eText(): { file: string; text: string }[] {
  return files("e2e").flatMap((file) => {
    const code = readFileSync(file, "utf8");
    return LOOKUPS.flatMap((lookup) =>
      [...code.matchAll(lookup)].map((match) => ({ file, text: match[2].replace(/\\(.)/g, "$1") })),
    );
  });
}

// Comments go first: a comment still saying "Deep dive" after the tab was
// renamed is how this check missed that break. Then JSX's &apos; becomes an
// apostrophe, and text split across lines is joined with one space, as JSX does.
function srcText(): string {
  return files("src")
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\./.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

describe("words the browser tests look for", () => {
  const found = e2eText();

  it("finds them in e2e/", () => {
    // A broken pattern would find nothing and pass the next test.
    expect(found.length).toBeGreaterThan(30);
    expect(found.map((f) => f.text)).toContain("Recent matches");
  });

  it("are still on a page in src/", () => {
    const src = srcText();
    const missing = found
      .filter(({ text }) => !(text in BUILT_FROM_DATA) && !src.includes(text))
      .map(({ file, text }) => `${file} looks for "${text}", which no file in src/ says`);
    expect(missing).toEqual([]);
  });

  it("lists only built-from-data names that a test still looks for", () => {
    const texts = new Set(found.map((f) => f.text));
    expect(Object.keys(BUILT_FROM_DATA).filter((text) => !texts.has(text))).toEqual([]);
  });
});
