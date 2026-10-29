# Issue tracker: Linear

Turnpoint's tickets live in Linear: workspace [linear.app/jaspy](https://linear.app/jaspy), team **JAS**, project **Turnpoint**. Not GitHub issues; GitHub issues opened before 2026-10-25 stay open until they're done. The full rules are in [docs/workflow.md](../workflow.md#tickets-and-builders); this page is what Matt Pocock's skills (`to-tickets`, `to-spec`, `triage`, `implement`) need to know.

`wayfinder` isn't set up here: it needs `wayfinder:map` and `wayfinder:<type>` labels and its own operations section, which Turnpoint doesn't have. Don't run it until this page has them.

## This repo's rules (override anything a skill says)

- **Use the Linear tools** (the Linear connector: `save_issue`, `get_issue`, `list_issues`, `save_comment`), never `gh issue`.
- **A ticket an agent creates starts in Todo**, with the [Feature or fix](../../.github/ISSUE_TEMPLATE/feature.md) sections, in team JAS and project Turnpoint. A loose idea that isn't written up yet goes in Backlog.
- **Only Jasper moves a ticket to Ready.** Ready means approved: a builder may take it without being asked. Where a skill would mark a ticket ready for an agent, leave it in Todo and say it needs Jasper's approval.
- **A builder takes a Ready ticket, or a Todo one only when Jasper asks.** It names its branch `claude/jas-<n>-<short-name>`, so Linear links the PR and moves the ticket to Done when it merges.
- **Comment on the ticket** when you start (branch and plan), when you open the PR (link), and at the end of each session (done, next, blocked).

## Conventions

- **Create a ticket**: `save_issue` with `team: "JAS"`, `project: "Turnpoint"`, `state: "Todo"`, a title and a Markdown description.
- **Read a ticket**: `get_issue` with its ID, such as `JAS-55`.
- **List tickets**: `list_issues` with `team: "JAS"` and a `state` filter.
- **Make a sub-ticket**: `save_issue` with `parentId` set to the parent's ID. Link a blocker with `blockedBy: ["JAS-12"]`.
- **Comment**: `save_comment` with the ticket's ID.
- **Labels**: `Bug`, `Feature` and `Improvement` say what kind of work it is. Triage roles are statuses, not labels ([triage-labels.md](triage-labels.md)).
- **Close without doing it**: move it to Canceled, or Duplicate, with a comment saying why.

## Pull requests as a triage surface

**PRs as a request surface: no.** Turnpoint's only PRs from outside Claude Code are Dependabot's, and those follow [docs/workflow.md](../workflow.md), not triage.
