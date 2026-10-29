// Helpers for pocock-skills.mjs, in their own file so pocock-skills.test.mjs
// can test them on temporary folders and local git repos.

import { execFile, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

// Anthropic's official marketplace, the file Claude Code reads to install and
// update `mattpocock-skills@claude-plugins-official` on Jasper's PC.
export const MARKETPLACE_URL =
  "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json";
export const PLUGIN_NAME = "mattpocock-skills";
// The only source the hook accepts. If the marketplace ever points the entry
// somewhere else, the hook stops rather than follow it (decision record 0015).
export const SOURCE_URL = "https://github.com/mattpocock/skills.git";

// Jasper's global rules use other skills for these jobs: pstack's `why` for
// bugs, the reviewer agent for review and the PR template for PR bodies.
export const SKIPPED_BY_RULE = ["diagnosing-bugs", "code-review", "pr"];

// Claude Code stops a hook at its timeout (120 seconds in settings.json), and
// a stopped hook prints nothing, so the downloads give up well before that:
// curl within CURL_WORST_MS, and the git steps together within GIT_BUDGET_MS.
export const CURL_WORST_MS = 35_000;
export const GIT_BUDGET_MS = 60_000;

// A reason the hook installed nothing, worded to finish "not installed, because".
export class Refusal extends Error {}

export function pinnedCommit(marketplaceText) {
  let marketplace;
  try {
    marketplace = JSON.parse(marketplaceText);
  } catch {
    throw new Refusal("Anthropic's marketplace file isn't valid JSON");
  }
  const entries = Array.isArray(marketplace?.plugins) ? marketplace.plugins : [];
  const entry = entries.find((plugin) => plugin?.name === PLUGIN_NAME);
  if (!entry) throw new Refusal(`Anthropic's marketplace has no ${PLUGIN_NAME} entry`);
  const { url, sha } = entry.source ?? {};
  if (url !== SOURCE_URL) throw new Refusal(`the ${PLUGIN_NAME} entry points at ${JSON.stringify(url)}, not ${SOURCE_URL}`);
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Refusal(`the ${PLUGIN_NAME} entry's sha ${JSON.stringify(sha)} isn't a full 40-character commit ID`);
  }
  return sha;
}

// The plugin's own plugin.json lists the skill folders it ships, which is the
// set the local plugin loads. The repo's other folders (in-progress, misc,
// deprecated) aren't part of the plugin, so they aren't installed either.
const SKILL_PATH = /^\.\/skills\/[a-z0-9-]+\/([a-z0-9][a-z0-9-]*)$/;

// Splits the plugin's skills into the ones to install and the ones skipped.
// `taken` holds the names that already belong to someone else, such as the
// repo's own `tdd` and `teach`: a personal skill beats a project skill with
// the same name, so installing Pocock's would hide pstack's.
export function skillsToInstall(pluginText, taken) {
  let plugin;
  try {
    plugin = JSON.parse(pluginText);
  } catch {
    throw new Refusal("the commit's plugin.json isn't valid JSON");
  }
  if (!Array.isArray(plugin?.skills) || plugin.skills.length === 0) {
    throw new Refusal("the commit's plugin.json lists no skills");
  }
  const install = [];
  const skipped = { taken: [], byRule: [] };
  for (const path of plugin.skills) {
    const name = typeof path === "string" && path.match(SKILL_PATH)?.[1];
    if (!name) throw new Refusal(`the commit's plugin.json lists an unexpected skill path ${JSON.stringify(path)}`);
    if ([...install, ...skipped.taken, ...skipped.byRule].some((seen) => (seen.name ?? seen) === name)) {
      throw new Refusal(`the commit's plugin.json lists two skills named ${name}`);
    }
    if (SKIPPED_BY_RULE.includes(name)) skipped.byRule.push(name);
    else if (taken.has(name)) skipped.taken.push(name);
    else install.push({ name, path: path.slice(2) });
  }
  return { install, skipped };
}

const lastLine = (text) => text.trim().split("\n").pop();

// Git variables that point it at a repo other than the one in `-C dir`. If the
// session had one set, `git checkout` would move that repo instead.
const GIT_REPO_VARIABLES = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR"];

// Checks out exactly `sha` from `url` into the empty folder `dir`: a fetch of
// that one commit, never a branch. A cloud session's GitHub proxy lets git
// fetch a public repo the session didn't clone, though it answers 403 for its
// archive downloads (decision record 0015). The steps share GIT_BUDGET_MS.
export function fetchCommit(url, sha, dir, budgetMs = GIT_BUDGET_MS) {
  const end = Date.now() + budgetMs;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const name of GIT_REPO_VARIABLES) delete env[name];
  const git = (...args) => {
    const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: Math.max(1, end - Date.now()), env });
    if (result.status !== 0) {
      const why = result.error?.message ?? lastLine(result.stderr || `exit code ${result.status}`);
      throw new Refusal(`\`git ${args[0]}\` failed (${why})`);
    }
    return result.stdout.trim();
  };
  git("init", "-q");
  git("fetch", "-q", "--depth", "1", "--no-tags", url, sha);
  git("checkout", "-q", "--detach", "FETCH_HEAD");
  if (git("rev-parse", "HEAD") !== sha) throw new Refusal(`git checked out something other than ${sha}`);
}

// Every regular file in a skill folder of the checkout, by its path inside the
// folder. A symlink or anything else that isn't a plain file is left out, so
// nothing installed can point outside the skill.
export function readSkill(checkout, skill) {
  const root = join(checkout, ...skill.path.split("/"));
  if (!existsSync(join(root, "SKILL.md"))) throw new Refusal(`${skill.path} has no SKILL.md`);
  const files = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isDirectory()) walk(full, `${prefix}${entry}/`);
      else if (stat.isFile()) files.set(`${prefix}${entry}`, readFileSync(full));
    }
  };
  walk(root, "");
  return files;
}

// Each folder this hook installs holds this file, with the commit in it.
// Ownership lives in the folder, so a lost marker never strands a folder, and
// the hook never replaces or deletes a folder without one.
export const OWNER_FILE = ".mattpocock-skills";

const entries = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);
const folders = (dir) => entries(dir).filter((e) => e.isDirectory()).map((e) => e.name);
const ownedFolders = (skillsDir) => folders(skillsDir).filter((name) => existsSync(join(skillsDir, name, OWNER_FILE)));

// The names Pocock's skills must not take: every folder in the repo's
// .claude/skills/, and everything in the install folder this hook didn't
// write, such as the cloud's own `session-start-hook` and `synced`, and any
// file or link there.
export function takenNames(repoSkillsDir, skillsDir) {
  const owned = ownedFolders(skillsDir);
  return new Set([...folders(repoSkillsDir), ...entries(skillsDir).map((e) => e.name).filter((name) => !owned.includes(name))]);
}

// The marker records the installed commit and skill names, only so an
// unchanged pin can skip the download. Anything odd in it means "download".
export function readMarker(markerFile) {
  try {
    const { commit, skills } = JSON.parse(readFileSync(markerFile, "utf8"));
    if (typeof commit === "string" && Array.isArray(skills) && skills.every((s) => typeof s === "string")) {
      return { commit, skills };
    }
  } catch {
    // Missing or unreadable: same as no install.
  }
  return { commit: null, skills: [] };
}

// Skipping is safe only when the marker's commit is the pinned one and every
// skill it lists is still there, still the hook's, and not a repo skill now.
export function alreadyInstalled(marker, sha, skillsDir, repoSkillsDir) {
  const repo = folders(repoSkillsDir);
  return (
    marker.commit === sha &&
    marker.skills.length > 0 &&
    marker.skills.every((name) => !repo.includes(name) && existsSync(join(skillsDir, name, "SKILL.md")) && existsSync(join(skillsDir, name, OWNER_FILE)))
  );
}

// Writes `text` to a temporary file beside `file`, then renames it over
// `file`, so a reader never sees half of it.
function writeWhole(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, file);
}

const STAGING_PREFIX = ".mattpocock-skills-staging-";

// A hook stopped at its timeout can leave a staging folder or a marker copy
// behind. One older than LEFTOVER_MS can't belong to a hook still running.
const LEFTOVER_MS = 10 * 60_000;
function removeLeftovers(skillsDir, markerFile) {
  const leftovers = [
    ...entries(dirname(skillsDir)).filter((e) => e.name.startsWith(STAGING_PREFIX)).map((e) => join(dirname(skillsDir), e.name)),
    ...entries(dirname(markerFile)).filter((e) => e.name.startsWith(`${basename(markerFile)}.`) && e.name.endsWith(".tmp")).map((e) => join(dirname(markerFile), e.name)),
  ];
  for (const path of leftovers) {
    if (Date.now() - lstatSync(path).mtimeMs > LEFTOVER_MS) rmSync(path, { recursive: true, force: true });
  }
}

// Swaps the old install for the new one. Every skill is written in full to a
// staging folder beside the install folder first, then each is renamed into
// place, so Claude Code's folder watcher never sees half a skill. Only the
// hook's own folders are deleted or replaced. The marker is written last.
export function replaceSkills(skillsDir, markerFile, sha, installed) {
  mkdirSync(skillsDir, { recursive: true });
  removeLeftovers(skillsDir, markerFile);
  const staging = mkdtempSync(join(dirname(skillsDir), STAGING_PREFIX));
  try {
    for (const [name, files] of installed) {
      for (const [file, body] of [...files, [OWNER_FILE, `${sha}\n`]]) {
        const target = join(staging, name, ...file.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, body);
      }
    }
    for (const name of ownedFolders(skillsDir)) {
      if (!installed.has(name)) rmSync(join(skillsDir, name), { recursive: true, force: true });
    }
    for (const name of installed.keys()) {
      rmSync(join(skillsDir, name), { recursive: true, force: true });
      renameSync(join(staging, name), join(skillsDir, name));
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  writeWhole(markerFile, `${JSON.stringify({ commit: sha, skills: [...installed.keys()] }, null, 2)}\n`);
}

const list = (names) => names.join(", ");

// The whole job. Returns the one line to print, or "" outside the cloud.
// `get(url)` resolves to { status, body } and rejects with a Refusal when it
// can't reach the server; `fetchCommit(url, sha, dir)` checks the commit out
// into an empty folder. `skillsDir` is where the skills go and
// `repoSkillsDir` the repo's own .claude/skills/.
export async function installPocockSkills(env, { get, fetchCommit, skillsDir, repoSkillsDir, markerFile }) {
  if (env.CLAUDE_CODE_REMOTE !== "true") return "";
  const marker = readMarker(markerFile);
  try {
    const marketplace = await get(MARKETPLACE_URL);
    if (marketplace.status !== 200) throw new Refusal(`Anthropic's marketplace answered HTTP ${marketplace.status}`);
    const sha = pinnedCommit(marketplace.body.toString("utf8"));
    const short = sha.slice(0, 7);
    if (alreadyInstalled(marker, sha, skillsDir, repoSkillsDir)) {
      return `Matt Pocock's skills: commit ${short} is already installed, so nothing was downloaded.`;
    }
    const checkout = mkdtempSync(join(tmpdir(), "pocock-skills-"));
    let install, skipped, files;
    try {
      fetchCommit(SOURCE_URL, sha, checkout);
      const pluginFile = join(checkout, ".claude-plugin", "plugin.json");
      if (!existsSync(pluginFile)) throw new Refusal(`commit ${short} has no .claude-plugin/plugin.json`);
      ({ install, skipped } = skillsToInstall(readFileSync(pluginFile, "utf8"), takenNames(repoSkillsDir, skillsDir)));
      if (install.length === 0) throw new Refusal(`every skill in commit ${short} is skipped`);
      files = new Map(install.map((skill) => [skill.name, readSkill(checkout, skill)]));
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
    try {
      replaceSkills(skillsDir, markerFile, sha, files);
    } catch (error) {
      return `Matt Pocock's skills: writing commit ${short} stopped halfway (${error.message}), so some may be missing. The next session start tries again.`;
    }
    const notes = [];
    if (skipped.taken.length) notes.push(`${list(skipped.taken)} (a skill with that name is already here)`);
    if (skipped.byRule.length) notes.push(`${list(skipped.byRule)} (Jasper's rules use other skills)`);
    return `Matt Pocock's skills: installed ${install.length} from commit ${short}, the one Anthropic's marketplace pins: ${list(install.map((s) => s.name))}.${notes.length ? ` Skipped ${notes.join(" and ")}.` : ""}`;
  } catch (error) {
    // Collapsed onto one line, since git's or curl's own message may have several.
    const reason = (error instanceof Refusal ? error.message : `of an unexpected error: ${error?.message ?? error}`).replace(/\s+/g, " ");
    const kept = marker.commit ? ` The skills from commit ${marker.commit.slice(0, 7)} stay.` : "";
    return `Matt Pocock's skills: not installed, because ${reason}. Nothing was changed.${kept}`;
  }
}

// Fetches a URL with curl, which uses the cloud machine's proxy settings, and
// resolves to { status, body }. curl tries 3 times, 10 seconds each, and only
// over https. It rejects with a Refusal when it can't reach the server.
export function curlGet(url) {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "--location", "--proto", "=https", "--proto-redir", "=https", "--max-time", "10", "--retry", "2", "--retry-all-errors"];
    args.push("--max-filesize", "5000000", "--write-out", "\n%{http_code}", url);
    execFile("curl", args, { encoding: "buffer", maxBuffer: 10_000_000, timeout: CURL_WORST_MS }, (error, stdout, stderr) => {
      if (error) {
        const why = lastLine(stderr.toString("utf8")) || error.message;
        return reject(new Refusal(`curl couldn't reach ${new URL(url).host} (${why})`));
      }
      const split = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.subarray(split + 1).toString("utf8")), body: stdout.subarray(0, split) });
    });
  });
}
