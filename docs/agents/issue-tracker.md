# Issue tracker: Linear

Turnpoint's tickets live in Linear: workspace [linear.app/jaspy](https://linear.app/jaspy), team **JAS**, project **Turnpoint**. Not GitHub issues; GitHub issues opened before 2026-10-25 stay open until they're done. The full rules are in [docs/workflow.md](../workflow.md#tickets-and-builders); this page is what Matt Pocock's skills (`to-tickets`, `to-spec`, `triage`) need to know.

`wayfinder` plans an effort too big for one session as a map of decision tickets; how it works here is in [Wayfinding operations](#wayfinding-operations).

## This repo's rules (override anything a skill says)

- **Use the Linear tools** (the Linear connector: `save_issue`, `get_issue`, `list_issues`, `save_comment`, `delete_comment`), never `gh issue`.
- **A ticket an agent creates starts in Todo**, with the [Feature or fix](../../.github/ISSUE_TEMPLATE/feature.md) sections, in team JAS and project Turnpoint. The one exception is the parent ticket `to-spec` writes, which keeps that skill's own sections, because it's a plan for sub-tickets and no PR builds it ([docs/workflow.md](../workflow.md#work-too-big-for-one-pr)). The other exception is a `Postmortem:` ticket from the [`postmortem` skill](../../.claude/skills/postmortem/SKILL.md), which starts in Backlog: it's a fix Jasper hasn't asked for, so he decides whether to write it up. A `wayfinder` map and its tickets keep that skill's own sections too ([Wayfinding operations](#wayfinding-operations)). A loose idea that isn't written up yet goes in Backlog.
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

## Wayfinding operations

What Matt Pocock's `wayfinder` skill needs. Its tickets are decisions, not builds, so they never go through the build steps in [docs/workflow.md](../workflow.md).

- **Labels**: `wayfinder:map` on the map, and one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task` on each ticket. They are workspace labels in Linear. A map and its tickets carry no other labels, not even `Feature` or `Bug`.
- **The map**: a ticket in team JAS, project Turnpoint, state Todo, labelled `wayfinder:map`. It stays open until its destination is reached.
- **Its tickets**: sub-tickets of the map (`save_issue` with `parentId` set to the map's ID), in state Todo, with a `## Question` section. Builders only take Ready tickets, so a decision ticket in Todo is never picked up as build work. Only Jasper moves tickets to Ready, and a wayfinder ticket never needs to be.
- **Blocking**: Linear's own relation (`blockedBy`), set in a second pass once every ticket has an ID.
- **Claiming**: assign the ticket to Jasper (`assignee: "me"`; the Linear connection is his account) before any work. An open, unassigned ticket is unclaimed.
- **The frontier**: `list_issues` with `parentId` set to the map and `state: "Todo"`, then keep the unassigned ones whose blockers (`get_issue` with `includeRelations: true`) are all Done or Canceled.
- **Resolving**: post the answer as a comment on the ticket, move it to Done, and add a line to the map's Decisions so far. Ruling a ticket out of scope moves it to Canceled with a line under the map's Out of scope.
- **Research findings** go on a `research/<name>` branch that is pushed but never merged and has no PR; the ticket's resolution comment links the file on that branch.
- **Branch names**: a builder's `claude/jas-<n>-...` branch closes ticket `<n>` when it merges, so never put a map's or decision ticket's number in a build branch.

## Pull requests as a triage surface

**PRs as a request surface: no.** Turnpoint's only PRs from outside Claude Code are Dependabot's, and those follow [docs/workflow.md](../workflow.md), not triage.
