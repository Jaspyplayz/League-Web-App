import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The both-themes check. globals.css sets every colour twice: the dark value
// (and the default) in @theme, and the light one under data-theme="light". A
// colour with only a dark value shows its dark shade on the light theme, which
// is how a light page ends up with a dark panel in it.

// The Rift's own colours are the same in both themes on purpose, so the
// replay's map matches Riot's picture of it.
const SAME_IN_BOTH_THEMES = new Set(["rift-ground", "rift-wall"]);

// A token whose value is just another colour token, like
// `--color-surface: var(--color-panel)`, follows that token into either theme,
// so it needs no light value of its own.
const ALIAS = /^var\(--color-([\w-]+)\)$/;

// The colour tokens set inside the first block that starts with `opener`,
// as name (without --color-) to value.
function colourTokens(css: string, opener: string): Map<string, string> {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`globals.css has no block starting with ${opener}`);
  const body = css.slice(start + opener.length, css.indexOf("\n}", start));
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const [, name, value] of withoutComments.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

const DARK = "@theme static {";
const LIGHT = ':root[data-theme="light"] {';

// What the check reports: one line per colour that has a dark value and no
// light one, each naming the fix.
function missingLightValues(css: string): string[] {
  const dark = colourTokens(css, DARK);
  const light = colourTokens(css, LIGHT);
  return [...dark]
    .filter(([name, value]) => !ALIAS.test(value) && !SAME_IN_BOTH_THEMES.has(name) && !light.has(name))
    .map(([name]) => `--color-${name} has a dark value and no light one: add it to the data-theme="light" block in src/app/globals.css`);
}

const css = readFileSync("src/app/globals.css", "utf8");

describe("both themes", () => {
  it("gives every colour with a dark value a light one", () => {
    expect(missingLightValues(css)).toEqual([]);
  });

  it("catches a colour with a dark value and no light one", () => {
    const sample = `${DARK}\n  --color-page: #000;\n  --color-new: #123456;\n  --color-rift-wall: #000a13;\n  --color-alias: var(--color-page);\n}\n${LIGHT}\n  --color-page: #fff;\n}\n`;
    expect(missingLightValues(sample)).toEqual([
      '--color-new has a dark value and no light one: add it to the data-theme="light" block in src/app/globals.css',
    ]);
  });

  it("sets no light colour the dark theme lacks", () => {
    const dark = colourTokens(css, DARK);
    const extra = [...colourTokens(css, LIGHT).keys()].filter((name) => !dark.has(name));
    expect(extra).toEqual([]);
  });

  it("keeps each alias following its token in both themes", () => {
    const dark = colourTokens(css, DARK);
    const light = colourTokens(css, LIGHT);
    const problems: string[] = [];
    for (const [name, value] of dark) {
      const target = ALIAS.exec(value)?.[1];
      if (!target) continue;
      if (!dark.has(target)) problems.push(`--color-${name} points at --color-${target}, which doesn't exist`);
      // A light value here would stop the alias following its token.
      if (light.has(name)) problems.push(`--color-${name} is an alias, so the light theme shouldn't set it`);
    }
    expect(problems).toEqual([]);
  });
});

// The Review board tokens (JAS-94) and where each old name points while pages
// move to the new names (JAS-96's table). The contract ticket deletes the old
// names and this part of the test with them.
describe("Review board tokens", () => {
  const NEW_TOKENS = [
    "page",
    "panel",
    "raised",
    "select",
    "divider",
    "main",
    "quiet",
    "placeholder",
    "ahead",
    "ahead-soft",
    "ahead-bright",
    "behind",
    "ahead-fill",
    "behind-fill",
    "grade-brilliant",
    "grade-great",
    "grade-best",
    "grade-excellent",
    "grade-good",
    "grade-even",
    "grade-book",
    "grade-inaccuracy",
    "grade-mistake",
    "grade-miss",
    "grade-blunder",
  ];

  const OLD_TO_NEW: Record<string, string> = {
    surface: "panel",
    "surface-hover": "raised",
    line: "divider",
    "line-strong": "divider",
    ink: "main",
    "ink-soft": "main",
    muted: "quiet",
    faint: "quiet",
  };

  it("sets every new token in both themes", () => {
    const dark = colourTokens(css, DARK);
    const light = colourTokens(css, LIGHT);
    expect(NEW_TOKENS.filter((name) => !dark.has(name) || !light.has(name))).toEqual([]);
  });

  it("uses JAS-94's page and panel colours", () => {
    const dark = colourTokens(css, DARK);
    const light = colourTokens(css, LIGHT);
    expect([dark.get("page"), light.get("page")]).toEqual(["#21201d", "#f1efeb"]);
    expect([dark.get("panel"), light.get("panel")]).toEqual(["#2b2925", "#ffffff"]);
  });

  it("points each old name at its new token", () => {
    const dark = colourTokens(css, DARK);
    const pointsAt = Object.fromEntries(Object.keys(OLD_TO_NEW).map((old) => [old, ALIAS.exec(dark.get(old) ?? "")?.[1]]));
    expect(pointsAt).toEqual(OLD_TO_NEW);
  });

  it("hides the panel outline, since Review board panels have no border", () => {
    expect(colourTokens(css, DARK).get("frame")).toBe("transparent");
  });
});
