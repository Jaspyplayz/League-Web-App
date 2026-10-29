import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const hook = fileURLToPath(new URL("./pstack-context.mjs", import.meta.url));
const context = readFileSync(new URL("./pstack-session-start-context.md", import.meta.url), "utf8");
const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));

// Runs the hook the way Claude Code does, with CLAUDE_CONFIG_DIR pointing at a
// fresh folder that holds `sheet` as pstack-models.md, or no sheet at all.
const configDirs = [];
function runHook(sheet) {
  const configDir = mkdtempSync(join(tmpdir(), "pstack-context-"));
  configDirs.push(configDir);
  if (sheet !== undefined) writeFileSync(join(configDir, "pstack-models.md"), sheet);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  return spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 10_000 });
}
afterAll(() => configDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("the pstack startup hook", () => {
  it("prints pstack's own startup text first, then how the names map, with no sheet", () => {
    const result = runHook();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.startsWith(context)).toBe(true);
    expect(result.stdout.slice(context.length)).toMatch(/^\nIn this repo pstack is copied into .*`poteto-mode` skill/);
  });

  // Git turns the file's line endings into Windows ones on Jasper's computer.
  it("is the text that sends tasks to poteto-mode", () => {
    expect(context).toMatch(/^<EXTREMELY_IMPORTANT>\r?\nYou have pstack\./);
    expect(context).toContain("Invoke the `pstack:poteto-mode` skill");
  });

  it("still prints when the sheet says `session hook: on`", () => {
    expect(runHook("feature, refactoring: opus\nsession hook: on\n").stdout.startsWith(context)).toBe(true);
  });

  it.each([
    ["plain", "default effort: session\nsession hook: off\n"],
    ["with Windows line endings", "default effort: session\r\nsession hook: off\r\n"],
    ["with a byte-order mark", "﻿session hook: off\n"],
    ["saved as UTF-16 by PowerShell", Buffer.from("﻿session hook: off\r\n", "utf16le")],
  ])("prints nothing when the sheet says `session hook: off` (%s)", (_, sheet) => {
    const result = runHook(sheet);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  // The plugin's hook matches the whole line, so a comment that mentions the
  // switch doesn't turn it off.
  it("prints when `session hook: off` is only part of a line", () => {
    expect(runHook("`session hook: off` stops the hook\n").stdout.startsWith(context)).toBe(true);
  });

  // Without this entry the hook never runs, and every other test still passes.
  // The matcher is the plugin's own, so the text comes back after /clear and
  // after the context is compacted.
  it("is wired to start, resume, clear and compact in the project settings", () => {
    expect(settings.hooks.SessionStart).toContainEqual({
      matcher: "startup|resume|clear|compact",
      hooks: [
        {
          type: "command",
          command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pstack-context.mjs"',
          timeout: 10,
        },
      ],
    });
  });

  // With the plugin on as well, every pstack skill would load twice, once from
  // the plugin and once from .claude/skills/.
  it("comes with the pstack plugin switched off for this project", () => {
    expect(settings.enabledPlugins).toEqual({ "pstack@pstack-claude": false });
  });
});
