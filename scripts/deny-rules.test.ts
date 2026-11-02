import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The deny rules in .claude/settings.json stop a Claude Code session from
// running the commands that change the live tables or rewrite players' IDs,
// which only Jasper runs (docs/database.md, "Commands Claude Code refuses").
// Claude Code can't run in CI, so this matches each rule against a plain
// command the way Claude Code does: `*` stands for any text, and the rest
// must match exactly. That catches a package.json script under a new name
// that the rules miss, and a rule so broad it blocks an everyday command.
const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8")) as {
  permissions: { deny: string[] };
};
const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

const bashRules = settings.permissions.deny
  .filter((rule) => rule.startsWith("Bash(") && rule.endsWith(")"))
  .map((rule) => rule.slice("Bash(".length, -1));

function refused(command: string): boolean {
  return bashRules.some((pattern) => {
    const text = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${text.join(".*")}$`, "s").test(command);
  });
}

const names = Object.keys(scripts);
const runsRemap = (body: string) => body.includes("scripts/remap-puuids.ts");

// A script changes the live tables if it runs drizzle-kit's migrate or push,
// or runs another script that does. npm also runs pre<name> and post<name>
// around <name>, so a hook that changes the tables makes <name> change them.
function changesTables(name: string, seen = new Set<string>()): boolean {
  if (seen.has(name) || !(name in scripts)) return false;
  seen.add(name);
  const body = scripts[name];
  if (/\bdrizzle-kit\b.*\b(migrate|push)\b/.test(body)) return true;
  const runner = /\b(?:npm run(?:-script)?|node --run|pnpm(?: run)?|yarn(?: run)?|bun run)\s+([\w:.-]+)/g;
  const called = [...body.matchAll(runner)].map((match) => match[1]);
  return [...called, `pre${name}`, `post${name}`].some((other) => changesTables(other, seen));
}

describe("the deny rules on the live database", () => {
  it("refuse every package.json script that changes the live tables, whichever runner starts it", () => {
    const tableScripts = names.filter((name) => changesTables(name));
    expect(tableScripts).not.toEqual([]);
    for (const name of tableScripts) {
      const commands = [`npm run ${name}`, `npm run-script ${name}`, `node --run ${name}`, `pnpm ${name}`, `yarn ${name}`, `bun run ${name}`];
      for (const command of commands) expect(refused(command), command).toBe(true);
    }
  });

  it("refuse drizzle-kit's migrate and push however drizzle-kit is started", () => {
    const commands = [
      "npx drizzle-kit migrate",
      "npx drizzle-kit push --force",
      "npm exec drizzle-kit migrate",
      "npx drizzle-kit@0.31.11 push",
      "node node_modules/drizzle-kit/bin.cjs migrate",
    ];
    for (const command of commands) expect(refused(command), command).toBe(true);
  });

  it("refuse the remap's apply and rollback, but not its dry run", () => {
    const remapScripts = names.filter((name) => runsRemap(scripts[name]));
    expect(remapScripts).not.toEqual([]);
    for (const name of remapScripts) {
      expect(refused(`npm run ${name} -- --apply .cache/puuid-remap/map.json`)).toBe(true);
      expect(refused(`npm run ${name} -- --rollback .cache/puuid-remap/backup.jsonl`)).toBe(true);
      expect(refused(`npm run ${name}`)).toBe(false);
    }
    expect(refused("npx tsx --conditions=react-server scripts/remap-puuids.ts --apply map.json")).toBe(true);
  });

  it("let every other package.json script run, and git push", () => {
    for (const name of names.filter((name) => !changesTables(name))) {
      expect(refused(`npm run ${name}`), name).toBe(false);
    }
    for (const command of ["npx drizzle-kit generate", "git push -u origin claude/jas-1-a-branch"]) {
      expect(refused(command), command).toBe(false);
    }
  });
});
