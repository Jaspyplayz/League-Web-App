# 0015: Cloud sessions get Matt Pocock's skills at the commit Anthropic's marketplace pins

Status: draft, waiting on Jasper's "In my words" (Linear JAS-37). It follows [0014](0014-pstack-lives-in-the-repo.md), which copied pstack into the repo for the same reason, and leaves 0014 as it was written.

## Context

Matt Pocock's skills (`grilling`, `to-tickets`, `domain-modeling` and more, MIT license, from [github.com/mattpocock/skills](https://github.com/mattpocock/skills)) reach Jasper's PC as the plugin `mattpocock-skills@claude-plugins-official`. That plugin comes from Anthropic's official marketplace, which has auto-update on by default, so the local copy follows whatever commit Anthropic's marketplace file pins. On 2026-10-29 that file, `.claude-plugin/marketplace.json` in `anthropics/claude-plugins-official`, pinned commit `49dd158` (version 1.3.1).

Cloud sessions don't install plugins, so cloud builders had none of these skills. Jasper wanted them in the cloud, kept up to date the way the local plugin is, and chose "Anthropic's version": the commit the marketplace pins, not the newest commit on GitHub.

A cloud session on 2026-10-29 checked what a cloud machine allows. These facts shaped the design:

- **Archive downloads are blocked, but git and raw files work.** The cloud's GitHub proxy answered 403 for `codeload.github.com` ("GitHub access to this repository is not enabled for this session") and for API calls on a repo the session didn't clone, as the [cloud docs](https://code.claude.com/docs/en/cloud-environments) say. `raw.githubusercontent.com` answered 200 for the marketplace file and for Pocock's `plugin.json`, and `git fetch --depth 1 https://github.com/mattpocock/skills.git 49dd158…` fetched the commit ("`* branch 49dd158… -> FETCH_HEAD`").
- **`~/.claude/skills/` exists when a cloud session starts.** The cloud keeps two folders there, `session-start-hook` and `synced`. Claude Code reads its skill list at start and then watches the skill folders that existed then ([skills](https://code.claude.com/docs/en/skills), "Live change detection"). In that cloud session, a skill written into `~/.claude/skills/` and one written into the repo's `.claude/skills/` both loaded about 15 seconds later, without a restart.
- **Skills written at start show up a turn late.** On Jasper's PC, three fresh `claude -p` sessions in a scratch project with only an earlier version of this hook showed the order. In the first, the hook wrote 22 skills, but the first turn's skill list had none of them. In the second, after a tool call, a reminder added the 7 skills Claude may call itself and the Skill tool loaded `grilling`. In the third, started after the folders were there, `grilling` was listed from the start and the hook said the commit was already installed.
- **The repo already has two of the names.** pstack's `tdd` and `teach` live in `.claude/skills/`, and Pocock's plugin has skills with the same names. A personal skill in `~/.claude/skills/` beats a project skill of the same name, and Jasper's rules want pstack's. His rules also use other skills for three of Pocock's jobs: pstack's `why` instead of `diagnosing-bugs`, the reviewer agent instead of `code-review`, and the PR template instead of `pr`.

## Options considered

1. **Copy Pocock's files into the repo**, as 0014 did for pstack. They'd load in every session, but they'd stop following the marketplace: each update would be a PR. The ticket put this out of scope.
2. **Download the newest commit on GitHub** at each cloud start. Always fresh, but a commit Anthropic hasn't reviewed and Jasper's PC isn't running yet could reach cloud builders first, and a bad push upstream would land in the next session.
3. **Download the commit Anthropic's marketplace pins** at each cloud start. Cloud and local sessions run the same commit, an update arrives when Anthropic moves the pin, and nothing is committed.

For where the skills go:

- **`~/.claude/skills/`**, the ticket's first choice. It exists at start, so Claude Code watches it, and the repo stays untouched.
- **The repo's `.claude/skills/`**, which also reloads. The first version of this PR used it, but then 22 folders sit in a git checkout and must be hidden from git, and the hook's tests had to run against the repo's real skill folder. The reviewer agent and the interrogate panel both flagged that.

For how to download:

- **`raw.githubusercontent.com`, one file per URL.** It has no folder listing, so the first version found each skill's files by following the links in its Markdown. That missed the files no Markdown links to.
- **`git fetch` of the one commit.** It gets every file in the commit, and git checks the commit ID itself.

## Decision

Option 3, installed into `~/.claude/skills/` with `git fetch`, by a new SessionStart hook, [`pocock-skills.mjs`](../../.claude/hooks/pocock-skills.mjs). It's separate from `cloud-setup.mjs` and `pstack-context.mjs`.

- **Cloud only.** The hook does nothing unless `CLAUDE_CODE_REMOTE` is `true`, which Claude Code sets only in the cloud. Locally the plugin already provides the skills.
- **Which commit.** It reads Anthropic's marketplace file and takes the `mattpocock-skills` entry's source. It goes on only if the URL is exactly `https://github.com/mattpocock/skills.git` and the `sha` is a full 40-character commit ID.
- **How it downloads.** In a new temporary folder it runs `git init`, `git fetch --depth 1 <url> <sha>` and `git checkout FETCH_HEAD`, then checks that `HEAD` is that exact commit. It fetches by commit ID, never by branch name, and gets only that commit, not its history.
- **Which skills.** It installs the skill folders that commit's `.claude-plugin/plugin.json` lists, which is the set the plugin loads: 27 at `49dd158`. The repo's `in-progress`, `misc` and `deprecated` folders aren't part of the plugin, so they aren't installed either. It copies regular files only, so a symbolic link in Pocock's repo can't point outside the skill.
- **The skip list, in one place.** `SKIPPED_BY_RULE` in [`pocock-skills-steps.mjs`](../../.claude/hooks/pocock-skills-steps.mjs) holds `diagnosing-bugs`, `code-review` and `pr`. Any name that's already a folder in the repo's `.claude/skills/`, or a folder in `~/.claude/skills/` the hook didn't write, is skipped too. Today that means `tdd` and `teach`, and it protects the cloud's own `session-start-hook` and `synced`. That leaves 22 at `49dd158`.
- **Its own folders only.** Each folder it writes holds a file named `.mattpocock-skills` with the commit in it. The hook replaces or removes only folders that hold that file, and never wipes `~/.claude/skills/`.
- **A marker.** `~/.claude/mattpocock-skills.json` records the installed commit and skill names. When the pinned commit hasn't changed and each listed folder is still there, a resumed session, or a new one on the same machine, makes one request and downloads nothing. Anything odd in the marker means "download again".
- **No half-written skills.** It writes every new folder into a staging folder beside `~/.claude/skills/` first, then moves each one in with a rename, so Claude Code's file watcher never sees part of a skill.
- **It never stops a session.** Any failure, such as no network, a changed marketplace format, a bad sha or a timeout, prints one line saying why and exits 0. curl gets at most 35 seconds and the git steps 60, inside the hook's 120-second limit. Everything is downloaded and read before anything is written, so a download failure leaves an earlier commit's skills in place.

## Consequences

- A cloud session that starts on a fresh machine gets the skills one turn late. They aren't in its first turn's skill list, and they arrive in a reminder after its first tool call, which is about when a builder starts working. A resumed session, or a second one on the same machine, has them from the start.
- Claude can start 7 of the 22 by itself: `codebase-design`, `domain-modeling`, `grilling`, `prototype`, `research`, `wizard` and `writing-for-agents`. The other 15, such as `to-tickets`, say `disable-model-invocation: true`, so only a person typing the slash command runs them. That's the same on Jasper's PC.
- On Jasper's PC, with the real network, the hook installed the 22 skills (61 files) in about 0.7 seconds, and the second run said "already installed" in about 0.1 seconds. The cloud's timing isn't measured yet.
- Cloud sessions trust Anthropic's marketplace and Pocock's repo as much as Jasper's PC already does through the plugin. The URL and full-sha checks mean a changed entry is refused rather than followed. GitHub can also serve a commit that exists only in a fork of the repo when asked by its ID, so the check that matters is that Anthropic's entry names it, the same trust the plugin relies on.
- If Pocock adds a skill whose name matches one of the repo's, the repo's wins and the hook says it skipped it. If Jasper's rules drop or add an excluded skill, `SKIPPED_BY_RULE` is the one line to change.
- If writing stops halfway, for example on a full disk, some skills may be missing. The hook says so, and the next session start tries again.
- Nothing about the skills is in the repo or in git. `~/.claude/` on the cloud machine holds them and the marker.

## In my words

_(Jasper writes this.)_
