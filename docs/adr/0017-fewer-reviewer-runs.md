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
- **Tiny PRs** skip the reviewer when they change at most 30 lines outside docs, and no rule file (`docs/workflow.md`, any `CLAUDE` or `AGENTS` file, anything in a dot folder) and no risky path. Past that, a tiny PR needs the reviewer like a normal one.
- **A carried-over verdict:** the `reviewer` check and `can-merge` read the newest verdict the Review section names, on the head commit or one before it. If it says no blockers, it still counts after commits that change at most 40 lines outside docs and tests, counting only the PR's own files so merging main in doesn't count. A change to a rule file after the verdict always needs a new review.
- **Re-reviews** only follow a review with blockers. They read the new commits and judge each answer, instead of 0011's five conditions.
- **The reviewer** checks what breaks for players, missing tests, security and claims to players. Paperwork is a nit at most. A one-way door on a tiny or normal PR is still a blocker, since it changes who merges, until JAS-69's gate checks it.
- **Models:** the reviewer runs on Opus 5.5, and the `interrogate` panel leaves out Fable.
- **The PR template** asks whether each command passed, not how many tests passed.

## Consequences

Good:
- Most PRs should need one or two reviewer runs instead of 3 to 5. That's an estimate from PRs 200 to 219, not measured yet.
- Small tiny PRs merge on CI, the smoke test and the accessibility scan alone.
- Fewer paperwork blockers means fewer postmortem entries about paperwork.

Bad:
- Up to 40 lines of fixes after a review can merge without a second look. CI, the golden tests and the smoke test still run on every commit, and risky PRs still wait for Jasper.
- A tiny PR of up to 30 lines merges with no reviewer. A wrong tier on a risky path still fails, because a risky path always needs the reviewer and Jasper merges it.
- The reviewer and the builder now run on the same model, so the first review is less independent than one from a different model.
