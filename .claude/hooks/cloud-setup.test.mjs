import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cloudSetup } from "./cloud-setup-steps.mjs";

const CLOUD = { CLAUDE_CODE_REMOTE: "true" };

// A stand-in for running a command: records it, and fails the ones in `failing`.
function fakeRun(failing = []) {
  const ran = [];
  const run = (command) => {
    ran.push(command);
    return { ok: !failing.includes(command), tail: `last lines of ${command}` };
  };
  return { ran, run };
}

describe("cloudSetup", () => {
  it.each([
    ["unset", {}],
    ["false", { CLAUDE_CODE_REMOTE: "false" }],
    ["1", { CLAUDE_CODE_REMOTE: "1" }],
  ])("runs and checks nothing when CLAUDE_CODE_REMOTE is %s", (_, env) => {
    const { ran, run } = fakeRun();
    let asked = false;
    expect(
      cloudSetup(env, run, () => {
        asked = true;
        return false;
      }),
    ).toBe("");
    expect(ran).toEqual([]);
    expect(asked).toBe(false);
  });

  it("installs the packages, then Chromium, in a cloud session", () => {
    const { ran, run } = fakeRun();
    expect(cloudSetup(CLOUD, run)).toBe("Cloud setup: ran `npm ci` and `npx playwright install chromium`.");
    expect(ran).toEqual(["npm ci", "npx playwright install chromium"]);
  });

  it("skips npm ci when node_modules already matches the lockfile", () => {
    const { ran, run } = fakeRun();
    expect(cloudSetup(CLOUD, run, () => true)).toBe(
      "Cloud setup: ran `npx playwright install chromium` (node_modules already matched package-lock.json).",
    );
    expect(ran).toEqual(["npx playwright install chromium"]);
  });

  it("stops after a failed npm ci, and says what won't work and how it ended", () => {
    const { ran, run } = fakeRun(["npm ci"]);
    expect(cloudSetup(CLOUD, run)).toBe(
      "Cloud setup: `npm ci` failed, so lint, typecheck, the tests and the build won't work until it's run again. Its last lines:\nlast lines of npm ci",
    );
    expect(ran).toEqual(["npm ci"]);
  });

  it("says screenshots won't work when only Chromium fails", () => {
    const { run } = fakeRun(["npx playwright install chromium"]);
    expect(cloudSetup(CLOUD, run)).toMatch(/^Cloud setup: `npx playwright install chromium` failed, so npm run shot/);
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

  // Without this entry the hook never runs, and every other test still passes.
  it("is wired to session start and resume in the project settings", () => {
    const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
    expect(settings.hooks.SessionStart).toEqual([
      {
        matcher: "startup|resume",
        hooks: [
          {
            type: "command",
            command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/cloud-setup.mjs"',
            timeout: 600,
          },
        ],
      },
    ]);
  });
});
