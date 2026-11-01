import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isSentence } from "../../eslint-rules/turnpoint.mjs";

// The Review board has three corners (JAS-94): rounded-md (6px), rounded-sm
// (4px) and rounded-full, plus their one-side forms where an open row meets its
// panel. A one-off corner on a single card is how the site drifted last time,
// and the same 20px box was the biggest thing that made it look AI-made.

const ALLOWED = /^rounded(?:-(?:[trblse]|[tb][lr]|s[se]|e[se]))?-(?:sm|md|full)$/;
const BEVELED = [/hud-cut/, /corner-shape\s*:/, /border-radius:\s*[^;{]*\b0\b/];
// The share image has no stylesheet to read classes from, so it writes its
// corners out. A test below holds them to the same 6px.
const SHARE_IMAGE = /^src[\\/]app[\\/]player[\\/].*opengraph-image\.tsx$/;

// The parts of a file that can set a corner: its strings, and any style key
// such as borderRadius. A variable called `rounded` or a comment saying "rounded
// to whole blocks" isn't either.
function cornerCode(path: string, source: string): { strings: string[]; radiusKeys: string[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest);
  const strings: string[] = [];
  const radiusKeys: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      strings.push(node.text);
    }
    if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && /^border\w*Radius$/.test(node.text)) {
      radiusKeys.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { strings, radiusKeys };
}

function badCornerClasses(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/[;,}]+$/, ""))
    .filter((token) => {
      // Tailwind's [border-radius:10px] writes a corner without its class names.
      if (/\[[\w-]*radius:/.test(token)) return true;
      // "hover:rounded-lg" and "!rounded-lg" are still rounded-lg.
      const name = (token.split(":").at(-1) ?? token).replace(/^!|!$/g, "");
      // "The rounded gap must be positive" uses the word, not the class.
      if (name === "rounded") return !isSentence(text);
      return /^(?:soft-round|rounded-)/.test(name) && !ALLOWED.test(name);
    });
}

// One line per problem, each naming the fix. Exported nowhere: the cases below
// run it on planted code, then on every file in src.
function cornerProblems(path: string, source: string): string[] {
  const isCss = path.endsWith(".css");
  const withoutComments = isCss ? source.replace(/\/\*[\s\S]*?\*\//g, "") : source;
  const { strings, radiusKeys } = isCss
    ? { strings: [withoutComments], radiusKeys: [] }
    : cornerCode(path, source);
  const problems = strings.flatMap(badCornerClasses).map(
    (name) => `${path} uses ${name}: use rounded-md, rounded-sm or rounded-full (.claude/rules/design.md)`,
  );
  const allStrings = strings.join("\n");
  for (const pattern of BEVELED) {
    if (pattern.test(allStrings)) problems.push(`${path} matches ${pattern}: no beveled corners`);
  }
  if (/border(?:-[a-z]+)*-radius(?:\s*:|$)/m.test(allStrings)) {
    problems.push(`${path} sets a border radius: use rounded-md, rounded-sm or rounded-full instead`);
  }
  if (radiusKeys.length > 0 && !SHARE_IMAGE.test(path)) {
    problems.push(`${path} sets ${radiusKeys[0]}: use rounded-md, rounded-sm or rounded-full instead`);
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
    ["a class in a string that starts with a capital", 'const box = "Card rounded-lg";'],
    ["an arbitrary radius", '<div className="[border-radius:10px]" />'],
    ["an arbitrary radius behind a variant", '<div className="hover:[border-radius:8px]" />'],
    ["an arbitrary corner radius", '<div className="[border-top-left-radius:10px]" />'],
    ["an inline radius", "<div style={{ borderRadius: 10 }} />"],
    ["an inline corner radius", "<div style={{ borderTopLeftRadius: 10 }} />"],
    ["an inline radius with its key in quotes", '<div style={{ "borderRadius": 10 }} />'],
    ["a radius in a style block", '<style>{".a { border-radius: 10px; }"}</style>'],
    ["a radius set by script", 'el.style.setProperty("border-radius", "20px");'],
    ["a class after a capital word", 'const box = "Card rounded p-4";'],
    ["a class list of plain words", 'const box = "block rounded border";'],
    ["hud-cut", '<div className="hud-cut" />'],
    ["a beveled corner shape", '<div className="[corner-shape:bevel]" />'],
  ])("fails on %s", (_, source) => {
    expect(cornerProblems("src/app/x.tsx", source)).not.toEqual([]);
  });

  it.each([
    ["@apply with a big corner", ".box { @apply rounded-lg; }"],
    ["a border-radius", ".box { border-radius: 10px; }"],
    ["a border radius on one corner", ".box { border-top-left-radius: 10px; }"],
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
    ["hud-cut in a comment", "// the old hud-cut class is gone\nexport const a = 1;"],
    ["a style key named in a comment", "// no borderRadius here\nexport const a = 1;"],
  ])("passes %s", (_, source) => {
    expect(cornerProblems("src/app/x.tsx", source)).toEqual([]);
  });

  it("passes @apply with an allowed corner", () => {
    expect(cornerProblems("src/app/x.css", ".box { @apply rounded-md; }")).toEqual([]);
  });

  it("lets only the share image set its own radius", () => {
    const source = "<img style={{ borderRadius: 20 }} />";
    expect(cornerProblems("src/app/player/x/opengraph-image.tsx", source)).toEqual([]);
    expect(cornerProblems("src/components/x.tsx", source)).not.toEqual([]);
    expect(cornerProblems("src/components/opengraph-image.tsx", source)).not.toEqual([]);
  });

  const files = sourceFiles("src").filter((path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path));

  it("gives the share image the same 6px corners", () => {
    const shareImage = files.filter((path) => SHARE_IMAGE.test(path));
    const radii = shareImage.flatMap((path) => [...readFileSync(path, "utf8").matchAll(/border\w*Radius"?\s*:\s*([^,\s}]+)/g)]);
    expect(radii.map((match) => match[1])).toEqual(["6", "6"]);
  });

  it("passes on every file in src", () => {
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
