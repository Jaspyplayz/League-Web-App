# A guard that also blocks the repair

A fix stops a bad write by refusing to overwrite what's saved, but the next good write was what used to repair a bad save. With the guard in, a bad save that gets in first stays for good.

## 2026-10-31

- **What happened:** the first version of the JAS-41 fix let only a visit to a profile's saved region update it. A EUW player first opened on NA (the search box's default) got an empty NA row, and from then on no EUW visit could replace it. It should have let a visit that finds the player's summoner replace a row that has none.
- **Evidence:** the reviewer on [PR 226](https://github.com/Jaspyplayz/League-Web-App/pull/226), at 891c883, blocker 1, and all three interrogate panel reviewers' probes: after a first NA visit with no summoner and two EUW visits with one, the row was still `{"region":"na","matchIds":[]}`.
- **Root cause:** the builder tested the guard against a real saved profile only, and didn't ask what had repaired a bad save before: on main the last visit won, so the next right one fixed it.
- **Rung:** check
- **Fix:** [PR 226](https://github.com/Jaspyplayz/League-Web-App/pull/226): the test `is replaced by a visit to a region that finds their summoner` in `src/lib/profile-store-save.test.ts` fails on 891c883's code.
