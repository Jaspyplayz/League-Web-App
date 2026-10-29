// Helpers for pocock-skills.mjs, in their own file so pocock-skills.test.mjs
// can test them on temporary folders with a fake download.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

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

// A cloud session can fetch another public repo's files only from
// raw.githubusercontent.com: the GitHub proxy answers 403 for archives and API
// calls on repos the session didn't clone (decision record 0015). A URL with
// the commit in it always serves that commit's file.
export const rawUrl = (sha, path) => `https://raw.githubusercontent.com/mattpocock/skills/${sha}/${path}`;

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
// repo's own `tdd` and `teach`: a skill installed under the same name would
// hide or be hidden by it.
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
    if (SKIPPED_BY_RULE.includes(name)) skipped.byRule.push(name);
    else if (taken.has(name)) skipped.taken.push(name);
    else install.push({ name, path: path.slice(2) });
  }
  return { install, skipped };
}

// The relative Markdown links in a skill file, as paths inside the skill
// folder. A link that leaves the folder, starts at the root or is a web
// address is left out, and so is any name starting with a dot.
const LINK = /\]\(\s*<?([^)\s>#]+)/g;
const SAFE_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export function linkedFiles(markdown, fromFile) {
  const files = [];
  for (const [, target] of markdown.matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
    const path = posix.normalize(posix.join(posix.dirname(fromFile), target));
    if (SAFE_PATH.test(path) && !files.includes(path)) files.push(path);
  }
  return files;
}

// A skill folder has no file list on raw.githubusercontent.com, so the hook
// starts at SKILL.md and follows its relative links, and the links in any
// Markdown file those lead to. At 49dd158 that finds every file in the
// installed skills except agents/openai.yaml, which is for OpenAI's Codex. A
// link to a file that isn't there (404), such as an example path, is skipped.
export const MAX_FILES_PER_SKILL = 50;

export async function downloadSkill(get, sha, skill) {
  const files = new Map();
  const queue = ["SKILL.md"];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const file = queue.shift();
    const { status, body } = await get(rawUrl(sha, `${skill.path}/${file}`));
    if (status === 404 && file !== "SKILL.md") continue;
    if (status !== 200) throw new Refusal(`${skill.path}/${file} at ${sha.slice(0, 7)} answered HTTP ${status}`);
    files.set(file, body);
    if (files.size > MAX_FILES_PER_SKILL) throw new Refusal(`${skill.name} links to more than ${MAX_FILES_PER_SKILL} files`);
    if (!file.endsWith(".md")) continue;
    for (const linked of linkedFiles(body.toString("utf8"), file)) {
      if (!seen.has(linked)) {
        seen.add(linked);
        queue.push(linked);
      }
    }
  }
  return files;
}

// The marker says which commit is installed and which skill folders this hook
// wrote, so it only ever replaces its own folders.
export function readMarker(markerFile) {
  try {
    const marker = JSON.parse(readFileSync(markerFile, "utf8"));
    return { commit: typeof marker.commit === "string" ? marker.commit : null, skills: marker.skills.filter((s) => typeof s === "string") };
  } catch {
    return { commit: null, skills: [] };
  }
}

const writeMarker = (markerFile, commit, skills) => {
  mkdirSync(dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, `${JSON.stringify({ commit, skills }, null, 2)}\n`);
};

const folders = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

// Every skill folder in the given directories that this hook didn't write.
export function takenNames(dirs, owned) {
  return new Set(dirs.flatMap(folders).filter((name) => !owned.includes(name)));
}

// Swaps the old install for the new one. The marker first lists both sets with
// no commit, so if writing stops halfway, the next start still owns every
// folder and downloads again. `extraFiles` go in each skill folder too.
export function replaceSkills(skillsDir, markerFile, previous, sha, downloaded, extraFiles = {}) {
  const names = [...downloaded.keys()];
  writeMarker(markerFile, null, [...new Set([...previous, ...names])]);
  for (const name of previous) rmSync(join(skillsDir, name), { recursive: true, force: true });
  for (const [name, files] of downloaded) {
    rmSync(join(skillsDir, name), { recursive: true, force: true });
    for (const [file, body] of [...files, ...Object.entries(extraFiles)]) {
      const target = join(skillsDir, name, ...file.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }
  writeMarker(markerFile, sha, names);
}

const list = (names) => names.join(", ");

// The whole job. Returns the one line to print, or "" outside the cloud.
// `get(url)` resolves to { status, body } and rejects on a network error.
// `skillsDir` is where the skills go, `repoSkillsDir` the repo's own
// .claude/skills/, and `extraFiles` files added to each installed skill.
export async function installPocockSkills(env, { get, skillsDir, repoSkillsDir, markerFile, extraFiles }) {
  if (env.CLAUDE_CODE_REMOTE !== "true") return "";
  const marker = readMarker(markerFile);
  try {
    const marketplace = await get(MARKETPLACE_URL);
    if (marketplace.status !== 200) throw new Refusal(`Anthropic's marketplace answered HTTP ${marketplace.status}`);
    const sha = pinnedCommit(marketplace.body.toString("utf8"));
    const short = sha.slice(0, 7);
    if (marker.commit === sha) {
      return `Matt Pocock's skills: commit ${short} is already installed, so nothing was downloaded.`;
    }
    const plugin = await get(rawUrl(sha, ".claude-plugin/plugin.json"));
    if (plugin.status !== 200) throw new Refusal(`the commit's plugin.json answered HTTP ${plugin.status}`);
    const taken = takenNames([...new Set([repoSkillsDir, skillsDir])], marker.skills);
    const { install, skipped } = skillsToInstall(plugin.body.toString("utf8"), taken);
    const downloaded = new Map(await Promise.all(install.map(async (skill) => [skill.name, await downloadSkill(get, sha, skill)])));
    try {
      replaceSkills(skillsDir, markerFile, marker.skills, sha, downloaded, extraFiles);
    } catch (error) {
      return `Matt Pocock's skills: writing commit ${short} stopped halfway (${error.message}), so some may be missing. The next session start downloads them again.`;
    }
    const notes = [];
    if (skipped.taken.length) notes.push(`${list(skipped.taken)} (a skill with that name is already here)`);
    if (skipped.byRule.length) notes.push(`${list(skipped.byRule)} (Jasper's rules use other skills)`);
    return `Matt Pocock's skills: installed ${install.length} from commit ${short}, the one Anthropic's marketplace pins: ${list(install.map((s) => s.name))}.${notes.length ? ` Skipped ${notes.join(" and ")}.` : ""}`;
  } catch (error) {
    const reason = error instanceof Refusal ? error.message : `of an unexpected error: ${error?.message ?? error}`;
    const kept = marker.commit ? ` The skills from commit ${marker.commit.slice(0, 7)} stay.` : "";
    return `Matt Pocock's skills: not installed, because ${reason}. Nothing was changed.${kept}`;
  }
}

// Claude Code stops a hook at its timeout, and a stopped hook prints nothing,
// so all the downloads together get less time than the hook's 120 seconds.
export const DOWNLOAD_BUDGET_MS = 90_000;

// Wraps `get` so every call after `ms` from now fails with a Refusal, and a
// call still running at that point fails then too.
export function withDeadline(get, ms) {
  const end = Date.now() + ms;
  const late = `the downloads took longer than ${ms / 1000} seconds`;
  return (url) => {
    const left = end - Date.now();
    if (left <= 0) return Promise.reject(new Refusal(late));
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Refusal(late)), left);
    });
    return Promise.race([get(url), timeout]).finally(() => clearTimeout(timer));
  };
}

// Fetches a URL with curl, which uses the cloud machine's proxy settings, and
// resolves to { status, body }. It rejects when curl can't reach the server.
export function curlGet(url) {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "--location", "--max-time", "20", "--max-filesize", "1000000", "--write-out", "\n%{http_code}", url];
    execFile("curl", args, { encoding: "buffer", maxBuffer: 2_000_000, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`curl couldn't fetch ${url}: ${stderr.toString("utf8").trim() || error.message}`));
      const split = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.subarray(split + 1).toString("utf8")), body: stdout.subarray(0, split) });
    });
  });
}
