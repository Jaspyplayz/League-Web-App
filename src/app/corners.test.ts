import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The Review board has three corners (JAS-94): rounded-md (6px), rounded-sm
// (4px) and rounded-full, plus their one-side forms where an open row meets its
// panel. A one-off corner on a single card is how the site drifted last time,
// and the same 20px box was the biggest thing that made it look AI-made.

const ALLOWED = /^rounded(?:-(?:[trblse]|[tb][lr]|s[se]|e[se]))?-(?:sm|md|full)$/;
const BEVELED = [/hud-cut/, /corner-shape\s*:/, /border-radius:\s*[^;{]*\b0\b/];
// The share image has no stylesheet to read classes from, so it sets its own.
const SETS_ITS_OWN_RADIUS = /opengraph-image\.tsx$/;

// Only the strings: a variable called `rounded` or a comment saying "rounded to
// whole blocks" isn't a class. Nor is a sentence, which starts with a capital. Nor is a sentence, which starts with a capital.
function stringsIn(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (!/^[A-Z]/.test(node.text)) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function badCornerClasses(text: string): string[] {
  return text
    .split(/\s+/)
    // "hover:rounded-lg" and "!rounded-lg" are still rounded-lg.
    .map((token) => (token.split(":").at(-1) ?? token).replace(/^!|!$/g, ""))
    .filter((name) => /^(?:soft-round|rounded(?:$|-))/.test(name) && !ALLOWED.test(name));
}

// One line per problem, each naming the fix. Exported nowhere: the cases below
// run it on planted code, then on every file in src.
function cornerProblems(path: string, source: string): string[] {
  const isCss = path.endsWith(".css");
  const withoutComments = isCss ? source.replace(/\/\*[\s\S]*?\*\//g, "") : source;
  const classes = isCss ? badCornerClasses(withoutComments) : stringsIn(path, source).flatMap(badCornerClasses);
  const problems = classes.map(
    (name) => `${path} uses ${name}: use rounded-md, rounded-sm or rounded-full (.claude/rules/design.md)`,
  );
  for (const pattern of BEVELED) {
    if (pattern.test(withoutComments)) problems.push(`${path} matches ${pattern}: no beveled corners`);
  }
  if (isCss && /border-radius\s*:/.test(withoutComments)) {
    problems.push(`${path} sets border-radius: use rounded-md, rounded-sm or rounded-full instead`);
  }
  if (!isCss && !SETS_ITS_OWN_RADIUS.test(path) && /\bborderRadius\b/.test(source)) {
    problems.push(`${path} sets borderRadius: use rounded-md, rounded-sm or rounded-full instead`);
  }
  return problems;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("corners", () => {
  it.each([
    ["soft-round", '<div className="soft-round p-4" />'],
    ["soft-round-sm", '<div className="soft-round-sm p-4" />'],
    ["plain rounded", '<div className="rounded bg-page" />'],
    ["rounded-xs", '<div className="rounded-xs" />'],
    ["rounded-lg", '<div className="rounded-lg" />'],
    ["rounded-xl", '<div className="rounded-xl" />'],
    ["rounded-2xl", '<div className="rounded-2xl" />'],
    ["rounded-3xl", '<div className="rounded-3xl" />'],
    ["rounded-4xl", '<div className="rounded-4xl" />'],
    ["a made-up size", '<div className="rounded-[10px]" />'],
    ["a size from a variable", '<div className="rounded-(--my-radius)" />'],
    ["no rounding by class", '<div className="rounded-none" />'],
    ["a big one-side corner", '<div className="rounded-t-lg" />'],
    ["a big one-corner size", '<div className="rounded-tl-xl" />'],
    ["a big corner behind a variant", '<div className="hover:rounded-lg" />'],
    ["a big corner marked important", '<div className="!rounded-lg" />'],
    ["a class in a constant", 'const box = "rounded-xl p-4";'],
    ["a class in a template string", "const box = (x: string) => `rounded-lg ${x} p-4`;"],
    ["a class after a template's value", "const box = (x: string) => `${x} rounded p-4`;"],
    ["a size built from a value", "const box = (x: string) => `rounded-${x}`;"],
    ["an inline radius", "<div style={{ borderRadius: 10 }} />"],
    ["hud-cut", '<div className="hud-cut" />'],
    ["a beveled corner shape", '<div className="[corner-shape:bevel]" />'],
  ])("fails on %s", (_, source) => {
    expect(cornerProblems("src/app/x.tsx", source)).not.toEqual([]);
  });

  it.each([
    ["@apply with a big corner", ".box { @apply rounded-lg; }"],
    ["a border-radius", ".box { border-radius: 10px; }"],
    ["a square corner", ".box { border-radius: 0; }"],
    ["a beveled corner", ".box { corner-shape: bevel; }"],
  ])("fails in a stylesheet on %s", (_, source) => {
    expect(cornerProblems("src/app/x.css", source)).not.toEqual([]);
  });

  it("names the class and the fix", () => {
    expect(cornerProblems("src/app/x.tsx", '<div className="rounded-lg" />')).toEqual([
      "src/app/x.tsx uses rounded-lg: use rounded-md, rounded-sm or rounded-full (.claude/rules/design.md)",
    ]);
  });

  it.each([
    ["rounded-md", '<div className="rounded-md" />'],
    ["rounded-sm", '<div className="rounded-sm" />'],
    ["rounded-full", '<div className="rounded-full" />'],
    ["a one-side form", '<div className="rounded-t-md rounded-bl-sm" />'],
    ["a variant", '<div className="md:rounded-l-sm hover:rounded-full" />'],
    ["a variable called rounded", "const rounded = Math.round(1.2);\nexport const shown = rounded > 0;"],
    ["a comment", "// rounded to whole blocks, not rounded-lg\nexport const a = 1;"],
    ["words on the page", "<p>Numbers are rounded, like rounded-lg corners.</p>"],
    ["a sentence in a string", 'throw new Error("The rounded gap must be positive");'],
    ["a sentence in a string", 'throw new Error("The rounded gap must be positive");'],
  ])("passes %s", (_, source) => {
    expect(cornerProblems("src/app/x.tsx", source)).toEqual([]);
  });

  it("lets only the share image set its own radius", () => {
    const source = "<img style={{ borderRadius: 20 }} />";
    expect(cornerProblems("src/app/player/x/opengraph-image.tsx", source)).toEqual([]);
    expect(cornerProblems("src/components/x.tsx", source)).not.toEqual([]);
  });

  it("passes on every file in src", () => {
    const files = sourceFiles("src").filter((path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((path) => cornerProblems(path, readFileSync(path, "utf8")))).toEqual([]);
  });

  // Tailwind 3's rounded-sm was 2px, so a major upgrade could move every corner
  // without a line changing here.
  it("gets 6px and 4px from Tailwind's rounded-md and rounded-sm", () => {
    const theme = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
    expect(theme).toContain("--radius-md: 0.375rem");
    expect(theme).toContain("--radius-sm: 0.25rem");
    expect(readFileSync("src/app/globals.css", "utf8")).not.toMatch(/--radius-/);
  });

  it("builds every card from one 6px class", () => {
    const panel = readFileSync("src/components/ui/panel.tsx", "utf8");
    expect(panel).toContain('export const panelClass = "rounded-md border border-transparent bg-panel"');
  });
});
