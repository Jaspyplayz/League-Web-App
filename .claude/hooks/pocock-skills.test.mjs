import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  CURL_WORST_MS,
  fetchCommit,
  GIT_BUDGET_MS,
  installPocockSkills,
  MARKETPLACE_URL,
  OWNER_FILE,
  pinnedCommit,
  readMarker,
  readSkill,
  Refusal,
  SKIPPED_BY_RULE,
  skillsToInstall,
  SOURCE_URL,
  takenNames,
} from "./pocock-skills-steps.mjs";

const CLOUD = { CLAUDE_CODE_REMOTE: "true" };
// Saved copies: the mattpocock-skills entry from Anthropic's marketplace on
// 2026-10-29 with one neighbour, and plugin.json from the commit it pins.
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const MARKETPLACE = fixture("marketplace.json");
const PLUGIN = fixture("plugin-49dd158.json");
const SHA = "49dd158d1076134a641b33efb035946536778336";
const NEXT_SHA = "1111111111111111111111111111111111111111";
const repoSkillsDir = fileURLToPath(new URL("../skills", import.meta.url));

const folders = [];
afterAll(() => folders.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  folders.push(dir);
  return dir;
};
const write = (file, text) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};

// The marketplace with the mattpocock-skills source changed.
const marketplaceWith = (source) => {
  const marketplace = JSON.parse(MARKETPLACE);
  const entry = marketplace.plugins.find(({ name }) => name === "mattpocock-skills");
  entry.source = { ...entry.source, ...source };
  return JSON.stringify(marketplace);
};

// A stand-in for curlGet that serves only the marketplace file, records each
// URL asked for, and rejects when the network is `down`.
function fakeGet({ marketplace = MARKETPLACE, status = 200, down = false } = {}) {
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    if (down) throw new Refusal("curl couldn't reach raw.githubusercontent.com (Could not resolve host)");
    if (url !== MARKETPLACE_URL) return { status: 404, body: Buffer.from("") };
    return { status, body: Buffer.from(marketplace) };
  };
  return { asked, get };
}

// A stand-in for fetchCommit that writes a fake commit: plugin.json and a
// SKILL.md naming the commit in every skill it lists, then `extra` files on
// top (a null value removes one). It records the folders it was given, and
// throws `fails` when set.
function fakeFetch({ extra = {}, fails } = {}) {
  const dirs = [];
  const fetch = (url, sha, dir) => {
    dirs.push(dir);
    if (fails) throw fails;
    expect(url).toBe(SOURCE_URL);
    write(join(dir, ".claude-plugin", "plugin.json"), PLUGIN);
    for (const path of JSON.parse(PLUGIN).skills) write(join(dir, path, "SKILL.md"), `# ${path} at ${sha}\n`);
    for (const [file, text] of Object.entries(extra)) {
      if (text === null) rmSync(join(dir, file));
      else write(join(dir, file), text);
    }
  };
  return { dirs, fetch };
}

// A cloud home folder: ~/.claude/skills/ already holds the two folders the
// cloud puts there, and the marker sits in ~/.claude/.
function home() {
  const config = tempDir("pocock-skills-home-");
  const skillsDir = join(config, "skills");
  for (const own of ["session-start-hook", "synced"]) write(join(skillsDir, own, "README.md"), `the cloud's ${own}`);
  return { skillsDir, repoSkillsDir, markerFile: join(config, "mattpocock-skills.json") };
}
const pocockFolders = (skillsDir) => readdirSync(skillsDir).filter((name) => !["session-start-hook", "synced"].includes(name)).sort();
const run = (where, { get = fakeGet().get, fetch = fakeFetch().fetch } = {}) =>
  installPocockSkills(CLOUD, { get, fetchCommit: fetch, ...where });

describe("pinnedCommit", () => {
  it("takes the sha from the saved marketplace entry", () => {
    expect(pinnedCommit(MARKETPLACE)).toBe(SHA);
  });

  it.each([
    ["a wrong URL", { url: "https://github.com/someone-else/skills.git" }, /points at "https:\/\/github.com\/someone-else\/skills.git"/],
    ["the URL without .git", { url: "https://github.com/mattpocock/skills" }, /points at/],
    ["a short sha", { sha: SHA.slice(0, 7) }, /isn't a full 40-character commit ID/],
    ["a branch name", { sha: "main" }, /isn't a full 40-character commit ID/],
    ["an uppercase sha", { sha: SHA.toUpperCase() }, /isn't a full 40-character commit ID/],
    ["no sha", { sha: undefined }, /isn't a full 40-character commit ID/],
  ])("refuses %s", (_, source, message) => {
    expect(() => pinnedCommit(marketplaceWith(source))).toThrow(message);
  });

  it("refuses a marketplace with no mattpocock-skills entry", () => {
    const marketplace = JSON.parse(MARKETPLACE);
    marketplace.plugins = marketplace.plugins.filter(({ name }) => name !== "mattpocock-skills");
    expect(() => pinnedCommit(JSON.stringify(marketplace))).toThrow("Anthropic's marketplace has no mattpocock-skills entry");
  });

  it.each([
    ["not JSON", "<html>rate limited</html>"],
    ["no plugin list", '{"name":"claude-plugins-official"}'],
    ["a source that's only a path", JSON.stringify({ plugins: [{ name: "mattpocock-skills", source: "./plugins/x" }] })],
  ])("refuses a marketplace file that's %s", (_, text) => {
    expect(() => pinnedCommit(text)).toThrow(Refusal);
  });
});

describe("the skip list", () => {
  it("is diagnosing-bugs, code-review and pr, from Jasper's rules", () => {
    expect(SKIPPED_BY_RULE).toEqual(["diagnosing-bugs", "code-review", "pr"]);
  });

  // The repo's own skills win any name clash. Today that's pstack's tdd and
  // teach; a new repo skill with one of Pocock's names shows up here.
  it("skips tdd and teach, the repo's own, and installs the other 22", () => {
    const { install, skipped } = skillsToInstall(PLUGIN, takenNames(repoSkillsDir, tempDir("pocock-skills-empty-")));
    expect(skipped).toEqual({ taken: ["tdd", "teach"], byRule: ["diagnosing-bugs", "code-review", "pr"] });
    expect(install).toHaveLength(22);
    expect(install.map(({ name }) => name)).toContain("grilling");
    expect(install).toContainEqual({ name: "to-tickets", path: "skills/engineering/to-tickets" });
  });

  it("refuses a skill path outside skills/<group>/<name>", () => {
    const plugin = JSON.stringify({ skills: ["./skills/engineering/tdd", "./skills/../../etc"] });
    expect(() => skillsToInstall(plugin, new Set())).toThrow(/unexpected skill path "\.\/skills\/\.\.\/\.\.\/etc"/);
  });

  it("refuses a plugin.json with no skills", () => {
    expect(() => skillsToInstall('{"name":"mattpocock-skills"}', new Set())).toThrow("the commit's plugin.json lists no skills");
  });
});

describe("fetchCommit, with real git", () => {
  // A local repo with two commits stands in for GitHub. The file:// URL makes
  // git use the same network protocol, so --depth works as it does there.
  const git = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  function upstream() {
    const dir = tempDir("pocock-skills-upstream-");
    git(dir, "init", "-q");
    const commit = (text) => {
      write(join(dir, "skills", "productivity", "grilling", "SKILL.md"), text);
      git(dir, "add", "-A");
      git(dir, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", text);
      return git(dir, "rev-parse", "HEAD").stdout.trim();
    };
    const first = commit("first");
    const second = commit("second");
    return { url: pathToFileURL(dir).href, first, second };
  }

  it("checks out exactly the commit asked for, not the newest", () => {
    const { url, first } = upstream();
    const dir = tempDir("pocock-skills-checkout-");
    fetchCommit(url, first, dir);
    expect(readFileSync(join(dir, "skills", "productivity", "grilling", "SKILL.md"), "utf8")).toBe("first");
    expect(git(dir, "rev-list", "--count", "HEAD").stdout.trim()).toBe("1");
  });

  it("refuses a commit the repo doesn't have", () => {
    const { url } = upstream();
    expect(() => fetchCommit(url, NEXT_SHA, tempDir("pocock-skills-checkout-"))).toThrow(/^`git fetch` failed \(/);
  });

  it("gives up when its time runs out", () => {
    const { url, second } = upstream();
    expect(() => fetchCommit(url, second, tempDir("pocock-skills-checkout-"), 1)).toThrow(/^`git init` failed \(.*ETIMEDOUT/);
  });
});

describe("readSkill", () => {
  it("reads every file in the skill folder, nested ones too", () => {
    const checkout = tempDir("pocock-skills-read-");
    write(join(checkout, "skills", "e", "tdd", "SKILL.md"), "skill");
    write(join(checkout, "skills", "e", "tdd", "agents", "openai.yaml"), "yaml");
    const files = readSkill(checkout, { name: "tdd", path: "skills/e/tdd" });
    expect([...files.keys()].sort()).toEqual(["SKILL.md", "agents/openai.yaml"]);
  });

  it("refuses a skill folder with no SKILL.md", () => {
    const checkout = tempDir("pocock-skills-read-");
    write(join(checkout, "skills", "e", "tdd", "README.md"), "x");
    expect(() => readSkill(checkout, { name: "tdd", path: "skills/e/tdd" })).toThrow("skills/e/tdd has no SKILL.md");
  });

  // Windows needs extra rights to make a symlink; CI runs this on Linux.
  it.skipIf(process.platform === "win32")("leaves out symlinks, so nothing installed points outside the skill", () => {
    const checkout = tempDir("pocock-skills-read-");
    write(join(checkout, "skills", "e", "tdd", "SKILL.md"), "skill");
    symlinkSync("/etc/hostname", join(checkout, "skills", "e", "tdd", "host"));
    expect([...readSkill(checkout, { name: "tdd", path: "skills/e/tdd" }).keys()]).toEqual(["SKILL.md"]);
  });
});

describe("installPocockSkills", () => {
  it.each([
    ["unset", {}],
    ["false", { CLAUDE_CODE_REMOTE: "false" }],
    ["1", { CLAUDE_CODE_REMOTE: "1" }],
  ])("downloads and writes nothing when CLAUDE_CODE_REMOTE is %s", async (_, env) => {
    const where = home();
    const { asked, get } = fakeGet();
    const { dirs, fetch } = fakeFetch();
    expect(await installPocockSkills(env, { get, fetchCommit: fetch, ...where })).toBe("");
    expect(asked).toEqual([]);
    expect(dirs).toEqual([]);
    expect(existsSync(where.markerFile)).toBe(false);
  });

  it("installs the 22 skills from the pinned commit beside the cloud's own folders, and records it", async () => {
    const where = home();
    const { dirs, fetch } = fakeFetch({ extra: { "skills/productivity/grilling/agents/openai.yaml": "codex" } });
    const line = await run(where, { fetch });
    expect(line).toMatch(/^Matt Pocock's skills: installed 22 from commit 49dd158, the one Anthropic's marketplace pins: ask-matt, grill-with-docs, /);
    expect(line).toMatch(/ Skipped tdd, teach \(a skill with that name is already here\) and diagnosing-bugs, code-review, pr \(Jasper's rules use other skills\)\.$/);
    expect(pocockFolders(where.skillsDir)).toHaveLength(22);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toBe(`# ./skills/productivity/grilling at ${SHA}\n`);
    expect(readFileSync(join(where.skillsDir, "grilling", "agents", "openai.yaml"), "utf8")).toBe("codex");
    expect(readFileSync(join(where.skillsDir, "synced", "README.md"), "utf8")).toBe("the cloud's synced");
    const marker = readMarker(where.markerFile);
    expect(marker.commit).toBe(SHA);
    expect([...marker.skills].sort()).toEqual(pocockFolders(where.skillsDir));
    expect(existsSync(dirs[0])).toBe(false);
    expect(readFileSync(join(where.skillsDir, "grilling", OWNER_FILE), "utf8")).toBe(`${SHA}\n`);
    expect(readdirSync(join(where.skillsDir, "..")).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("skips the download when the pinned commit is already installed", async () => {
    const where = home();
    await run(where);
    const { asked, get } = fakeGet();
    const { dirs, fetch } = fakeFetch();
    expect(await run(where, { get, fetch })).toBe("Matt Pocock's skills: commit 49dd158 is already installed, so nothing was downloaded.");
    expect(asked).toEqual([MARKETPLACE_URL]);
    expect(dirs).toEqual([]);
  });

  it("replaces its own folders when the marketplace pins a new commit, and leaves other folders alone", async () => {
    const where = home();
    await run(where);
    write(join(where.skillsDir, "my-own-skill", "SKILL.md"), "mine");
    writeFileSync(join(where.skillsDir, "grilling", "stale.md"), "from the old commit");
    const line = await run(where, { get: fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }) }).get });
    expect(line).toMatch(/^Matt Pocock's skills: installed 22 from commit 1111111/);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toContain(NEXT_SHA);
    expect(existsSync(join(where.skillsDir, "grilling", "stale.md"))).toBe(false);
    expect(readFileSync(join(where.skillsDir, "my-own-skill", "SKILL.md"), "utf8")).toBe("mine");
    expect(readMarker(where.markerFile).commit).toBe(NEXT_SHA);
  });

  it("never overwrites a folder it didn't write", async () => {
    const where = home();
    write(join(where.skillsDir, "grilling", "SKILL.md"), "someone else's");
    const line = await run(where);
    expect(line).toMatch(/installed 21 from commit 49dd158/);
    expect(line).toMatch(/Skipped tdd, grilling, teach \(a skill with that name is already here\)/);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toBe("someone else's");
  });

  it.each([
    ["the marketplace can't be reached", { get: fakeGet({ down: true }).get }, /because curl couldn't reach raw\.githubusercontent\.com \(Could not resolve host\)\. Nothing was changed\.$/],
    ["the marketplace answers 503", { get: fakeGet({ status: 503 }).get }, /because Anthropic's marketplace answered HTTP 503\. Nothing was changed\.$/],
    ["the entry points at another repo", { get: fakeGet({ marketplace: marketplaceWith({ url: "https://github.com/x/skills.git" }) }).get }, /because the mattpocock-skills entry points at/],
    ["the sha is short", { get: fakeGet({ marketplace: marketplaceWith({ sha: "49dd158" }) }).get }, /isn't a full 40-character commit ID\. Nothing was changed\.$/],
    ["git can't fetch the commit", { fetch: fakeFetch({ fails: new Refusal("`git fetch` failed (Could not resolve host: github.com)") }).fetch }, /because `git fetch` failed \(Could not resolve host: github.com\)\. Nothing was changed\.$/],
    ["the commit has no plugin.json", { fetch: fakeFetch({ extra: { ".claude-plugin/plugin.json": null } }).fetch }, /because commit 49dd158 has no \.claude-plugin\/plugin\.json\./],
    ["a listed skill has no SKILL.md", { fetch: fakeFetch({ extra: { "skills/productivity/grilling/SKILL.md": null } }).fetch }, /because skills\/productivity\/grilling has no SKILL\.md\./],
  ])("prints one line and installs nothing when %s", async (_, fakes, message) => {
    const where = home();
    const line = await run(where, fakes);
    expect(line).toMatch(/^Matt Pocock's skills: not installed, because /);
    expect(line).toMatch(message);
    expect(line).not.toContain("\n");
    expect(pocockFolders(where.skillsDir)).toEqual([]);
    expect(existsSync(where.markerFile)).toBe(false);
  });

  it("removes its temporary checkout when the install fails", async () => {
    const { dirs, fetch } = fakeFetch({ extra: { "skills/productivity/grilling/SKILL.md": null } });
    await run(home(), { fetch });
    expect(dirs).toHaveLength(1);
    expect(existsSync(dirs[0])).toBe(false);
  });

  it("downloads again when a skill the marker lists has gone missing", async () => {
    const where = home();
    await run(where);
    rmSync(join(where.skillsDir, "grilling"), { recursive: true });
    const { dirs, fetch } = fakeFetch();
    expect(await run(where, { fetch })).toMatch(/^Matt Pocock's skills: installed 22 from commit 49dd158/);
    expect(dirs).toHaveLength(1);
    expect(existsSync(join(where.skillsDir, "grilling", "SKILL.md"))).toBe(true);
  });

  it.each([
    ["cut off halfway", '{"commit": "49dd158d1076134a641b33efb035946536778336", "skil'],
    ["naming a folder outside the skills folder", JSON.stringify({ commit: SHA, skills: ["grilling", "../escape"] })],
  ])("downloads again when the marker is %s, and touches only its own folders", async (_, text) => {
    const where = home();
    await run(where);
    write(join(where.skillsDir, "..", "escape", "keep.txt"), "outside");
    writeFileSync(where.markerFile, text);
    expect(await run(where)).toMatch(/^Matt Pocock's skills: installed 22 from commit 49dd158/);
    expect(readMarker(where.markerFile).commit).toBe(SHA);
    expect(readFileSync(join(where.skillsDir, "..", "escape", "keep.txt"), "utf8")).toBe("outside");
  });

  it("removes a skill of its own that the new commit no longer lists", async () => {
    const where = home();
    await run(where);
    const plugin = JSON.parse(PLUGIN);
    plugin.skills = plugin.skills.filter((path) => !path.endsWith("/grilling"));
    const next = { get: fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }) }).get, fetch: fakeFetch({ extra: { ".claude-plugin/plugin.json": JSON.stringify(plugin) } }).fetch };
    expect(await run(where, next)).toMatch(/^Matt Pocock's skills: installed 21 from commit 1111111/);
    expect(existsSync(join(where.skillsDir, "grilling"))).toBe(false);
  });

  it("gives a name back to the repo when the repo gets a skill with it", async () => {
    const where = home();
    await run(where);
    const repo = tempDir("pocock-skills-repo-");
    for (const own of ["tdd", "teach", "grilling"]) write(join(repo, own, "SKILL.md"), "the repo's own");
    const { dirs, fetch } = fakeFetch();
    const line = await run({ ...where, repoSkillsDir: repo }, { fetch });
    expect(dirs).toHaveLength(1);
    expect(line).toMatch(/installed 21 from commit 49dd158.* Skipped tdd, grilling, teach \(a skill with that name is already here\)/);
    expect(existsSync(join(where.skillsDir, "grilling"))).toBe(false);
  });

  it("never replaces a folder without its owner file, even when the marker lists it", async () => {
    const where = home();
    await run(where);
    rmSync(join(where.skillsDir, "grilling", OWNER_FILE));
    writeFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "someone else's now");
    const line = await run(where, { get: fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }) }).get });
    expect(line).toMatch(/installed 21 from commit 1111111/);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toBe("someone else's now");
  });

  it("refuses when every skill is skipped", async () => {
    const where = home();
    const plugin = JSON.stringify({ skills: ["./skills/engineering/tdd", "./skills/engineering/pr"] });
    const line = await run(where, { fetch: fakeFetch({ extra: { ".claude-plugin/plugin.json": plugin } }).fetch });
    expect(line).toBe("Matt Pocock's skills: not installed, because every skill in commit 49dd158 is skipped. Nothing was changed.");
  });

  it("refuses a plugin.json that lists two skills with one name", () => {
    const plugin = JSON.stringify({ skills: ["./skills/engineering/grilling", "./skills/productivity/grilling"] });
    expect(() => skillsToInstall(plugin, new Set())).toThrow("the commit's plugin.json lists two skills named grilling");
  });

  // The marker is written last, so a marker that can't be written stands in
  // for any write that fails after the download.
  it("says so in one line when writing fails", async () => {
    const where = home();
    const blocked = join(where.skillsDir, "..", "not-a-folder");
    writeFileSync(blocked, "a file where the marker's folder should be");
    const line = await run({ ...where, markerFile: join(blocked, "mattpocock-skills.json") });
    expect(line).toMatch(/^Matt Pocock's skills: writing commit 49dd158 stopped halfway \(.*\), so some may be missing\. The next session start tries again\.$/);
    expect(readdirSync(join(where.skillsDir, "..")).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("keeps the installed commit's skills when the next update fails", async () => {
    const where = home();
    await run(where);
    const failing = fakeFetch({ fails: new Refusal("`git fetch` failed (timed out)") });
    expect(await run(where, { get: fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }) }).get, fetch: failing.fetch })).toMatch(
      /Nothing was changed\. The skills from commit 49dd158 stay\.$/,
    );
    expect(readMarker(where.markerFile).commit).toBe(SHA);
    expect(pocockFolders(where.skillsDir)).toHaveLength(22);
  });
});

describe("the hook as Claude Code runs it", () => {
  const hook = fileURLToPath(new URL("./pocock-skills.mjs", import.meta.url));
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));

  it("exits at once and prints nothing outside the cloud", () => {
    const env = { ...process.env };
    delete env.CLAUDE_CODE_REMOTE;
    const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  // A proxy nobody listens on makes curl fail on every system, after its two
  // retries, which shows the real script turns a network failure into one
  // line and exit 0.
  it("prints one line, exits 0 and writes nothing when the network fails in the cloud", () => {
    const config = tempDir("pocock-skills-entry-");
    const proxy = "http://127.0.0.1:9";
    const env = { ...process.env, CLAUDE_CODE_REMOTE: "true", CLAUDE_CONFIG_DIR: config, HTTPS_PROXY: proxy, https_proxy: proxy, NO_PROXY: "", no_proxy: "" };
    const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 60_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Matt Pocock's skills: not installed, because curl couldn't reach raw\.githubusercontent\.com \(.*\)\. Nothing was changed\.\n$/);
    expect(readdirSync(config)).toEqual([]);
  }, 60_000);

  it("is wired to session start, resume and fork in the project settings", () => {
    expect(settings.hooks.SessionStart).toContainEqual({
      matcher: "startup|resume|fork",
      hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pocock-skills.mjs"', timeout: 120 }],
    });
  });

  // curl and git must give up early enough for the hook to print its line
  // before Claude Code stops it, with time left for writing the files.
  it("gives curl and git less time together than the hook's timeout", () => {
    const entry = settings.hooks.SessionStart.find(({ hooks }) => hooks.some(({ command }) => command.includes("pocock-skills.mjs")));
    expect(CURL_WORST_MS + GIT_BUDGET_MS + 20_000).toBeLessThanOrEqual(entry.hooks[0].timeout * 1000);
  });
});
