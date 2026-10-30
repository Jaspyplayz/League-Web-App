# Tier line names a second tier word

`npm run can-merge` reads a PR's **Tier:** line and refuses one that names more than one of tiny, normal and risky anywhere on it, even inside a file name in backticks, so a reason that mentions "the risky list" blocks the merge.

## 2026-10-30

- **What happened:** Claude wrote PR 211's Tier line as "normal: docs plus a new test, nothing on the risky list", then reworded it to "none of its files is in `scripts/risky-paths.ts`". `can-merge` refused both, and passed only when the reason named no tier word at all.
- **Evidence:** `npm run can-merge -- 211 --merge`, twice: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 211](https://github.com/Jaspyplayz/League-Web-App/pull/211) merged after the third wording.
- **Root cause:** the PR template asks for "tiny, normal or risky, and why", and the natural why for a normal PR is that it's off the risky list. Nothing before the merge gate says which words the reason can't use, and the gate counts "risky" inside `risky-paths.ts` because a hyphen ends a word.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. If it repeats, Jaspyplayz/project-template already has a fix to copy: `readTier` in its `scripts/can-merge-gates.ts` drops anything in backticks before counting tier words, and its PR template's comment says which words to keep out of the reason. Both files are on the risky list here, so Jasper merges that change.
