# Merge Danger understated on a risky path

The PR template defines the door and the blast radius by what the diff does: code that writes database rows is a one-way door, and sign-in or saved data is a high blast radius. This class is a PR whose Merge Danger section rates its own diff lower than those definitions do.

## 2026-10-30

- **What happened:** Claude opened PR 218 (a guard in `saveMatch`, `src/lib/match-store.ts`) as "Door: two-way" and "Blast radius: low", and PR 219 (`safeNextPath`, `src/lib/sign-in.ts`) as "Blast radius: low to medium". By the template, 218 is one-way (it writes `matches` rows that stay after a revert) and both are high (saved data, and sign-in).
- **Evidence:** the reviewer agent's reports at `07a99a0` on [PR 218](https://github.com/Jaspyplayz/League-Web-App/pull/218) (2 blockers) and at `09e8a83` on [PR 219](https://github.com/Jaspyplayz/League-Web-App/pull/219) (1 blocker), quoting `.github/pull_request_template.md`'s Merge Danger definitions.
- **Root cause:** Claude rated each change by how small and safe the edit looked (a five-line guard, a two-line check) instead of by the template's definitions, which go by what the code touches. Nothing before the reviewer compares the Merge Danger lines with the files in the diff.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. If it repeats, the reviewer's guess is a `can-merge` gate that refuses "Door: two-way" when the diff changes an insert in `src/db/` or `src/lib/*-store.ts`, and anything but "Blast radius: high" when it touches a risky path whose reason is sign-in, saved data or money. `scripts/can-merge` is on the risky list, so Jasper merges that change.
