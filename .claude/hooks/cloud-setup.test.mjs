import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cloudSetup } from "./cloud-setup.mjs";

// A stand-in for running a command: records it, and fails the ones in `failing`.
function fakeRun(failing = []) {
  const ran = [];
  const run = (command) => {
    ran.push(command);
    return !failing.includes(command);
  };
  return { ran, run };
}

describe("cloudSetup", () => {
  it.each([
    ["unset", {}],
    ["false", { CLAUDE_CODE_REMOTE: "false" }],
    ["1", { CLAUDE_CODE_REMOTE: "1" }],
  ])("runs nothing when CLAUDE_CODE_REMOTE is %s", (_, env) => {
    const { ran, run } = fakeRun();
    expect(cloudSetup(env, run)).toBe("");
    expect(ran).toEqual([]);
  });

  it("installs the packages, then Chromium, in a cloud session", () => {
    const { ran, run } = fakeRun();
    expect(cloudSetup({ CLAUDE_CODE_REMOTE: "true" }, run)).toBe(
      "Cloud setup: ran `npm ci` and `npx playwright install chromium`.",
    );
    expect(ran).toEqual(["npm ci", "npx playwright install chromium"]);
  });

  it("stops after a failed npm ci and names it", () => {
    const { ran, run } = fakeRun(["npm ci"]);
    expect(cloudSetup({ CLAUDE_CODE_REMOTE: "true" }, run)).toMatch(/^Cloud setup: `npm ci` failed/);
    expect(ran).toEqual(["npm ci"]);
  });
});

describe("the hook as Claude Code runs it", () => {
  it("exits at once and prints nothing outside the cloud", () => {
    const env = { ...process.env };
    delete env.CLAUDE_CODE_REMOTE;
    const hook = fileURLToPath(new URL("./cloud-setup.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
