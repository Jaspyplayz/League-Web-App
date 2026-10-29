# 0015: Cloud sessions get Matt Pocock's skills at the commit Anthropic's marketplace pins

Status: draft, waiting on Jasper's "In my words" (Linear JAS-37). It follows [0014](0014-pstack-lives-in-the-repo.md), which copied pstack into the repo for the same reason, and leaves 0014 as it was written.

## Context

Matt Pocock's skills (`grilling`, `to-tickets`, `domain-modeling` and more, MIT license, from [github.com/mattpocock/skills](https://github.com/mattpocock/skills)) reach Jasper's PC as the plugin `mattpocock-skills@claude-plugins-official`. That plugin comes from Anthropic's official marketplace, which has auto-update on by default, so the local copy follows whatever commit Anthropic's marketplace file pins. On 2026-10-29 that file, `.claude-plugin/marketplace.json` in `anthropics/claude-plugins-official`, pinned commit `49dd158` (version 1.3.1).

Cloud sessions don't install plugins, so cloud builders had none of these skills. Jasper wanted them in the cloud, kept up to date the way the local plugin is, and chose "Anthropic's version": the commit the marketplace pins, not the newest commit on GitHub.

Three facts shaped how:

- **Only one GitHub host works.** The cloud docs ([cloud-environments](https://code.claude.com/docs/en/cloud-environments), "GitHub proxy") say a cloud session's GitHub proxy answers 403 for archive downloads (`codeload.github.com`) and API calls on any repo the session didn't clone, even a public one. Files from public repos come through `raw.githubusercontent.com` instead, which serves one file per URL and has no folder listing.
- **Skills written at start show up a turn late.** Claude Code reads its skill list when a session starts and then watches the skill folders that existed then ([skills](https://code.claude.com/docs/en/skills), "Live change detection"). A folder created after start isn't watched until someone runs `/reload-skills`. On Jasper's PC, three fresh `claude -p` sessions in a scratch project with only this hook showed the order. In the first, the hook wrote 22 skills into `.claude/skills/`, but the first turn's skill list had none of them. In the second, after a tool call, a reminder added the 7 skills Claude may call itself and the Skill tool loaded `grilling` from `.claude/skills/grilling`. In the third, started after the folders were there, `grilling` was listed from the start and the hook said the commit was already installed. JAS-28's cloud check also saw repo skills reload without a restart.
- **The repo already has two of the names.** pstack's `tdd` and `teach` live in `.claude/skills/`, and Pocock's plugin has skills with the same names. Two skills with one name hide each other, and Jasper's rules want pstack's. His rules also use other skills for three of Pocock's jobs: pstack's `why` instead of `diagnosing-bugs`, the reviewer agent instead of `code-review`, and the PR template instead of `pr`.

## Options considered

1. **Copy Pocock's files into the repo**, as 0014 did for pstack. They'd load in every session, but they'd stop following the marketplace: each update would be a PR. The ticket put this out of scope.
2. **Download the newest commit on GitHub** at each cloud start. Always fresh, but a commit Anthropic hasn't reviewed and Jasper's PC isn't running yet could reach cloud builders first, and a bad push upstream would land in the next session.
3. **Download the commit Anthropic's marketplace pins** at each cloud start. Cloud and local sessions run the same commit, an update arrives when Anthropic moves the pin, and nothing is committed.

For where the skills go:

- **`~/.claude/skills/`**, the ticket's first choice, keeps the repo untouched. It works only if that folder already exists when a cloud session starts, since a folder the hook creates isn't watched.
- **The repo's `.claude/skills/`**, which always exists at start because it's committed, so Claude Code always watches it. The installed folders must then be hidden from git so none is ever committed.

## Decision

Option 3, installed into the repo's `.claude/skills/`, with a new SessionStart hook, [`pocock-skills.mjs`](../../.claude/hooks/pocock-skills.mjs). It's separate from `cloud-setup.mjs` and `pstack-context.mjs`.

- **Cloud only.** The hook does nothing unless `CLAUDE_CODE_REMOTE` is `true`, which Claude Code sets only in the cloud. Locally the plugin already provides the skills.
- **Which commit.** It reads Anthropic's marketplace file and takes the `mattpocock-skills` entry's source. It goes on only if the URL is exactly `https://github.com/mattpocock/skills.git` and the `sha` is a full 40-character commit ID. Every download names that commit in its URL, so a branch is never read.
- **Which skills.** It installs the skill folders that commit's `.claude-plugin/plugin.json` lists, which is the set the plugin loads: 27 at `49dd158`. The repo's `in-progress`, `misc` and `deprecated` folders aren't part of the plugin, so they aren't installed either.
- **The skip list, in one place.** `SKIPPED_BY_RULE` in [`pocock-skills-steps.mjs`](../../.claude/hooks/pocock-skills-steps.mjs) holds `diagnosing-bugs`, `code-review` and `pr`. Any name that's already a folder in `.claude/skills/` and wasn't written by this hook is skipped too, which today means `tdd` and `teach`. That leaves 22 at `49dd158`.
- **How it downloads.** With no folder listing, it starts at each skill's `SKILL.md` and follows its relative Markdown links, and the links in the Markdown files those lead to. Links that leave the skill's folder are ignored. At `49dd158` that fetched 39 files, byte for byte the same as the commit's archive, in 45 requests and about a second. The only files it misses are the 22 `agents/openai.yaml` files, which are settings for OpenAI's Codex, not Claude. It uses `curl`, which follows the cloud machine's proxy settings.
- **Hidden from git.** Each installed folder gets a `.gitignore` containing `*`, which makes git ignore the folder and everything in it. The repo's `.gitignore` covers the marker file. A test installs into a real git repo and checks that `git status` stays empty.
- **A marker.** `.claude/skills/.mattpocock-skills.json` records the installed commit and the folders the hook wrote. When the pinned commit hasn't changed, a resumed session, or a new one on the same machine, makes one request and downloads nothing. When it has changed, the hook replaces only its own folders.
- **It never stops a session.** Any failure, such as no network, a changed marketplace format, a bad sha or a slow download past 90 seconds, prints one line saying why and exits 0. Everything is downloaded before anything is written, so a failure installs nothing and leaves an earlier commit's skills in place.

## Consequences

- A cloud session that starts on a fresh machine gets the skills one turn late. They aren't in its first turn's skill list, and they arrive in a reminder after its first tool call, which is about when a builder starts working. A resumed session, or a second one on the same machine, has them from the start.
- Claude can start 7 of the 22 by itself: `codebase-design`, `domain-modeling`, `grilling`, `prototype`, `research`, `wizard` and `writing-for-agents`. The other 15, such as `to-tickets`, say `disable-model-invocation: true`, so only a person typing the slash command runs them. That's the same on Jasper's PC.
- Each new cloud machine downloads about 45 small files from `raw.githubusercontent.com` at start. That host is on the cloud's default network list. If Anthropic's marketplace or GitHub is down, the session starts without the skills and says so in one line.
- Cloud sessions trust Anthropic's marketplace and Pocock's repo as much as Jasper's PC already does through the plugin. The URL and full-sha checks mean a changed entry is refused rather than followed.
- If Pocock adds a skill whose name matches one of the repo's, the repo's wins and the hook says it skipped it. If Jasper's rules drop or add an excluded skill, `SKIPPED_BY_RULE` is the one line to change.
- A skill that relies on a file it never links to would arrive without that file. At `49dd158` none does.
- `.claude/skills/` in a cloud checkout holds 22 more folders than git shows. They come from Pocock's repo, not the repo's own history.

## In my words

_(Jasper writes this.)_
