/* eslint-disable turnpoint/no-riot-api-host -- the sample code spells out Riot's host */
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// These tests run the repo's real eslint.config.mjs, so each one checks what
// `npm run lint` reports for that code at that path, folders included.
let eslint;

beforeAll(async () => {
  eslint = new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });
  // The first lint loads the Next config and the TypeScript parser, which can
  // take longer than one test's 5 second limit.
  await eslint.lintText("", { filePath: "src/app/warm-up.tsx" });
}, 60_000);

async function turnpointMessages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId?.startsWith("turnpoint/"));
}

async function turnpointRules(code, filePath) {
  return (await turnpointMessages(code, filePath)).map((message) => message.ruleId);
}

describe("no-riot-api-host", () => {
  const statusUrl = 'export const url = "https://na1.api.riotgames.com/lol/status/v4/platform-data";';

  it("fails on a Riot API host outside src/lib/riot/", async () => {
    expect(await turnpointRules(statusUrl, "src/app/x.tsx")).toEqual(["turnpoint/no-riot-api-host"]);
  });

  it("fails on a host inside a template string in scripts/", async () => {
    const code = "export const url = (region: string) => `https://${region}.api.riotgames.com/riot/account/v1`;";
    expect(await turnpointRules(code, "scripts/x.ts")).toEqual(["turnpoint/no-riot-api-host"]);
  });

  it("passes inside src/lib/riot/", async () => {
    expect(await turnpointRules(statusUrl, "src/lib/riot/x.ts")).toEqual([]);
  });

  it("passes when the host is only in a comment", async () => {
    const code = "// Riot's hosts look like na1.api.riotgames.com.\nexport const a = 1;";
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });
});

describe("server-only-env", () => {
  const readsKey = "export const key = process.env.RIOT_API_KEY;";

  it.each([
    ["a dotted read", readsKey],
    ["a bracket read", 'export const key = process.env["ANTHROPIC_API_KEY"];'],
    ["a computed key", "export const read = (name: string) => process.env[name];"],
    ["the whole object", "export const env = { ...process.env };"],
  ])("fails on %s in src/lib/ without server-only", async (_, code) => {
    expect(await turnpointRules(code, "src/lib/x.ts")).toEqual(["turnpoint/server-only-env"]);
  });

  it("names the variable in the error", async () => {
    const [message] = await turnpointMessages(readsKey, "src/lib/x.ts");
    expect(message.message).toContain("RIOT_API_KEY");
  });

  it("checks each destructured key in src/db/", async () => {
    const code = "const { DATABASE_URL, NODE_ENV } = process.env;\nexport { DATABASE_URL, NODE_ENV };";
    const messages = await turnpointMessages(code, "src/db/x.ts");
    expect(messages.map((message) => message.ruleId)).toEqual(["turnpoint/server-only-env"]);
    expect(messages[0].message).toContain("DATABASE_URL");
  });

  it("passes a destructure of only public names", async () => {
    const code =
      "const { NEXT_PUBLIC_SUPABASE_URL, NODE_ENV } = process.env;\nexport { NEXT_PUBLIC_SUPABASE_URL, NODE_ENV };";
    expect(await turnpointRules(code, "src/lib/x.ts")).toEqual([]);
  });

  it('passes with import "server-only"', async () => {
    expect(await turnpointRules(`import "server-only";\n${readsKey}`, "src/lib/x.ts")).toEqual([]);
  });

  it("passes for NEXT_PUBLIC_*, NODE_ENV and NEXT_RUNTIME", async () => {
    const code =
      "export const env = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV, process.env.NEXT_RUNTIME];";
    expect(await turnpointRules(code, "src/lib/x.ts")).toEqual([]);
  });

  it.each(["src/lib/x.test.ts", "src/app/page.tsx", "scripts/x.ts"])("does not check %s", async (filePath) => {
    expect(await turnpointRules(readsKey, filePath)).toEqual([]);
  });
});

describe("no-green-classes", () => {
  it.each([
    'export const c = "text-green-500";',
    'export const c = "rounded bg-emerald-400/20 px-2";',
    "export const c = (extra: string) => `hover:border-lime-300 ${extra}`;",
    'export const c = "var(--color-green-500)";',
    'export const Win = () => <p className="text-green-500">Win</p>;',
  ])("fails on %s under src/", async (code) => {
    expect(await turnpointRules(code, "src/components/x.tsx")).toEqual(["turnpoint/no-green-classes"]);
  });

  it('passes the rank name "Emerald"', async () => {
    const code = 'export const ranks = ["Emerald", "EMERALD+", "emerald"];';
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it("does not check files outside src/", async () => {
    expect(await turnpointRules('export const c = "text-green-500";', "scripts/x.ts")).toEqual([]);
  });
});

describe("review-board-type", () => {
  it.each([
    "uppercase",
    "hover:uppercase",
    "[text-transform:uppercase]",
    "tracking-wide",
    "tracking-wider",
    "tracking-widest",
    "tracking-[0.14em]",
    "font-mono",
    "md:font-mono",
    "font-display",
    "font-serif",
    "font-['Barlow_Condensed']",
    "font-(family-name:--x)",
    "[font-family:monospace]",
    "tracking-(--x)",
    "[letter-spacing:0.1em]",
    "text-label",
    "text-[13px]",
    "text-[1.2rem]",
    "text-[length:13px]",
    "text-(length:--x)",
    "[font-size:13px]",
  ])("fails on %s", async (name) => {
    const code = `export const c = "p-4 ${name} bg-panel";`;
    expect(await turnpointRules(code, "src/components/x.tsx")).toEqual(["turnpoint/review-board-type"]);
  });

  it("fails in a className and a template string", async () => {
    const jsx = 'export const A = () => <p className="uppercase">Win</p>;';
    const template = "export const c = (extra: string) => `font-mono ${extra}`;";
    expect(await turnpointRules(jsx, "src/app/x.tsx")).toEqual(["turnpoint/review-board-type"]);
    expect(await turnpointRules(template, "src/app/x.tsx")).toEqual(["turnpoint/review-board-type"]);
  });

  it.each([
    ['an SVG font', 'export const A = () => <text fontFamily="Barlow Condensed">1</text>;'],
    ["SVG letter spacing", 'export const A = () => <text letterSpacing="2">1</text>;'],
    ["a style's font", 'export const A = () => <p style={{ fontFamily: "monospace" }} />;'],
    ["a style's letter spacing", 'export const A = () => <p style={{ letterSpacing: "0.14em" }} />;'],
    ["a style's all-caps", 'export const A = () => <p style={{ textTransform: "none" }} />;'],
    ["a <code> tag", "export const A = () => <code>1</code>;"],
    ["a <pre> tag", "export const A = () => <pre>1</pre>;"],
    ["a <kbd> tag", "export const A = () => <kbd>1</kbd>;"],
    ["a <samp> tag", "export const A = () => <samp>1</samp>;"],
  ])("fails on %s", async (_, code) => {
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual(["turnpoint/review-board-type"]);
  });

  it("passes an SVG font size, since the charts draw their labels in SVG", async () => {
    const code = 'export const A = () => <text fontSize="15">1</text>;';
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it("checks the share image's type too, so its one font is a line of its own", async () => {
    const code = 'export const a = { textTransform: "none" };';
    const path = "src/app/player/[region]/[riotId]/match/[matchId]/opengraph-image.tsx";
    expect(await turnpointRules(code, path)).toEqual(["turnpoint/review-board-type"]);
  });

  it.each([
    ["a style's font shorthand", 'export const A = () => <p style={{ font: "13px monospace" }} />;'],
    ["a style's font variant", 'export const A = () => <p style={{ fontVariant: "small-caps" }} />;'],
    ["a font with its key in quotes", 'export const A = () => <p style={{ "font-family": "monospace" }} />;'],
    ["a font with a computed key", 'export const A = () => <p style={{ ["fontFamily"]: "monospace" }} />;'],
    ["an SVG font written with a hyphen", 'export const A = () => <text font-family="Georgia">1</text>;'],
    ["SVG letter spacing written with a hyphen", 'export const A = () => <text letter-spacing="2">1</text>;'],
    ["a <tt> tag", "export const A = () => <tt>1</tt>;"],
    ["capitalize", 'export const c = "capitalize p-2";'],
    ["a font set by hand", 'export const c = "[font:600_13px_monospace]";'],
    ["a font variant set by hand", 'export const c = "[font-variant:small-caps]";'],
    ["a size from clamp", 'export const c = "text-[clamp(1rem,2vw,2rem)]";'],
    ["a size from calc", 'export const c = "text-[calc(1rem+2px)]";'],
    ["a weight below 400", 'export const c = "font-light";'],
    ["a weight above 700", 'export const c = "font-black";'],
    ["a class after a capital word", 'export const c = "Card uppercase-ish uppercase";'],
    ["a class list of plain words", 'export const c = "flex uppercase underline";'],
  ])("fails on %s", async (_, code) => {
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual(["turnpoint/review-board-type"]);
  });

  it.each([
    ["a prop read by that name", "export function A({ letterSpacing }) { return letterSpacing; }"],
    ["the weights the site uses", 'export const c = "font-normal font-medium font-semibold font-bold";'],
    ["a colour size from a variable", 'export const c = "text-[var(--x)]";'],
  ])("passes %s", async (_, code) => {
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it.each([
    ["a palette family Tailwind added later", 'export const c = "bg-mauve-500";'],
    ["a colour mix", 'export const c = "bg-[color-mix(in_srgb,white,black)]";'],
    ["a colour function", 'export const c = "bg-[color(srgb_1_0_0)]";'],
    ["a short hex after a capital word", 'export const c = "Panel bg-[#abc]";'],
    ["a short hex in a lowercase string", 'export const c = "game #123 failed today";'],
  ])("fails on %s", async (_, code) => {
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual(["turnpoint/tokens-only"]);
  });

  it.each([
    ["a link to a gradient with a long id", 'export const A = () => <rect fill="url(#abcdef)" />;'],
  ])("passes %s", async (_, code) => {
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it("names the fix in the error", async () => {
    const [message] = await turnpointMessages('export const c = "font-mono";', "src/app/x.tsx");
    expect(message.message).toContain("tabular-nums");
  });

  it.each([
    "tabular-nums",
    "font-sans",
    "font-semibold",
    "font-[600]",
    "tracking-tight",
    "tracking-[-0.01em]",
    "normal-case",
    "text-note",
    "text-xs",
  ])("passes %s", async (name) => {
    expect(await turnpointRules(`export const c = "${name}";`, "src/app/x.tsx")).toEqual([]);
  });

  it("passes the word in a sentence", async () => {
    expect(await turnpointRules('export const c = "Include an uppercase letter.";', "src/app/x.tsx")).toEqual([]);
  });

  it("passes the words in a comment or on the page", async () => {
    const code = '// Not uppercase or font-mono.\nexport const A = () => <p>uppercase text-label</p>;';
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it.each(["src/app/x.test.tsx", "scripts/x.ts"])("does not check %s", async (filePath) => {
    expect(await turnpointRules('export const c = "uppercase";', filePath)).toEqual([]);
  });
});

describe("tokens-only", () => {
  it.each([
    "#fff",
    "#ffff",
    "#21201d",
    "#21201dcc",
    "bg-[#21201d]",
    "shadow-[0_0_0_1px_#123456]",
    "bg-[linear-gradient(90deg,#fff_0%,#000_100%)]",
    "Card #21201d",
    "rgb(255 255 255 / 7%)",
    "rgba(0, 0, 0, 0.5)",
    "hsl(10 20% 30%)",
    "oklch(0.5 0.1 200)",
  ])("fails on the raw colour %s", async (colour) => {
    const code = `export const c = "${colour}";`;
    expect(await turnpointRules(code, "src/components/x.tsx")).toEqual(["turnpoint/tokens-only"]);
  });

  it.each([
    "text-white",
    "bg-black/50",
    "bg-red-500",
    "hover:text-gray-400",
    "border-t-zinc-800",
    "ring-offset-blue-500",
  ])("fails on Tailwind's own colour %s", async (name) => {
    expect(await turnpointRules(`export const c = "${name}";`, "src/app/x.tsx")).toEqual(["turnpoint/tokens-only"]);
  });

  it("fails on a colour in a JSX attribute and a style", async () => {
    const attribute = 'export const A = () => <rect fill="#123456" />;';
    const style = 'export const A = () => <p style={{ color: "rgb(1 2 3)" }} />;';
    expect(await turnpointRules(attribute, "src/app/x.tsx")).toEqual(["turnpoint/tokens-only"]);
    expect(await turnpointRules(style, "src/app/x.tsx")).toEqual(["turnpoint/tokens-only"]);
  });

  it.each([
    ["bg-surface", "panel"],
    ["hover:bg-surface-hover", "raised"],
    ["border-line", "divider"],
    ["divide-line", "divider"],
    ["border-t-line-strong", "divider"],
    ["border-frame", "no border"],
    ["text-ink", "main"],
    ["group-hover:text-ink-soft", "main"],
    ["outline-ink/50", "main"],
    ["text-muted", "quiet"],
    ["placeholder:text-faint", "quiet"],
    ["var(--color-ink)", "main"],
    ["ring-offset-surface", "panel"],
    ["inset-ring-line", "divider"],
    ["inset-shadow-ink", "main"],
    ["drop-shadow-ink", "main"],
    ["text-shadow-ink", "main"],
    ["placeholder-muted", "quiet"],
    ["border-bs-line", "divider"],
  ])("fails on the old colour %s and names its fix", async (name, fix) => {
    const messages = await turnpointMessages(`export const c = "${name}";`, "src/app/x.tsx");
    expect(messages.map((message) => message.ruleId)).toEqual(["turnpoint/tokens-only"]);
    expect(messages[0].message).toContain(fix);
  });

  it.each([
    "bg-panel text-main border-divider",
    "#notes-heading",
    "/player/kr/Faker#123",
    "Hide on bush#KR1",
    "&#123;",
    "text-line-through",
    "var(--color-main)",
    "url(#fade)",
    "Rank #123 in Europe",
    "bg-transparent",
    "text-current",
    "bg-whitesmoke",
  ])("passes %s", async (text) => {
    expect(await turnpointRules(`export const c = "${text}";`, "src/app/x.tsx")).toEqual([]);
  });

  it("passes a colour in a comment", async () => {
    const code = "// It's the mockup's #3a3834 in dark, issue #167.\nexport const a = 1;";
    expect(await turnpointRules(code, "src/app/x.tsx")).toEqual([]);
  });

  it.each([
    "src/components/rank-tints.ts",
    "src/components/icons.tsx",
    "src/app/player/[region]/[riotId]/match/[matchId]/opengraph-image.tsx",
    "src/app/x.test.tsx",
    "scripts/x.ts",
  ])("lets %s use its own colours", async (filePath) => {
    expect(await turnpointRules('export const c = "#123456";', filePath)).toEqual([]);
  });

  it("allows only those files, not the same name in another folder", async () => {
    expect(await turnpointRules('export const c = "#123456";', "src/app/rank-tints.ts")).toEqual([
      "turnpoint/tokens-only",
    ]);
  });
});
