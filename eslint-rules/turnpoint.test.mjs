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
