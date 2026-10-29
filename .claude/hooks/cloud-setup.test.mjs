import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { cloudSetup, markPackagesCurrent, packagesCurrent, runStep, STEP_TIMEOUT_MS } from "./cloud-setup-steps.mjs";

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

// A stand-in for the lockfile mark: says whether packages are `current`, and
// counts how often they're marked.
function fakePackages(current = false) {
  const packages = { asked: false, marked: 0 };
  packages.current = () => {
    packages.asked = true;
    return current;
  };
  packages.markCurrent = () => {
    packages.marked += 1;
  };
  return packages;
}

describe("cloudSetup", () => {
  it.each([
    ["unset", {}],
    ["false", { CLAUDE_CODE_REMOTE: "false" }],
    ["1", { CLAUDE_CODE_REMOTE: "1" }],
  ])("runs and checks nothing when CLAUDE_CODE_REMOTE is %s", (_, env) => {
    const { ran, run } = fakeRun();
    const packages = fakePackages();
    expect(cloudSetup(env, run, packages)).toBe("");
    expect(ran).toEqual([]);
    expect(packages.asked).toBe(false);
    expect(packages.marked).toBe(0);
  });

  it("installs the packages, marks them current, then installs Chromium, in a cloud session", () => {
    const { ran, run } = fakeRun();
    const packages = fakePackages();
    expect(cloudSetup(CLOUD, run, packages)).toBe("Cloud setup: ran `npm ci` and `npx playwright install chromium`.");
    expect(ran).toEqual(["npm ci", "npx playwright install chromium"]);
    expect(packages.marked).toBe(1);
  });

  it("skips npm ci when node_modules already matches the lockfile", () => {
    const { ran, run } = fakeRun();
    const packages = fakePackages(true);
    expect(cloudSetup(CLOUD, run, packages)).toBe(
      "Cloud setup: ran `npx playwright install chromium` (node_modules already matched package.json and package-lock.json).",
    );
    expect(ran).toEqual(["npx playwright install chromium"]);
    expect(packages.marked).toBe(0);
  });

  it("stops after a failed npm ci, marks nothing, and says what won't work and how it ended", () => {
    const { ran, run } = fakeRun(["npm ci"]);
    const packages = fakePackages();
    expect(cloudSetup(CLOUD, run, packages)).toBe(
      "Cloud setup: `npm ci` failed, so lint, typecheck, the tests and the build won't work until it's run again. Its last lines:\nlast lines of npm ci",
    );
    expect(ran).toEqual(["npm ci"]);
    expect(packages.marked).toBe(0);
  });

  it("says screenshots won't work when only Chromium fails", () => {
    const { run } = fakeRun(["npx playwright install chromium"]);
    expect(cloudSetup(CLOUD, run)).toMatch(/^Cloud setup: `npx playwright install chromium` failed, so npm run shot/);
  });
});

describe("runStep", () => {
  const node = (script) => [process.execPath, "-e", script];

  it("is ok when the program exits 0", () => {
    expect(runStep(node("console.log('done')"), process.cwd(), 10_000)).toEqual({ ok: true, tail: "done" });
  });

  it("fails with the last 5 lines when the program exits non-zero", () => {
    const script = "for (let i = 1; i <= 7; i++) console.log('line ' + i); process.exit(3)";
    expect(runStep(node(script), process.cwd(), 10_000)).toEqual({
      ok: false,
      tail: ["line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"),
    });
  });

  it("stops a program that runs past its time, and says so", () => {
    const started = Date.now();
    const { ok, tail } = runStep(node("setTimeout(() => {}, 20_000)"), process.cwd(), 500);
    expect(ok).toBe(false);
    expect(tail).toMatch(/ETIMEDOUT/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("packagesCurrent and markPackagesCurrent", () => {
  const roots = [];
  // A checkout with a lockfile and an empty node_modules, as npm ci leaves it.
  function checkout({ lockfile = true } = {}) {
    const root = mkdtempSync(join(tmpdir(), "cloud-setup-"));
    roots.push(root);
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "package.json"), '{"name":"app"}');
    if (lockfile) writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion":3}');
    return root;
  }
  afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

  it("is false before any install, and true after one is marked", () => {
    const root = checkout();
    expect(packagesCurrent(root)).toBe(false);
    markPackagesCurrent(root);
    expect(packagesCurrent(root)).toBe(true);
  });

  it("is false again once the lockfile changes", () => {
    const root = checkout();
    markPackagesCurrent(root);
    writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{}}');
    expect(packagesCurrent(root)).toBe(false);
  });

  it("is false again once package.json changes", () => {
    const root = checkout();
    markPackagesCurrent(root);
    writeFileSync(join(root, "package.json"), '{"name":"app","dependencies":{}}');
    expect(packagesCurrent(root)).toBe(false);
  });

  // npm ci deletes node_modules before it installs, so the mark has to live
  // there for a failed install to leave none behind.
  it("is false once node_modules is gone, as when npm ci starts over", () => {
    const root = checkout();
    markPackagesCurrent(root);
    rmSync(join(root, "node_modules"), { recursive: true });
    expect(packagesCurrent(root)).toBe(false);
  });

  it("doesn't throw when the mark can't be written", () => {
    const root = checkout();
    rmSync(join(root, "node_modules"), { recursive: true });
    expect(() => markPackagesCurrent(root)).not.toThrow();
    expect(packagesCurrent(root)).toBe(false);
  });

  it("is false, and marks nothing, without a lockfile", () => {
    const root = checkout({ lockfile: false });
    expect(() => markPackagesCurrent(root)).not.toThrow();
    expect(packagesCurrent(root)).toBe(false);
  });
});

describe("the hook as Claude Code runs it", () => {
  // An empty folder has no package-lock.json, so npm ci fails at once on every
  // system, which shows the entry script runs the steps and prints the line.
  it("prints the failure line from a cloud start in a folder npm ci can't install", () => {
    const root = mkdtempSync(join(tmpdir(), "cloud-setup-entry-"));
    try {
      const env = { ...process.env, CLAUDE_CODE_REMOTE: "true", CLAUDE_PROJECT_DIR: root };
      const hook = fileURLToPath(new URL("./cloud-setup.mjs", import.meta.url));
      const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 60_000 });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^Cloud setup: `npm ci` failed, so lint, typecheck, the tests and the build won't work/);
      expect(existsSync(join(root, "node_modules", ".cloud-setup-lock-hash"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits at once and prints nothing outside the cloud", () => {
    const env = { ...process.env };
    delete env.CLAUDE_CODE_REMOTE;
    const hook = fileURLToPath(new URL("./cloud-setup.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  // Two steps that each use their whole limit must still end before Claude Code
  // stops the hook, or the summary line never prints.
  it("gives both steps together less time than the hook's timeout", () => {
    const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
    const entry = settings.hooks.SessionStart.find(({ hooks }) => hooks.some(({ command }) => command.includes("cloud-setup.mjs")));
    expect(2 * STEP_TIMEOUT_MS).toBeLessThan(entry.hooks[0].timeout * 1000);
  });

  // Without this entry the hook never runs, and every other test still passes.
  it("is wired to session start, resume and fork in the project settings", () => {
    const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
    expect(settings.hooks.SessionStart).toContainEqual(
      {
        matcher: "startup|resume|fork",
        hooks: [
          {
            type: "command",
            command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/cloud-setup.mjs"',
            timeout: 600,
          },
        ],
      },
    );
  });
});
