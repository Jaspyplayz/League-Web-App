import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

// The both-themes check. globals.css sets every colour twice: the dark value
// (and the default) in @theme, and the light one under data-theme="light". A
// colour with only a dark value shows its dark shade on the light theme, which
// is how a light page ends up with a dark panel in it.

// The Rift's own colours are the same in both themes on purpose, so the
// replay's map matches Riot's picture of it.
const SAME_IN_BOTH_THEMES = new Set(["rift-ground", "rift-wall"]);

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
    .filter(([name]) => !SAME_IN_BOTH_THEMES.has(name) && !light.has(name))
    .map(([name]) => `--color-${name} has a dark value and no light one: add it to the data-theme="light" block in src/app/globals.css`);
}

const css = readFileSync("src/app/globals.css", "utf8");

describe("both themes", () => {
  it("gives every colour with a dark value a light one", () => {
    expect(missingLightValues(css)).toEqual([]);
  });

  it("catches a colour with a dark value and no light one", () => {
    const sample = `${DARK}\n  --color-page: #000;\n  --color-new: #123456;\n  --color-rift-wall: #000a13;\n}\n${LIGHT}\n  --color-page: #fff;\n}\n`;
    expect(missingLightValues(sample)).toEqual([
      '--color-new has a dark value and no light one: add it to the data-theme="light" block in src/app/globals.css',
    ]);
  });

  it("sets no light colour the dark theme lacks", () => {
    const dark = colourTokens(css, DARK);
    const extra = [...colourTokens(css, LIGHT).keys()].filter((name) => !dark.has(name));
    expect(extra).toEqual([]);
  });

  // JAS-94 left no aliases: a second name for a colour is how the old names
  // lasted through the move.
  it("keeps one name for each colour, with no token pointing at another", () => {
    const aliases = [...colourTokens(css, DARK), ...colourTokens(css, LIGHT)]
      .filter(([, value]) => /^var\(--color-/.test(value))
      .map(([name]) => name);
    expect(aliases).toEqual([]);
  });
});

// The Review board tokens (JAS-94), and the old names and sizes JAS-98 removed.
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

  it("sets every approved value in both themes", () => {
    const dark = colourTokens(css, DARK);
    const light = colourTokens(css, LIGHT);
    const actual = Object.fromEntries(Object.keys(SPEC).map((name) => [name, [dark.get(name), light.get(name)]]));
    expect(actual).toEqual(SPEC);
  });

  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Lint doesn't read CSS, and a rule here reading an old name would quietly
  // lose its colour, as the page's own body colour nearly did.
  it("sets and reads no old colour name anywhere in the stylesheet", () => {
    const old = /--color-(?:surface-hover|surface|line-strong|line|frame|ink-soft|ink|muted|faint)\b/g;
    expect(withoutComments.match(old)).toBeNull();
  });

  it("has no old size, font or corner left, and no all-caps rule", () => {
    const OLD = [
      "--text-label",
      "--radius-soft",
      "@utility soft-round",
      "font-display",
      "font-mono",
      "font-family",
      "uppercase",
      "text-transform",
      "tracking-wide",
      "letter-spacing",
    ];
    expect(OLD.filter((old) => withoutComments.includes(old))).toEqual([]);
  });

  // A font a page loads is a download for every player, even if nothing shows
  // it, and neither lint rule reads imports.
  it("loads only Rubik", () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter(
      (path) => /\.tsx?$/.test(path) && !path.includes(".test."),
    );
    const imports = files.flatMap(
      (path) => readFileSync(join("src", path), "utf8").match(/import[^;]*next\/font[^;]*;/g) ?? [],
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(new Set(imports)).toEqual(new Set(['import { Rubik } from "next/font/google";']));
  });

  // Tailwind builds nothing for a colour that doesn't exist, and nothing else
  // fails: the text or fill just isn't drawn. So build each class the real way.
  const COLOUR_CLASS =
    /^(?:[^\s:]+:)*!?(?:bg|text|border(?:-[a-z]+)?|divide|ring|fill|stroke|outline|decoration|accent|caret|placeholder|from|via|to|shadow)-[a-z][\w-]*(?:\/\d+)?$/;

  async function classesThatBuildNothing(classes: string[]): Promise<string[]> {
    const compiler = await compile(readFileSync("src/app/globals.css", "utf8"), {
      base: "src/app",
      loadStylesheet: async (id, base) => {
        const path = id === "tailwindcss" ? "node_modules/tailwindcss/index.css" : join(base, id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    let built = compiler.build([]).length;
    return [...new Set(classes)].filter((name) => {
      const before = built;
      built = compiler.build([name]).length;
      return built === before;
    });
  }

  it("spots a colour class that builds nothing", async () => {
    const classes = ["bg-panel", "[&_a]:text-main", "bg-surface-2", "hover:bg-raisd", "[&_a]:text-mian"];
    expect(classes.filter((name) => COLOUR_CLASS.test(name))).toEqual(classes);
    expect(await classesThatBuildNothing(classes)).toEqual(["bg-surface-2", "hover:bg-raisd", "[&_a]:text-mian"]);
  });

  // Tailwind builds a class for any name in a file it reads, so without these
  // two lines the checks that name banned classes would put them in the CSS.
  it("has Tailwind read only src and not its tests", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain('@import "tailwindcss" source("..");');
    expect(css).toContain('@source not "../**/*.test.{ts,tsx}";');
  });

  it("builds CSS for every colour class in src", async () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter(
      (path) => /\.tsx?$/.test(path) && !path.includes(".test."),
    );
    // Comments can say "text-colored" without meaning a class.
    const code = (path: string) =>
      readFileSync(join("src", path), "utf8").replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    const words = files.flatMap((path) => code(path).match(/[^\s"'`]+/g) ?? []);
    // "from-zero" is a stat's kind in src/lib/analyzer/skill.ts, not a gradient.
    const classes = words.filter((word) => COLOUR_CLASS.test(word) && word !== "from-zero");
    expect(classes.length).toBeGreaterThan(500);
    expect(await classesThatBuildNothing(classes)).toEqual([]);
  });
});
