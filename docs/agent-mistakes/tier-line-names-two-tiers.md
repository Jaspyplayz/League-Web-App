# Tier line names a second tier word

Until JAS-117, `npm run can-merge` refused a PR whose **Tier:** line named more than one of tiny, normal and risky anywhere on it, even inside a file name in backticks, so a reason that mentioned "the risky list" blocked the merge. Now it counts tier words only in the tier itself, the start of the line up to its first colon, semicolon, bracket, dash or full stop. A comma doesn't end the tier, because the template's placeholder lists the tiers with commas, so "normal, because nothing is on the risky list" is still refused, with a message that says to end the tier with a colon.

## 2026-10-30

- **What happened:** Claude wrote PR 211's Tier line as "normal: docs plus a new test, nothing on the risky list", then reworded it to "none of its files is in `scripts/risky-paths.ts`". `can-merge` refused both, and passed only when the reason named no tier word at all.
- **Evidence:** `npm run can-merge -- 211 --merge`, twice: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 211](https://github.com/Jaspyplayz/League-Web-App/pull/211) merged after the third wording.
- **Root cause:** the PR template asks for "tiny, normal or risky, and why", and the natural why for a normal PR is that it's off the risky list. Nothing before the merge gate says which words the reason can't use, and the gate counts "risky" inside `risky-paths.ts` because a hyphen ends a word.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. If it repeats, Jaspyplayz/project-template already has a fix to copy: `readTier` in its `scripts/can-merge-gates.ts` drops anything in backticks before counting tier words, and its PR template's comment says which words to keep out of the reason. Both files are on the risky list here, so Jasper merges that change.

## 2026-10-31

- **What happened:** Claude wrote PR 230's Tier line as "normal: it adds a check and loosens nothing. But it adds a file in `e2e/`, which is on the risky list", to say why Jasper merges it. `can-merge` refused it. The reason should have named who merges without a tier word, as PR 229's did ("a path only Jasper merges").
- **Evidence:** `npm run can-merge -- 230` at 78dd0a7: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 230](https://github.com/Jaspyplayz/League-Web-App/pull/230).
- **Root cause:** the same as on 2026-10-30. When a PR touches the risky list, the natural reason is that it's on the risky list, and `readTier` (`scripts/can-merge-gates.ts:476-489`) counts tier words on the whole line. The fix this class's first entry pointed to, dropping backticked text, wouldn't have stopped it: "risky list" here was outside backticks.
- **Rung:** none yet
- **Fix:** JAS-117, a design fix: count tier words only before the line's first colon. It's in `scripts/can-merge-gates.ts`, a risky path, so it gets its own PR.

## 2026-10-31

- **What happened:** Claude wrote PR 234's Tier line as "normal. Shared components with two timers, no data changes, nothing on the risky list." `can-merge` refused it. The reason should have left out "risky list", as the reworded line does ("normal. Shared components with two timers and no data changes.").
- **Evidence:** `npm run can-merge -- 234` at 85f1bd1: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 234](https://github.com/Jaspyplayz/League-Web-App/pull/234).
- **Root cause:** the same as the two entries above: the natural reason for a normal PR is that it's off the risky list, and `readTier` counts tier words on the whole line. JAS-117's planned fix, counting only before the first colon, wouldn't have caught this one either, because the tier ends with a full stop here, as in the template's tests ("normal. One Insights card"). Reading only the line's first word would catch all three.
- **Rung:** none yet
- **Fix:** JAS-117, with a comment there about the full-stop form. It's in `scripts/can-merge-gates.ts`, a risky path, so it gets its own PR.

## 2026-10-31

- **What happened:** Claude wrote PR 238's Tier line as "normal. It fixes one script and changes what `npm run shot -- --phone` does; `scripts/` files here aren't on the risky list." `can-merge` refused it. The reason should have left out where the files sit, or said it with no tier word, such as "paths Claude Code may merge".
- **Evidence:** `npm run can-merge -- 238` at b4e87d8: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 238](https://github.com/Jaspyplayz/League-Web-App/pull/238).
- **Root cause:** the same as the three entries above: the builder gave "not on the risky list" as the reason, and `readTier` (`scripts/can-merge-gates.ts:476-489`) counts tier words on the whole line. The builder didn't read this class file before writing the PR, and nothing checks the Tier line before `can-merge` runs.
- **Rung:** none yet
- **Fix:** JAS-117, the design fix already filed for this class. It changes `scripts/can-merge-gates.ts`, a path only Jasper merges, so it can't land in this PR.

## 2026-10-31

- **What happened:** a local Claude session rewrote PR 237's Tier line to name one tier, as its review asked, but gave the reason as "it edits files on `scripts/risky-paths.ts`". The filename itself holds the tier word, so `can-merge` still read two tiers. Jasper merged the PR himself, so nothing was blocked.
- **Evidence:** `npm run can-merge -- 237` at 8e1cd33: "FAIL  Tiny or normal tier: the **Tier:** line names more than one tier (normal, risky)". [PR 237](https://github.com/Jaspyplayz/League-Web-App/pull/237).
- **Root cause:** the same as the four entries above. `readTier` (`scripts/can-merge-gates.ts:476-489`) counts tier words anywhere on the line, even inside a backticked path, and the session didn't run `can-merge` after editing the description.
- **Rung:** design
- **Fix:** JAS-117 ([PR 241](https://github.com/Jaspyplayz/League-Web-App/pull/241)): `readTier` in `scripts/can-merge-gates.ts` reads only the tier, up to the first colon, semicolon, bracket, dash or full stop, so PRs 234's and 238's full stops end it too. The test "reads the tier before %s, though the reason says risky" holds the refused lines from PRs 211, 230, 234, 237 and 238, which fail on main's gate code and pass now. The template's placeholder is still refused. A reason after a comma is still refused, and the message now says to end the tier with a colon.
