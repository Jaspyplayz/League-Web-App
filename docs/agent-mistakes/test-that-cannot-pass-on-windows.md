# A test that can't pass on Windows

A test that does something Windows can't, such as making a file whose name has a tab in it, passes in CI's Linux checkout and fails on every run on Jasper's PC. A suite that's always red there teaches agents to read past "1 failed", which hides the next real failure.

## 2026-11-01

- **What happened:** `scripts/can-merge-files.test.ts:78` wrote `src/tab\tname.ts` to disk and `:76` made a file runnable with `chmodSync`, neither of which Windows can do. Every local `npm test` in the 2026-10-31 session reported `Test Files 1 failed`, and each time the agent noted it and carried on.
- **Evidence:** `npx vitest run scripts/can-merge-files.test.ts` on Windows at 75fdaf0: `ENOENT: no such file or directory, open '...\src\tab	name.ts'`, `1 failed`. With the file staged through git's index but the `chmodSync` left in, `expected undefined to deeply equal { added: +0, deleted: +0 }` for `scripts/run.sh`.
- **Root cause:** the test was written and run on Linux, where both work, and CI runs only on Linux, so nothing that gates a PR runs it on Windows.
- **Rung:** none yet
- **Fix:** JAS-130 builds both changes in git's index (`git update-index --cacheinfo` and `--chmod=+x`), so the same test passes on Windows; none yet for the class, as a first occurrence. On a repeat, the check is a CI job on `windows-latest`.
