import { readdirSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The browser tests in e2e/ find buttons, tabs and headings by the words on
// them. Rename "Deep dive" in a page and the smoke test breaks, but only on
// the Vercel preview, after a deploy we have few of. This walks the same
// words and fails here first if no text in src/ says them any more.
//
// Its limits: it can tell that some text says the words, not that the page the
// test opens does. The loading skeleton also says "Replay", so renaming only
// that tab stays green. Names held in a variable or a regex aren't read.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Names a page builds from data, so the full words never appear in src. Each
// gives the code that builds them, and a test checks it's still in that file,
// so an entry can't outlive what it points to.
const BUILT_FROM_DATA: Record<string, { file: string; code: string }> = {
  "Continue with Google": { file: "src/app/sign-in/sign-in-panel.tsx", code: "Continue with {PROVIDERS[provider]}" },
  "Continue with Discord": { file: "src/app/sign-in/sign-in-panel.tsx", code: "Continue with {PROVIDERS[provider]}" },
  "You vs Challenger": { file: "src/app/player/[region]/[riotId]/insights/tier-comparison.tsx", code: "You vs {tierName(tier)}" },
  "Diamond I": { file: "src/components/rank-badge.tsx", code: "`${tierName(tier)} ${division}`" },
  "No one on Pinned matches.": { file: "src/components/saved-players-box.tsx", code: "`No one on ${tab.label} matches.`" },
  "Remove Hide on bush#KR1 from recent players": { file: "src/components/saved-players-box.tsx", code: "`Remove ${riotId} ${removeLabel}`" },
  "Unpin Hide on bush#KR1": { file: "src/components/saved-players-box.tsx", code: "`Unpin ${riotId}`" },
  // The test's own template string, read as it's written in e2e/smoke.spec.ts.
  "chance to win: ${chance}": { file: "src/app/player/[region]/[riotId]/match/[matchId]/board.tsx", code: "chance to win: ${shown}%" },
};

// A quoted name in getByRole(..., { name: "..." }), the first argument of
// getByText, getByLabel and the like, or the words an assertion or filter
// expects. A regex name matches many wordings, so it's no use to look up here.
const QUOTED = String.raw`(["'${"`"}])((?:(?!\1)[^\\]|\\.)*)\1`;
const LOOKUPS = [
  new RegExp(String.raw`getByRole\(\s*["']\w+["']\s*,\s*\{[^}]*?\bname:\s*${QUOTED}`, "g"),
  new RegExp(String.raw`getBy(?:Text|Label|Placeholder|Title|AltText)\(\s*${QUOTED}`, "g"),
  new RegExp(String.raw`(?:toHaveText\(|toContainText\(|hasText:)\s*${QUOTED}`, "g"),
];

function e2eText(): { file: string; text: string }[] {
  return files("e2e").flatMap((file) => {
    const code = readFileSync(file, "utf8");
    return LOOKUPS.flatMap((lookup) =>
      [...code.matchAll(lookup)].map((match) => ({ file, text: match[2].replace(/\\(.)/g, "$1") })),
    );
  });
}

// The strings and JSX text in one file, read with the TypeScript parser. A
// plain search would count "Replay" in ReplayRequest or an import, and a
// comment still saying "Deep dive" is how an early version of this check missed
// that break. JSX's &apos; becomes an apostrophe, and text split across lines
// is joined with one space, as JSX does.
function pageWords(fileName: string, code: string): string[] {
  const words: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddleOrTemplateTail(node) || ts.isJsxText(node)) {
      words.push(node.text.replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " "));
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest));
  return words;
}

// Test data and the MCP server's answers aren't on a page.
function srcText(): string {
  return files("src")
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.|test-fixtures|\/lib\/mcp\//.test(path))
    .flatMap((path) => pageWords(path, readFileSync(path, "utf8")))
    .join("\n");
}

describe("pageWords", () => {
  const says = (code: string) => pageWords("page.tsx", code).join("\n").includes("Deep dive");

  it.each([
    ["a line comment", "// Deep dive"],
    ["a line comment right after code", "const a = 1;// Deep dive"],
    ["a block comment", "const a = /* Deep dive */ 1;"],
    ["a JSX comment", "const a = <p>{/* Deep dive */}</p>;"],
    ["an import", 'import a from "Deep dive";'],
    ["a name in the code", "const DeepDive = 1; const Deep_dive = 2;"],
  ])("doesn't count %s", (_, code) => {
    expect(says(code)).toBe(false);
  });

  it.each([
    ["a string", 'const a = "Deep dive";'],
    ["a template's text", "const a = `${b} Deep dive ${c}`;"],
    ["JSX text across lines", "const a = <p>\n  Deep\n  dive\n</p>;"],
    ["a label", 'const a = <p aria-label="Deep dive" />;'],
    ["a string after one holding a comment's start", 'const a = "/*"; const b = "Deep dive";'],
  ])("counts %s", (_, code) => {
    expect(says(code)).toBe(true);
  });
});

describe("words the browser tests look for", () => {
  const found = e2eText();

  it("finds them in e2e/, with each pattern", () => {
    // A broken pattern would find nothing and pass the next test.
    const texts = found.map((f) => f.text);
    expect(texts).toContain("Recent matches");
    expect(texts).toContain("No one on Pinned matches.");
    expect(texts).toContain("We couldn't find that page");
  });

  it("are still in the text of src/", () => {
    const src = srcText();
    const missing = found
      .filter(({ text }) => !Object.hasOwn(BUILT_FROM_DATA, text) && !src.includes(text))
      .map(({ file, text }) => `${file} looks for "${text}", which no text in src/ says`);
    expect(missing).toEqual([]);
  });

  it("lists only built-from-data names that a test still looks for", () => {
    const texts = new Set(found.map((f) => f.text));
    expect(Object.keys(BUILT_FROM_DATA).filter((text) => !texts.has(text))).toEqual([]);
  });

  it("keeps the code behind each built-from-data name", () => {
    const gone = Object.entries(BUILT_FROM_DATA)
      .filter(([, { file, code }]) => !readFileSync(file, "utf8").includes(code))
      .map(([text, { file, code }]) => `"${text}" comes from ${code} in ${file}, which isn't there`);
    expect(gone).toEqual([]);
  });
});
