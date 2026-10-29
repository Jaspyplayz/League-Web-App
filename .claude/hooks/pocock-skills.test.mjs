import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  DOWNLOAD_BUDGET_MS,
  downloadSkill,
  installPocockSkills,
  linkedFiles,
  MARKETPLACE_URL,
  MAX_FILES_PER_SKILL,
  pinnedCommit,
  rawUrl,
  readMarker,
  Refusal,
  SKIPPED_BY_RULE,
  skillsToInstall,
  takenNames,
  withDeadline,
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

// The marketplace with the mattpocock-skills source changed.
const marketplaceWith = (source) => {
  const marketplace = JSON.parse(MARKETPLACE);
  const entry = marketplace.plugins.find(({ name }) => name === "mattpocock-skills");
  entry.source = { ...entry.source, ...source };
  return JSON.stringify(marketplace);
};

// A stand-in for curlGet that serves a fake commit: every skill plugin.json
// lists has a SKILL.md, and `extra` adds or replaces files by URL. It records
// each URL asked for, and rejects the ones in `unreachable`.
function fakeGet({ marketplace = MARKETPLACE, sha = SHA, extra = {}, unreachable = [] } = {}) {
  const files = { [MARKETPLACE_URL]: marketplace, [rawUrl(sha, ".claude-plugin/plugin.json")]: PLUGIN };
  for (const path of JSON.parse(PLUGIN).skills) files[rawUrl(sha, `${path.slice(2)}/SKILL.md`)] = `# ${path} at ${sha}\n`;
  Object.assign(files, extra);
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    if (unreachable.includes(url)) throw new Error(`curl couldn't fetch ${url}: Could not resolve host`);
    if (!(url in files)) return { status: 404, body: Buffer.from("404: Not Found") };
    const body = files[url];
    return typeof body === "number" ? { status: body, body: Buffer.from("") } : { status: 200, body: Buffer.from(body) };
  };
  return { asked, get };
}

const homes = [];
afterAll(() => homes.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
// An empty place to install into, with the marker beside it.
function place() {
  const dir = mkdtempSync(join(tmpdir(), "pocock-skills-"));
  homes.push(dir);
  return { skillsDir: join(dir, "skills"), repoSkillsDir, markerFile: join(dir, "marker.json") };
}
const installedNames = (skillsDir) => (existsSync(skillsDir) ? readdirSync(skillsDir).sort() : []);

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
    const { install, skipped } = skillsToInstall(PLUGIN, takenNames([repoSkillsDir], []));
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

describe("linkedFiles", () => {
  it("finds relative links, from the linking file's folder", () => {
    const markdown = "See [tests](tests.md), [the format](./ADR-FORMAT.md#top) and [ui](<prototype/UI.md>).";
    expect(linkedFiles(markdown, "SKILL.md")).toEqual(["tests.md", "ADR-FORMAT.md", "prototype/UI.md"]);
    expect(linkedFiles("[back](../SKILL.md) [here](mocking.md)", "notes/deep.md")).toEqual(["SKILL.md", "notes/mocking.md"]);
  });

  it("leaves out links that leave the folder, web addresses, root paths and dot names", () => {
    const markdown = "[a](../other-skill/SKILL.md) [b](https://example.com/x.md) [c](/etc/passwd) [d](.env) [e](mailto:a@b.c) [f](#anchor)";
    expect(linkedFiles(markdown, "SKILL.md")).toEqual([]);
  });
});

describe("downloadSkill", () => {
  const skill = { name: "codebase-design", path: "skills/engineering/codebase-design" };
  const at = (file) => rawUrl(SHA, `${skill.path}/${file}`);

  it("follows links from SKILL.md, once each, and skips the ones that aren't there", async () => {
    const { asked, get } = fakeGet({
      extra: {
        [at("SKILL.md")]: "[deep](DEEPENING.md) [twice](DESIGN-IT-TWICE.md) [example](src/GLOSSARY.md)",
        [at("DEEPENING.md")]: "[back](SKILL.md) [twice](DESIGN-IT-TWICE.md)",
        [at("DESIGN-IT-TWICE.md")]: "done",
      },
    });
    const files = await downloadSkill(get, SHA, skill);
    expect([...files.keys()]).toEqual(["SKILL.md", "DEEPENING.md", "DESIGN-IT-TWICE.md"]);
    expect(asked).toEqual([at("SKILL.md"), at("DEEPENING.md"), at("DESIGN-IT-TWICE.md"), at("src/GLOSSARY.md")]);
  });

  it("refuses when SKILL.md is missing or a file answers with an error", async () => {
    await expect(downloadSkill(fakeGet({ extra: { [at("SKILL.md")]: 404 } }).get, SHA, skill)).rejects.toThrow(/SKILL.md at 49dd158 answered HTTP 404/);
    const failing = fakeGet({ extra: { [at("SKILL.md")]: "[a](A.md)", [at("A.md")]: 500 } });
    await expect(downloadSkill(failing.get, SHA, skill)).rejects.toThrow(/A.md at 49dd158 answered HTTP 500/);
  });

  it(`refuses a skill that links to more than ${MAX_FILES_PER_SKILL} files`, async () => {
    const extra = { [at("SKILL.md")]: Array.from({ length: 60 }, (_, i) => `[f](f${i}.md)`).join(" ") };
    for (let i = 0; i < 60; i++) extra[at(`f${i}.md`)] = "x";
    await expect(downloadSkill(fakeGet({ extra }).get, SHA, skill)).rejects.toThrow(/links to more than 50 files/);
  });
});

describe("installPocockSkills", () => {
  it.each([
    ["unset", {}],
    ["false", { CLAUDE_CODE_REMOTE: "false" }],
    ["1", { CLAUDE_CODE_REMOTE: "1" }],
  ])("downloads and writes nothing when CLAUDE_CODE_REMOTE is %s", async (_, env) => {
    const where = place();
    const { asked, get } = fakeGet();
    expect(await installPocockSkills(env, { get, ...where })).toBe("");
    expect(asked).toEqual([]);
    expect(existsSync(where.markerFile)).toBe(false);
  });

  it("installs the 22 skills from the pinned commit and records it", async () => {
    const where = place();
    const { get } = fakeGet();
    const line = await installPocockSkills(CLOUD, { get, ...where, extraFiles: { ".gitignore": "*\n" } });
    expect(line).toMatch(/^Matt Pocock's skills: installed 22 from commit 49dd158, the one Anthropic's marketplace pins: ask-matt, grill-with-docs, /);
    expect(line).toMatch(/ Skipped tdd, teach \(a skill with that name is already here\) and diagnosing-bugs, code-review, pr \(Jasper's rules use other skills\)\.$/);
    expect(installedNames(where.skillsDir)).toHaveLength(22);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toBe(`# ./skills/productivity/grilling at ${SHA}\n`);
    expect(readFileSync(join(where.skillsDir, "grilling", ".gitignore"), "utf8")).toBe("*\n");
    const marker = readMarker(where.markerFile);
    expect(marker.commit).toBe(SHA);
    expect([...marker.skills].sort()).toEqual(installedNames(where.skillsDir));
  });

  it("skips the download when the pinned commit is already installed", async () => {
    const where = place();
    await installPocockSkills(CLOUD, { get: fakeGet().get, ...where });
    const { asked, get } = fakeGet();
    expect(await installPocockSkills(CLOUD, { get, ...where })).toBe(
      "Matt Pocock's skills: commit 49dd158 is already installed, so nothing was downloaded.",
    );
    expect(asked).toEqual([MARKETPLACE_URL]);
  });

  it("replaces its own folders when the marketplace pins a new commit, and leaves other folders alone", async () => {
    const where = place();
    await installPocockSkills(CLOUD, { get: fakeGet().get, ...where });
    mkdirSync(join(where.skillsDir, "my-own-skill"));
    writeFileSync(join(where.skillsDir, "grilling", "stale.md"), "from the old commit");
    const line = await installPocockSkills(CLOUD, { get: fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }), sha: NEXT_SHA }).get, ...where });
    expect(line).toMatch(/^Matt Pocock's skills: installed 22 from commit 1111111/);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toContain(NEXT_SHA);
    expect(existsSync(join(where.skillsDir, "grilling", "stale.md"))).toBe(false);
    expect(existsSync(join(where.skillsDir, "my-own-skill"))).toBe(true);
    expect(readMarker(where.markerFile).commit).toBe(NEXT_SHA);
  });

  it("never overwrites a folder it didn't write", async () => {
    const where = place();
    mkdirSync(join(where.skillsDir, "grilling"), { recursive: true });
    writeFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "someone else's");
    const line = await installPocockSkills(CLOUD, { get: fakeGet().get, ...where });
    expect(line).toMatch(/installed 21 from commit 49dd158/);
    expect(line).toMatch(/Skipped tdd, grilling, teach \(a skill with that name is already here\)/);
    expect(readFileSync(join(where.skillsDir, "grilling", "SKILL.md"), "utf8")).toBe("someone else's");
  });

  it.each([
    ["the marketplace can't be reached", { unreachable: [MARKETPLACE_URL] }, /because of an unexpected error: curl couldn't fetch .*Could not resolve host\. Nothing was changed\.$/],
    ["the marketplace answers 503", { extra: { [MARKETPLACE_URL]: 503 } }, /because Anthropic's marketplace answered HTTP 503\. Nothing was changed\.$/],
    ["the entry points at another repo", { marketplace: marketplaceWith({ url: "https://github.com/x/skills.git" }) }, /because the mattpocock-skills entry points at/],
    ["the sha is short", { marketplace: marketplaceWith({ sha: "49dd158" }) }, /isn't a full 40-character commit ID\. Nothing was changed\.$/],
    ["one skill file fails", { extra: { [rawUrl(SHA, "skills/productivity/grilling/SKILL.md")]: 500 } }, /because skills\/productivity\/grilling\/SKILL.md at 49dd158 answered HTTP 500/],
  ])("prints one line and installs nothing when %s", async (_, options, message) => {
    const where = place();
    const line = await installPocockSkills(CLOUD, { get: fakeGet(options).get, ...where });
    expect(line).toMatch(/^Matt Pocock's skills: not installed, because /);
    expect(line).toMatch(message);
    expect(line).not.toContain("\n");
    expect(installedNames(where.skillsDir)).toEqual([]);
    expect(existsSync(where.markerFile)).toBe(false);
  });

  it("gives up with one line when the downloads run past their time", async () => {
    const where = place();
    const stalled = withDeadline(() => new Promise(() => {}), 50);
    expect(await installPocockSkills(CLOUD, { get: stalled, ...where })).toBe(
      "Matt Pocock's skills: not installed, because the downloads took longer than 0.05 seconds. Nothing was changed.",
    );
    expect(existsSync(where.markerFile)).toBe(false);
  });

  it("keeps the installed commit's skills when the next update fails", async () => {
    const where = place();
    await installPocockSkills(CLOUD, { get: fakeGet().get, ...where });
    const failing = fakeGet({ marketplace: marketplaceWith({ sha: NEXT_SHA }), sha: NEXT_SHA, unreachable: [rawUrl(NEXT_SHA, ".claude-plugin/plugin.json")] });
    expect(await installPocockSkills(CLOUD, { get: failing.get, ...where })).toMatch(/Nothing was changed\. The skills from commit 49dd158 stay\.$/);
    expect(readMarker(where.markerFile).commit).toBe(SHA);
    expect(installedNames(where.skillsDir)).toHaveLength(22);
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

  // A proxy nobody listens on makes curl fail at once on every system, which
  // shows the real script turns a network failure into one line and exit 0.
  it("prints one line, exits 0 and writes nothing when the network fails in the cloud", () => {
    const root = mkdtempSync(join(tmpdir(), "pocock-skills-entry-"));
    homes.push(root);
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    const proxy = "http://127.0.0.1:9";
    const env = { ...process.env, CLAUDE_CODE_REMOTE: "true", CLAUDE_PROJECT_DIR: root, HTTPS_PROXY: proxy, https_proxy: proxy, NO_PROXY: "", no_proxy: "" };
    const result = spawnSync(process.execPath, [hook], { env, encoding: "utf8", timeout: 60_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Matt Pocock's skills: not installed, because of an unexpected error: curl couldn't fetch https:\/\/raw\.githubusercontent\.com\/anthropics\/claude-plugins-official\/main\/\.claude-plugin\/marketplace\.json: .*\. Nothing was changed\.\n$/);
    expect(readdirSync(join(root, ".claude", "skills"))).toEqual([]);
  });

  // The installed folders must never end up in a commit: each holds a
  // .gitignore of "*", and the repo's .gitignore covers the marker.
  it("leaves git status clean after an install into a repo's .claude/skills", async () => {
    const root = mkdtempSync(join(tmpdir(), "pocock-skills-git-"));
    homes.push(root);
    const skillsDir = join(root, ".claude", "skills");
    for (const own of ["tdd", "teach"]) {
      mkdirSync(join(skillsDir, own), { recursive: true });
      writeFileSync(join(skillsDir, own, "SKILL.md"), "the repo's own");
    }
    writeFileSync(join(root, ".gitignore"), readFileSync(new URL("../../.gitignore", import.meta.url)));
    const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "repo");
    const where = { skillsDir, repoSkillsDir: skillsDir, markerFile: join(skillsDir, ".mattpocock-skills.json"), extraFiles: { ".gitignore": "*\n" } };
    expect(await installPocockSkills(CLOUD, { get: fakeGet().get, ...where })).toMatch(/installed 22 from commit 49dd158/);
    // 22 installed, the repo's tdd and teach, and the marker.
    expect(readdirSync(skillsDir)).toHaveLength(25);
    expect(git("status", "--porcelain", "--untracked-files=all").stdout).toBe("");
  });

  it("is wired to session start, resume and fork in the project settings", () => {
    expect(settings.hooks.SessionStart).toContainEqual({
      matcher: "startup|resume|fork",
      hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pocock-skills.mjs"', timeout: 120 }],
    });
  });

  // The downloads must give up early enough to print their line before
  // Claude Code stops the hook, with time left for writing the files.
  it("gives the downloads less time than the hook's timeout", () => {
    const entry = settings.hooks.SessionStart.find(({ hooks }) => hooks.some(({ command }) => command.includes("pocock-skills.mjs")));
    expect(DOWNLOAD_BUDGET_MS + 20_000).toBeLessThanOrEqual(entry.hooks[0].timeout * 1000);
  });
});
