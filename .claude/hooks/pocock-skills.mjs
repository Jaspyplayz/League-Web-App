// Claude Code hook: give a cloud session Matt Pocock's skills, at the commit
// Anthropic's official marketplace pins for `mattpocock-skills`.
//
// On Jasper's PC the plugin `mattpocock-skills@claude-plugins-official`
// provides them and updates itself, but cloud sessions don't install plugins
// (https://code.claude.com/docs/en/cloud-environments). So in the cloud this
// hook reads the plugin's entry in Anthropic's marketplace, fetches that one
// commit with git, and copies in the skills its plugin.json lists, the same
// set the plugin loads. When the marketplace moves the plugin to a new commit,
// the next cloud session gets it. Locally it does nothing: Claude Code sets
// CLAUDE_CODE_REMOTE to "true" only in the cloud
// (https://code.claude.com/docs/en/hooks).
//
// The skills go in ~/.claude/skills/, beside the folders the cloud already
// keeps there, so nothing in the repo changes. Claude Code reads its skill
// list before this hook finishes and picks the new ones up from that folder
// during the session. Decision record 0015 has the evidence, and why it's the
// pinned commit and not the newest one.
//
// A failure never stops the session: the hook prints one line saying why
// nothing was installed, and exits 0. Claude Code adds that line to Claude's
// context.

import { homedir } from "node:os";
import { join } from "node:path";
import { curlGet, fetchCommit, installPocockSkills } from "./pocock-skills-steps.mjs";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

const line = await installPocockSkills(process.env, {
  get: curlGet,
  fetchCommit,
  skillsDir: join(config, "skills"),
  repoSkillsDir: join(root, ".claude", "skills"),
  markerFile: join(config, "mattpocock-skills.json"),
});
if (line) console.log(line);
