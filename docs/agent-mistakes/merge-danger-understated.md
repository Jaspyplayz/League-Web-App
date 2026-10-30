# Merge Danger understated on a risky path

The PR template defines the door and the blast radius by what the diff does: code that writes database rows is a one-way door, and sign-in or saved data is a high blast radius. This class is a PR whose Merge Danger section rates its own diff lower than those definitions do.

## 2026-10-30

- **What happened:** Claude opened PR 219 (`safeNextPath`, `src/lib/sign-in.ts`) with "Blast radius: low to medium". By the template it's high, since it's sign-in, and "low to medium" isn't one of the template's values.
- **Evidence:** the reviewer agent's report at `09e8a83` on [PR 219](https://github.com/Jaspyplayz/League-Web-App/pull/219), blocker 1, quoting `.github/pull_request_template.md`'s Merge Danger definitions. The same session made the same mistake twice on PR 218, logged on that PR's branch.
- **Root cause:** Claude rated the change by how small and safe the edit looked (a two-line check) instead of by the template's definitions, which go by what the code touches. Nothing before the reviewer compares the Merge Danger lines with the files in the diff.
- **Rung:** none yet
- **Fix:** JAS-69, a `can-merge` gate that compares the Merge Danger lines with the diff. `scripts/can-merge` is on the risky list, so Jasper merges it.
