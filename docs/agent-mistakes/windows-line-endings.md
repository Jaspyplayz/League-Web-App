# Text read as if it had Unix line endings

Git on Jasper's PC checks text files out with Windows line endings (`core.autocrlf` is on, and the repo has no `.gitattributes`), while CI's Linux checkout keeps Unix ones. Code that splits on `\n` or anchors a pattern with `$` can pass in CI and in a fresh worktree, then fail on Jasper's PC.

## 2026-10-29

- **What happened:** the first version of `scripts/agent-mistakes.test.ts` split class files on `\n` and matched each line to `$`, so a file with Windows line endings read as an entry with no lines. It passed in the builder's worktree, where the new files still had Unix endings.
- **Evidence:** the reviewer on [PR 211](https://github.com/Jaspyplayz/League-Web-App/pull/211), at 5e76ce8, in a clone made with `core.autocrlf=true`: "entry 2026-10-29 has the lines none, not What happened, Evidence, Root cause, Rung, Fix", `Tests 1 failed | 1287 passed`.
- **Root cause:** the builder ran the test only on files it had just written, which Git hadn't rewritten yet, and CI runs on Linux, so neither run could see Windows line endings.
- **Rung:** check
- **Fix:** [PR 211](https://github.com/Jaspyplayz/League-Web-App/pull/211): the test reads both endings the same, and its tests `reads a file with Windows line endings the same` fail if it stops. That covers this file only; on a repeat elsewhere, the design fix is a `.gitattributes` that makes every checkout use one ending.
