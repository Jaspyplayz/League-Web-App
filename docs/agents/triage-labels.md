# Triage Labels

Matt Pocock's skills speak in terms of five triage roles. Turnpoint tracks them as Linear statuses, not labels, so this file maps each role to the status (or assignee) a skill should use.

| Role in mattpocock/skills | In Turnpoint's Linear       | Meaning                                                   |
| ------------------------- | --------------------------- | --------------------------------------------------------- |
| `needs-triage`            | Todo                        | Written up; Jasper needs to evaluate it                   |
| `needs-info`              | Backlog, with a comment     | Not written up enough yet; the comment says what's missing |
| `ready-for-agent`         | Ready (**only Jasper**)     | Jasper approved it; a builder may take it                 |
| `ready-for-human`         | Todo, assigned to Jasper    | Needs Jasper to do it, not Claude Code                    |
| `wontfix`                 | Canceled, with a comment    | Will not be done                                          |

Agents never move a ticket to Ready. Where a skill says to apply `ready-for-agent` (for example `to-spec`), leave the ticket in Todo and tell Jasper it's ready for approval.
