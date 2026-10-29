// Claude Code hook: give a cloud session Matt Pocock's skills, at the commit
// Anthropic's official marketplace pins for `mattpocock-skills`.
//
// On Jasper's PC the plugin `mattpocock-skills@claude-plugins-official`
// provides them and updates itself, but cloud sessions don't install plugins
// (https://code.claude.com/docs/en/cloud-environments). So in the cloud this
// hook reads the plugin's entry in Anthropic's marketplace and downloads the
// skills that commit's plugin.json lists, the same set the plugin loads. When
// the marketplace moves the plugin to a new commit, the next cloud session
// gets it. Locally it does nothing: Claude Code sets CLAUDE_CODE_REMOTE to
// "true" only in the cloud (https://code.claude.com/docs/en/hooks).
//
// The skills go in the repo's .claude/skills/, the folder Claude Code watches
// in every session, and each gets a .gitignore that hides it from git, so
// none is ever committed. Decision record 0015 has why, and why it's the
// pinned commit and not the newest one.
//
// A failure never stops the session: the hook prints one line saying why
// nothing was installed, and exits 0. Claude Code adds that line to Claude's
// context.

import { join } from "node:path";
import { curlGet, DOWNLOAD_BUDGET_MS, installPocockSkills, withDeadline } from "./pocock-skills-steps.mjs";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const skillsDir = join(root, ".claude", "skills");

const line = await installPocockSkills(process.env, {
  get: withDeadline(curlGet, DOWNLOAD_BUDGET_MS),
  skillsDir,
  repoSkillsDir: skillsDir,
  markerFile: join(skillsDir, ".mattpocock-skills.json"),
  extraFiles: { ".gitignore": "*\n" },
}).catch((error) => `Matt Pocock's skills: not installed, because of an unexpected error: ${error?.message ?? error}.`);
if (line) console.log(line);
