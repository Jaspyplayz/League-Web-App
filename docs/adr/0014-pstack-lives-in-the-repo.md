# 0014: pstack lives in the repo, pinned to 0.9.102, with the plugin off for Turnpoint

Status: draft, waiting on Jasper's "In my words" (Linear JAS-28). It follows [0012](0012-claude-only-workflow.md), which made cloud sessions builders, and leaves 0012 as it was written.

## Context

pstack is a set of skills and agents for Claude Code: `poteto-mode` reads a task and picks a playbook, and the playbooks call skills such as `how` (map the code), `architect` (compare designs) and `interrogate` (the review panel risky PRs need). Builders on Jasper's PC get it as a Claude Code plugin, the Claude Code port `michael-denyer/pstack-claude`, by Lauren Tan and Michael Denyer, MIT license. A plugin is installed per computer, not per repo, and cloud sessions can't install plugins. So a cloud builder got none of pstack: only `docs/workflow.md`'s description of the playbooks, and no `interrogate`.

The plugin does two jobs. It adds the skills and agents, and its startup hook adds a short instruction, `hooks/session-start-context.md`, that tells Claude when to use `poteto-mode`. Skills a project keeps in `.claude/skills/` and agents in `.claude/agents/` load in every session of that project, cloud included, the way `explain-back` and `verify` already do.

## Options considered

1. **Keep the plugin only.** Nothing to build, but cloud builders work differently from local ones, and a risky PR built in the cloud can't get its `interrogate` panel there.
2. **Copy only `interrogate`**, the old plan. The ticket counted `poteto-mode` pointing to 50 of pstack's other 64 skills, so a partial copy leaves most of its routes leading nowhere.
3. **Copy all of pstack into the repo and keep the plugin on.** Each pstack skill would then load twice, once as `pstack:how` from the plugin and once as `how` from the repo. A fresh local session with the plugin forced on listed 212 skills instead of 147, with all 65 pstack skills under both names.
4. **Copy all of pstack, pin the version, and switch the plugin off for this project.** One copy everywhere. Updates become a PR instead of a command.

## Decision

Option 4.

- All 65 skills from pstack 0.9.102 are copied unchanged into `.claude/skills/`, and its 4 agents (`poteto-agent`, `comment-sicko`, `thermo-nuclear-review-subagent` and `thermo-nuclear-code-quality-review-subagent`) into `.claude/agents/`, from the plugin installed on Jasper's PC. That plugin came from pstack-claude's commit `356c6e0`. No copied name matches one of the repo's own skills or the `reviewer` agent.
- Git stores the copies with the same bytes and file modes as that commit's `plugins/pstack/skills/` and `plugins/pstack/agents/`. The installed plugin has Windows line endings, because Git converted them when it checked pstack out on Jasper's PC, and Git converts them back when it stores a file. Seven of pstack's scripts are marked as programs that can run, as they are in pstack's repo. `.claude/skills/pstack-manifest.txt` lists each copied file with its mode and Git hash from that commit, and `pstack-manifest.test.mjs` beside it fails when one is edited, missing or has another mode, or when a pstack skill folder holds a file pstack didn't ship. So "unchanged" is a check `npm test` runs, not only a rule written down.
- `.claude/settings.json` sets `"pstack@pstack-claude": false` under `enabledPlugins`. Project settings win over the user settings that switch the plugin on, so the plugin stays on in Jasper's other projects.
- Switching the plugin off also switches off its startup hook. The repo's own hook, `.claude/hooks/pstack-context.mjs`, prints the same text instead, copied unchanged as `.claude/hooks/pstack-session-start-context.md`, on the same events: start, resume, `/clear` and compaction. Like the plugin's hook, it prints nothing when `~/.claude/pstack-models.md` has the line `session hook: off`.
- pstack's text and 12 of its files name things the plugin way, such as `pstack:poteto-mode` and `pstack:poteto-agent`. Copied into a project, they have no `pstack:` prefix, and poteto-mode's Subagents section even says the bare name `poteto-agent` errors. In a fresh session here the opposite held: `pstack:poteto-agent` gave `Agent type 'pstack:poteto-agent' not found`, and `poteto-agent` worked. The files stay unchanged, so the hook adds a note after pstack's text that says it overrides them and lists the four agent names to use.
- `agents/poteto-agent.md` finds poteto-mode by searching the plugin cache unless its parent gives it a path. A cloud session has no cache, and on Jasper's PC the cache holds the switched-off plugin, which can be a newer version. So the note gives the path to the repo's `poteto-mode/SKILL.md`, built from the project folder.
- poteto-mode's code, in `poteto-mode/scripts/`, runs on Bun, a different JavaScript runtime with its own test runner, and pstack's repo tests it. `eslint.config.mjs`, `tsconfig.json` and `vitest.config.mts` skip that folder, and no other. `reflect/scripts/` holds two `.mjs` files that pass all three checks, so it isn't skipped. Without the skip, lint fails on 3 rules in `orch.test.ts`, the type check on `bun:test` imports, and Vitest on 10 test files it can't load. The repo's own skill scripts in `verify-turnpoint/scripts/` are still checked.
- `~/.claude/pstack-models.md`, which sets the model for each pstack role, stays on Jasper's PC. A cloud session has no copy, so it uses each skill's built-in defaults.

## Consequences

- A fresh local session in this repo lists each of the 65 pstack skills once, as `how` and not `pstack:how`. `typescript-best-practices` appears once a `.ts` file is opened, because it loads only for those files. The 4 agents load from `.claude/agents/`. Whether a cloud session sees the same is JAS-28's cloud check, which Jasper runs.
- Updating pstack takes a PR: copy the newer version over the old one, write the manifest again, and update the notices row, as `docs/workflow.md` describes. The hook copies what pstack's own startup script does, so an update checks that script for changes too. Running `claude plugin update` changes Jasper's other projects but not this one, so the two can run different versions until someone copies the update in.
- The repo gains 183 files and about 1.4 MB, nearly all Markdown.
- Bun isn't installed on Jasper's PC, so poteto-mode's Bun scripts (`orch`, `watch-pr`, `bootstrap`) didn't run there with the plugin either. Whether they run in the cloud is part of the cloud check.
- If Claude follows pstack's `pstack:` names, its first try to start an agent fails. Claude Code's error lists the agents that exist, so it can recover, and the hook's note says up front which names work. The note reaches sessions that start with the hook. A subagent doesn't get startup hooks, so a subagent that starts its own agents has only the files' wording.
- Each session opened on the repo loads one copy. A session opened on the main checkout before this merged listed 148 skills at its start, none from the worktree that held this copy. But once a session works on files inside a worktree under `.claude/worktrees/`, Claude Code adds that worktree's skills as separate entries named after the folder, as it already does for the repo's own 13. With pstack that's 78 extra entries per worktree touched, so the auto-pull job removing merged worktrees matters more now. A session opened on the folder above the repo doesn't read the repo's settings, so it keeps the plugin on.
- Anyone reading `.claude/skills/` now sees 78 folders, 65 of them pstack's. The manifest lists pstack's files, and the notices file says where each folder came from.

## In my words

_(Jasper writes this.)_
