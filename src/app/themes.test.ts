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
  // A second block would be skipped here, so its colours would go unchecked.
  if (css.indexOf(opener, start + 1) !== -1) throw new Error(`globals.css has more than one ${opener} block`);
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
  // Every approved value as [dark, light]: JAS-94's table (with light ahead,
  // light behind and dark behind nudged to pass 4.5:1, which Jasper approved on
  // PR 231), and the grades from JAS-77. A typo in globals.css fails here
  // instead of shipping.
  const SPEC: Record<string, [dark: string, light: string]> = {
    page: ["#21201d", "#f1efeb"],
    panel: ["#2b2925", "#ffffff"],
    raised: ["#353330", "#f6f5f2"],
    select: ["rgb(255 255 255 / 7%)", "rgb(30 28 25 / 6%)"],
    divider: ["#3e3b36", "#dedad2"],
    main: ["#f2efe9", "#1e1c19"],
    quiet: ["#aaa498", "#645e55"],
    placeholder: ["#7d786f", "#9a948a"],
    ahead: ["#62a8ff", "#105dcc"],
    "ahead-soft": ["#8fc0ff", "#1857b8"],
    "ahead-bright": ["#b8d8ff", "#134a9e"],
    behind: ["#ff6d65", "#bf1c21"],
    // The blue and red above at 32% and 30% in dark, 22% and 20% in light.
    "ahead-fill": ["rgb(98 168 255 / 32%)", "rgb(16 93 204 / 22%)"],
    "behind-fill": ["rgb(255 109 101 / 30%)", "rgb(191 28 33 / 20%)"],
    "grade-brilliant": ["#3cc8e4", "#0b8aa8"],
    "grade-great": ["#4f9dff", "#1c66d6"],
    "grade-best": ["#9cc4ff", "#7aa6e6"],
    "grade-excellent": ["#c9dcf7", "#bcd2f0"],
    "grade-good": ["#ddd6ca", "#d8d1c4"],
    "grade-even": ["#8f8a81", "#8a857c"],
    "grade-book": ["#c49a6c", "#a8784a"],
    "grade-inaccuracy": ["#f2c230", "#f0bd1d"],
    "grade-mistake": ["#ff9a4a", "#e0731f"],
    "grade-miss": ["#ff7aa8", "#c93a74"],
    "grade-blunder": ["#ff5f57", "#cb2c2c"],
  };

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

  it("sets every approved value in both themes", () => {
    const dark = colourTokens(css, DARK);
    const light = colourTokens(css, LIGHT);
    const actual = Object.fromEntries(Object.keys(SPEC).map((name) => [name, [dark.get(name), light.get(name)]]));
    expect(actual).toEqual(SPEC);
  });

  it("points each old name at its new token", () => {
    const dark = colourTokens(css, DARK);
    const pointsAt = Object.fromEntries(Object.keys(OLD_TO_NEW).map((old) => [old, ALIAS.exec(dark.get(old) ?? "")?.[1]]));
    expect(pointsAt).toEqual(OLD_TO_NEW);
  });

  it("hides the panel outline, since Review board panels have no border", () => {
    expect(colourTokens(css, DARK).get("frame")).toBe("transparent");
    expect(colourTokens(css, LIGHT).get("frame")).toBe("transparent");
  });
});
