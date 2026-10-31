# A check left to a local session that the cloud could run

A cloud session leaves an acceptance criterion, a screenshot or the reviewer to "a local session" without trying it first, when the cloud environment can do it.

## 2026-10-31

- **What happened:** Claude opened PR 234 with "Works with the sample game, on a phone and in light mode" unticked, saying the sample game "needs the preview's database, so a local session checks it there", and left the reviewer agent to a local session too. Both ran in the same cloud session: `npm run shot -- --pr 234` took the sample game in dark and in light at 390px, and the `reviewer` agent was in the session's agent list. It should have tried both before handing them off.
- **Evidence:** the reviewer's blocker on 85f1bd1 ("criterion 6 has no evidence … the preview has it, and `npm run shot -- --pr 234` works from a cloud session"), and `npm run can-merge -- 234`: "FAIL  Acceptance criteria ticked: 1 of 6 unticked". [PR 234](https://github.com/Jaspyplayz/League-Web-App/pull/234).
- **Root cause:** Claude took the session brief ("the `reviewer` agent type isn't available here") and `AGENTS.md` ("running the reviewer agent in a cloud session haven't been tried yet") as settled, and wrote the PR body before the preview was up. It never went back to that criterion once the preview's screenshots worked. `can-merge` refuses the unticked box, but only at merge time.
- **Rung:** CLAUDE.md line
- **Fix:** `AGENTS.md`'s Cloud sessions paragraph now says the reviewer agent, `npm run shot -- --pr` and editing a description all work in a cloud session, and says to try each criterion on the preview before leaving it to a local session. `AGENTS.md` loads with `CLAUDE.md`.
