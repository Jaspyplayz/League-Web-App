# Saved GitHub REST answers for can-merge's tests

`scripts/can-merge-rest.test.ts` reads these instead of calling GitHub. Each is a real `gh api` answer saved on 2026-10-29, cut down to the fields `scripts/can-merge-rest.ts` reads plus a few that make it easy to recognise (ids, `head_sha`, `completed_at`, `display_title`).

| File | Request | What it covers |
|---|---|---|
| `pull-195.json` | `GET repos/Jaspyplayz/League-Web-App/pulls/195` | A merged Claude PR. The description is cut to its first three lines |
| `pull-188-dependabot.json` | `GET repos/Jaspyplayz/League-Web-App/pulls/188` | A bot author. The description is cut to its first line |
| `pull-cli-14783-draft.json` | `GET repos/cli/cli/pulls/14783` | A draft (also from a fork). This repo has never had a draft, so it comes from GitHub's own `cli/cli`. The description is set to null |
| `pull-cli-14689-fork.json` | `GET repos/cli/cli/pulls/14689` | A PR from a fork that isn't a draft. The description is set to null |
| `check-runs-195.json` | `GET .../commits/a18e2fc.../check-runs?filter=all&per_page=100` | Check runs: every run of every check at #195's head, re-runs included |
| `workflow-runs-195.json` | `GET .../actions/runs?head_sha=a18e2fc...&per_page=100` | The workflow runs those check runs belong to, matched by `check_suite_id` |
| `status-195.json` | `GET .../commits/a18e2fc.../status?per_page=100` | A commit status: Vercel's deployment check |
