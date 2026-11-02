# A workflow's secrets reached by a file Claude can merge

A workflow holds secrets, and its guards look only at its own file. Another file that Claude can merge after the panel reaches the secrets anyway, because the job loads it, or because GitHub lets any workflow on main ask for the place the secrets live.

## 2026-11-02

- **What happened:** the queue job in `.github/workflows/run-queue.yml` installed and ran the repo's code with the Linear key and the task token beside it, while decision record 0032 let Claude merge `package.json`, `.npmrc` and `tsconfig.json` after the panel. A merged config file could run code beside both secrets. The job should have had Agent merge's guards once those files left Jasper's list.
- **Evidence:** the reviewer's blocker on [PR 296](https://github.com/Jaspyplayz/League-Web-App/pull/296) at 0ef346e: "a config file Claude can now merge could run code beside both secrets". It ran an `.npmrc` and a `tsconfig.json` swap with fake values, and each read them.
- **Root cause:** the builder read main's copy of those files as safe, which held while they were Jasper's. Decision record 0032 moved them to the panel list and guarded Agent merge, and nothing tied the queue job to those guards.
- **Rung:** check
- **Fix:** commit 5308f5d gives the job the guards. Test `refuses the files that would change what the queue loads, with Agent merge's own check` in `scripts/run-queue-rest.test.ts` pins them. With the guard step's name removed it fails ("expected -1 to be greater than -1", 1 failed), and on the fix it passes.

## 2026-11-02

- **What happened:** with the queue's own workflow and scripts on Jasper's list, any other workflow could still ask for the secrets' environment. A PR adding `.github/workflows/notify.yml` with `environment: run-queue` and `${{ secrets.LINEAR_API_KEY }}` passed `jaspersFiles`, and every test still passed. Claude could merge it after the panel, and on main it would read the key, because the environment's only rule is the main branch policy.
- **Evidence:** finding 1 of a review of [PR 296](https://github.com/Jaspyplayz/League-Web-App/pull/296) on 2026-11-02. Reproduced with that real file, which the new test refuses: `".github/workflows/notify.yml asks for a deployment environment"`.
- **Root cause:** the builder read "only main can use it" as keeping the secrets safe, and the first fix guarded only the queue's own files. An environment's branch policy limits which branch a run comes from, not which workflow asks, and no test read the other workflows.
- **Rung:** check
- **Fix:** commit 6a9494b. Test `lets only workflows on Jasper's list ask for a deployment environment or name the queue's secrets` in `scripts/risky-paths.test.ts` fails on any workflow off his list that says `environment`, quoted or not, or names either secret. With a real `.github/workflows/notify.yml` it fails (1 failed), with the key quoted and not, and without that file it passes.
