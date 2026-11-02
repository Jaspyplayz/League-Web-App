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

const changesTables = (body: string) => /\bdrizzle-kit\b.*\b(migrate|push)\b/.test(body);
const runsRemap = (body: string) => body.includes("scripts/remap-puuids.ts");
const names = Object.keys(scripts);

describe("the deny rules on the live database", () => {
  it("refuse every package.json script that changes the live tables, whichever runner starts it", () => {
    const tableScripts = names.filter((name) => changesTables(scripts[name]));
    expect(tableScripts).not.toEqual([]);
    for (const name of tableScripts) {
      const commands = [`npm run ${name}`, `npm run-script ${name}`, `node --run ${name}`, `pnpm ${name}`, `yarn ${name}`, `bun run ${name}`, `npx ${scripts[name]}`];
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
    for (const name of names.filter((name) => !changesTables(scripts[name]))) {
      expect(refused(`npm run ${name}`), name).toBe(false);
    }
    for (const command of ["npx drizzle-kit generate", "git push -u origin claude/jas-1-a-branch"]) {
      expect(refused(command), command).toBe(false);
    }
  });
});
