---
paths:
  - "src/lib/analyzer/**"
---

# Analyzer rules

- Keep the analyzer as pure functions (match JSON in, results out) with Vitest tests: no network, no database.
- Start a change with a failing test written from its acceptance criteria ([docs/workflow.md](../../docs/workflow.md#the-steps-for-a-normal-change)).
- `golden.test.ts` runs the analyzer on four real games in `fixtures/`. If a change makes one fail, check the new answer still makes sense for that game before updating the expected value, and list the values that moved in the PR. A new fixture is anonymized the way `fixtures/README.md` says.
- Retraining a model (`score-model.json`, `phase-score-model.json`, `win-chance-model.json`) or showing players a new judgment (a grade, a cause, a rating) is a risky change ([docs/workflow.md](../../docs/workflow.md#review-tiers)).
