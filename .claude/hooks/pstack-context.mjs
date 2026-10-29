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
// some of its skills. Copied into the repo they have no `pstack:` prefix, so one
// line after the text says how the names map.
//
// Like the plugin's hook, it prints nothing when the pstack-models.md sheet has
// the line `session hook: off`, so that switch still works in this project.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NAMES_NOTE =
  "In this repo pstack is copied into `.claude/skills/` and `.claude/agents/`, so its skills and agents have no `pstack:` prefix: `pstack:poteto-mode` is the `poteto-mode` skill, `pstack:interrogate` is `interrogate`, and `pstack:poteto-agent` is the `poteto-agent` agent.";

// Read the sheet the way the plugin's hook does: Windows PowerShell may save it
// as UTF-16 (it starts with the bytes FF FE), other editors add a byte-order
// mark or Windows line endings, and a sheet that can't be read counts as none.
function sessionHookOff() {
  const sheet = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "pstack-models.md");
  try {
    const bytes = readFileSync(sheet);
    const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
    const text = bytes.toString(utf16 ? "utf16le" : "utf8").replace(/^﻿/, "");
    return text.split(/\r?\n/).includes("session hook: off");
  } catch {
    return false;
  }
}

if (!sessionHookOff()) {
  const context = readFileSync(new URL("./pstack-session-start-context.md", import.meta.url), "utf8");
  process.stdout.write(`${context}\n${NAMES_NOTE}\n`);
}
