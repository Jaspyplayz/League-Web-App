// Claude Code hook: give every session pstack's poteto-mode instruction when it
// starts, is resumed or cleared, or its context is compacted.
//
// pstack is copied into .claude/skills/ and .claude/agents/ (decision record
// 0014), because cloud sessions can't install plugins, and the plugin is
// switched off here so its skills don't load twice. That also switches off the
// plugin's own startup hook, so this one prints the same text instead:
// pstack-session-start-context.md is pstack's hooks/session-start-context.md,
// copied unchanged. Claude Code adds what a SessionStart hook prints to
// Claude's context (https://code.claude.com/docs/en/hooks).
//
// pstack's text names things the plugin way, `pstack:poteto-mode`, and so do
// some of its skills. poteto-mode even says the bare agent name errors, which is
// true only for the plugin: here `pstack:poteto-agent` is the one Claude Code
// can't find. Its poteto-agent also looks for poteto-mode in the plugin cache,
// which a cloud session doesn't have. pstack's files stay unchanged, so a note
// after the text overrides both, with the path a poteto-agent should read.
//
// Like the plugin's hook, it prints nothing when the pstack-models.md sheet has
// the line `session hook: off`, so that switch still works in this project.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const namesNote = (potetoModePath) =>
  [
    "pstack in this repo: its skills and agents are copied into `.claude/skills/` and `.claude/agents/`, so they have no `pstack:` prefix. `pstack:poteto-mode` is the `poteto-mode` skill, and `pstack:how`, `pstack:why`, `pstack:tdd`, `pstack:architect`, `pstack:arena` and `pstack:interrogate` are `how`, `why`, `tdd`, `architect`, `arena` and `interrogate`.",
    "This overrides pstack's own files: poteto-mode's Subagents section says the bare name `poteto-agent` errors, but here the `pstack:` agent names are the ones that don't exist. As `subagent_type`, use `poteto-agent`, `comment-sicko`, `thermo-nuclear-review-subagent` and `thermo-nuclear-code-quality-review-subagent`.",
    `When you start a \`poteto-agent\`, give it this path to poteto-mode's SKILL.md, because without one it searches the plugin cache: ${potetoModePath}`,
    "Where a pstack skill says to run a script from the installed plugin, run it from `.claude/skills/` instead.",
  ].join("\n");

// Read the sheet the way the plugin's hook does: Windows PowerShell may save it
// as UTF-16 (it starts with the bytes FF FE), other editors add a byte-order
// mark or Windows line endings, and a sheet that can't be read counts as none.
function sessionHookOff() {
  const sheet = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "pstack-models.md");
  try {
    const bytes = readFileSync(sheet);
    const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
    const text = bytes.toString(utf16 ? "utf16le" : "utf8").replace(/^\uFEFF/, "");
    return text.split(/\r?\n/).includes("session hook: off");
  } catch {
    return false;
  }
}

if (!sessionHookOff()) {
  const context = readFileSync(new URL("./pstack-session-start-context.md", import.meta.url), "utf8");
  process.stdout.write(`${context}\n${namesNote(join(root, ".claude", "skills", "poteto-mode", "SKILL.md"))}\n`);
}
