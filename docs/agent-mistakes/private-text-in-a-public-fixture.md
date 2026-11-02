# Private text saved in a public fixture

A test fixture copied from a private system, such as Linear, Sentry or the database, keeps more than the test reads, and the public repo publishes it.

## 2026-11-02

- **What happened:** Claude's design brief for PR 296 asked its delegate to copy that day's In Progress and In Review Linear tickets into `scripts/run-queue-fixtures/linear-queue.json` with their full descriptions, and it did. The repo is public, and two of those descriptions explained bugs not yet fixed on main. The tests read only each ticket's Touches line and Acceptance criteria heading, so the fixture should have kept only those.
- **Evidence:** the interrogate panel at `5977c1a` on [PR 296](https://github.com/Jaspyplayz/League-Web-App/pull/296) (its Haiku reviewer's first finding), and the reviewer agent's report there, finding 5. The cut-down copy is commit `cb8dfa4`.
- **Root cause:** Claude wanted the saved answers to match real ones exactly and didn't weigh that Linear is private while the repo is public. Nothing checks what a fixture copies from a private source, and a cloud session's permissions refuse the force-push that would take a pushed commit back.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. PR 296 cuts the copy down and asks Jasper to squash-merge, so the first copy stays out of main's history.
