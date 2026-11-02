# 0026: A script picks the tickets, and an Action starts the builders

Status: accepted. It records the design of `/run-queue` (JAS-29). The trial ran on one ticket, JAS-143 built the picking script and JAS-144 the Run queue workflow; the failure loop comes next.

## Context

Jasper wants tickets to sit in a queue and get built, with anything that fails going back on the queue, in a loop. Until now he or a parent session started each builder by hand. The starting sketch on JAS-29 was a cloud task that fired every hour, took the top Ready ticket and built it.

On 2026-11-01 he rejected the timer: "It shouldn't go on a time basis. It should go on whether these tickets can go in parallel, the importance of the task (using triage or something), and if some tasks are blocked by others, then you complete the ones that are prerequisites." That rule is mechanical: blockers, then Priority, then whether the files overlap.

## Options considered

- **An hourly cloud task where Claude picks (the sketch).** Simple to set up, but it wakes Claude every hour even with nothing to do, starts one builder at most, and goes by the clock.
- **A cloud task started by GitHub when a PR merges, where Claude picks.** No clock, but each merge spends usage just on working out what's next, and it starts only one builder even if two slots are free. It also needs the Claude GitHub App.
- **`/run-queue` only, from a local session.** No new services, but this app has to stay open and the queue stops between commands, so it isn't a loop. An automated turn in the app can't start a session either.
- **A script picks, and a GitHub Action starts one builder per ticket (chosen).** Picking is plain code with tests, like `can-merge`, and costs no Claude usage when nothing fits.

## Decision

A plain script runs in a GitHub Action when a PR merges, when Jasper starts `/run-queue`, and once an hour. The hourly run is there because merges can't report what didn't happen: Vercel's limit clearing, a builder stalling, or a ticket reaching Ready while the queue is idle. The clock only makes the queue look. It doesn't decide what gets picked.

The script leaves out any ticket with an unfinished blocker, sorts the rest by Priority and then age, and starts each one whose Touches line doesn't overlap an open PR's files or another ticket picked that round, up to a ceiling of 4. Nothing new starts while Vercel is refusing deploys. The Action starts each builder through the cloud task's API trigger.

A ticket gets two tries, then moves to Todo, assigned to Jasper. A builder that needs a file an open PR has stops and waits, which doesn't use up a try, following the rule in `AGENTS.md`. A finished PR only Jasper can merge frees its slot, but its files stay held.

The number of builders comes from the tickets, not a setting. The ceiling is only a safety limit, because each builder's pushes use Vercel's 100 deploys a day, shared with petri, and we don't yet know what a run costs. It goes up once real runs show it's safe.

## Consequences

Good:

- Idle checks cost no Claude usage, and Actions are free on this public repo.
- The same tickets always give the same picks, and tests can prove it.
- `/run-queue` works with this app closed, because it only starts the Action.

Bad:

- It needs two new GitHub secrets, which Jasper adds himself: the cloud task's token and a Linear API key.
- It relies on the API trigger, which is a beta in a research preview, so it may change.
- The Touches line is a prediction and can be wrong, so builders can stop partway and wait.
- A flaky test can use up a try, because the script can't always tell it from a real failure.
- Scheduled Actions can be delayed or dropped and switch off after 60 days with no repo activity, so the hourly check can't be the only way in.

## Open questions

1. Do Linear's "needs approval" prompts stall a builder with nobody watching? Answered by the trial on 2026-11-01: no tool stopped to ask, and the builder went from the fire to a merged PR alone.
2. What does one builder run cost against Jasper's usage limits? Still open: the trial's run log has no cost figure.
3. How does a refused PR get retried? `.github/workflows/agent-merge.yml` notes that GitHub won't run a workflow from a push made with the Action's own token, so CI wouldn't run on it.
4. Until the failure loop is built, how many times can one ticket start? Tries aren't counted yet, so a ticket whose builder never moves it out of Ready starts again each time the queue's start comment stops holding it, after 2 hours.
