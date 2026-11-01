# Triage Labels

Matt Pocock's skills speak in terms of five triage roles, plus "never triaged". Turnpoint tracks them as Linear statuses, not labels, so this file maps each role to the status (or assignee) a skill should use. A "triage comment" below means one headed `## Triage Notes`, which `triage` writes; an ordinary comment doesn't count.

| Role in mattpocock/skills   | In Turnpoint's Linear                         | Meaning                                                      |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| never triaged (no label)    | Backlog, with no triage comment yet           | A new idea nobody has looked at                              |
| `needs-info`                | Backlog, with a triage comment asking for it  | Not enough to write it up; the comment says what's missing   |
| `needs-triage`              | Todo                                          | Written up with the Feature or fix sections                  |
| `ready-for-agent`           | Ready                                         | A builder may take it                                        |
| `ready-for-human`           | Todo, assigned to Jasper                      | Needs Jasper to do it, not Claude Code                       |
| `wontfix`                   | Canceled, with a comment                      | Will not be done                                             |

- **Triage writes the ticket up before it reaches Todo.** Todo means written up ([docs/workflow.md](../workflow.md#tickets-and-builders)), so a Backlog idea moves to Todo only once it has the [Feature or fix](../../.github/ISSUE_TEMPLATE/feature.md) sections. The parent ticket `to-spec` writes is the exception: it keeps that skill's sections ([docs/workflow.md](../workflow.md#work-too-big-for-one-pr)).
- **`wayfinder` tickets aren't triaged.** A ticket with a `wayfinder:` label is a decision, not a build: in Todo it is open, assigned to Jasper it is claimed by a session (not `ready-for-human`), and it keeps the skill's `## Question` section. `triage` leaves it alone ([Wayfinding operations](issue-tracker.md#wayfinding-operations)).
- **Claude Code may move a ticket to Ready, from Backlog or Todo.** It needs the Feature or fix sections, a Priority and a Touches line first, so a Backlog idea with too little to write up stays in Backlog with a comment asking for what's missing. Claude Code says why on the ticket, and Jasper can move it back. This is what `ready-for-agent` means in a skill such as `to-spec` or `to-tickets`. A `wayfinder` ticket never moves to Ready.
