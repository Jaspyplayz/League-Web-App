# 0017: Fewer reviewer runs per PR

Status: draft until its PR merges. It replaces [0011](0011-shorter-re-reviews.md)'s conditions for a re-review, changes [0010](0010-github-requires-the-reviewer.md) so the required check can read a verdict on an earlier commit, and changes [0012](0012-claude-only-workflow.md)'s choice of Fable for the reviewer. Agreed with Jasper in a grilling session on 2026-10-30.

## Context

Jasper felt the reviewer agent slowed every PR down. PRs 200 to 219 show why. The PRs Claude merged took 10 to 40 minutes from open to merge, but most ran the reviewer 3 to 5 times. PR 202 ran it 5 times to add one table to `docs/workflow.md`. Every new commit cancelled the last verdict, so fixing a should-fix, correcting a test count or adding a postmortem entry each needed another review, and often another postmortem entry after it.

The first review earns its cost. It found a test that would fail on Windows (PR 211) and a missing test (PR 218). Many later blockers were paperwork, such as a Merge Danger label or a wrong test count.

Fable credits also ran out on 2026-10-30, and Jasper said not to use Fable.

## Options considered

1. Keep the rules and make each run cheaper (a smaller model, a shorter checklist). Runs per PR stay at 3 to 5.
2. Let a no-blockers verdict carry over to small later commits, so only a blocker fix needs another review.
3. Let the builder decide when a fix is small enough to skip review. The builder would judge its own work, which is what the reviewer is there to avoid.
4. Skip the reviewer on every tiny PR, whatever its size. A builder could call a real feature tiny.

## Decision

Option 2, with a size limit on tiny PRs from option 4:
- **Tiny PRs** with no verdict skip the reviewer when they change at most 30 lines outside docs, and no rule file (`docs/workflow.md`, `docs/agents/`, any `CLAUDE` or `AGENTS` file, anything in a dot folder) and no risky path. A binary file outside docs counts as more than the limit. Past that, a tiny PR needs the reviewer like a normal one, and a verdict in its Review section always decides, so a tiny PR can't skip past blockers.
- **A carried-over verdict:** the `reviewer` check and `can-merge` read the newest verdict the Review section names, on the head commit or an earlier commit the PR added (never a main commit). If it says no blockers, it still counts after commits that change at most 40 lines outside docs. A test file added since the verdict is free, but a change to an existing test counts, so a test can't be weakened unseen. Only files the PR changes now or changed at the verdict count, so main's changes to other files, merged in, don't; main's changes to those same files do, which can ask for a review nobody needed. Any change to a rule file or a risky path after the verdict, even a mode change, needs a new review, and so does a blockers verdict on a commit a force push dropped, unless a clean review of the head follows it.
- **Re-reviews** only follow a review with blockers. They read the new commits and judge each answer, instead of 0011's five conditions.
- **The reviewer** checks what breaks for players, missing tests, security and claims to players. Paperwork is a nit at most. A one-way door on a tiny or normal PR is still a blocker, since it changes who merges, until JAS-69's gate checks it.
- **Models:** the reviewer runs on Opus 5.5, and the `interrogate` panel leaves out Fable. That is Jasper's `pstack-models.md` sheet on his PC and a line in the cloud startup note; nothing enforces it beyond those.
- **The PR template** asks whether each command passed, not how many tests passed.

## Consequences

Good:
- Most PRs should need one or two reviewer runs instead of 3 to 5. That's an estimate from PRs 200 to 219, not measured yet.
- Small tiny PRs merge on CI, the smoke test and the accessibility scan alone.
- Fewer paperwork blockers means fewer postmortem entries about paperwork.

Bad:
- Up to 40 lines of fixes after a review can merge without a second look. CI, the golden tests and the smoke test still run on every commit, and a fix to a rule file or risky path still gets reviewed.
- A tiny PR of up to 30 lines merges with no reviewer. A wrong tier on a risky path still fails, because a risky path always needs the reviewer and Jasper merges it.
- The reviewer and the builder now run on the same model, so the first review is less independent than one from a different model.
