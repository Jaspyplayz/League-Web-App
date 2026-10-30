# 0018: Drop the explain-back quiz

Status: accepted (Jasper, 2026-10-30).

## Context

Since PR 133, risky PRs waited for Jasper to run `/explain-back`, a three-question quiz on the PR, before he merged them. "My read", the written summary that went with it, was already dropped from the PR template in PR 201. Jasper asked on 2026-10-30 to remove the quiz too.

## Decision

The `explain-back` skill is deleted, and the workflow no longer names a quiz before a risky merge. Risky PRs are still Jasper's to merge, after the same checks, reviewer agent, `interrogate` panel and his own test of the preview.

## Consequences

- One step less before a risky PR merges. Jasper decides for himself how well he needs to know a PR before merging it.
- Older records (`docs/STATUS.md`, decision records 0012 and 0014, `docs/agent-mistakes/`) still mention the quiz and stay as written, since they describe the past.
