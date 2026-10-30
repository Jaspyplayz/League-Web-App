# Jasper's own writing listed as his to-do

Some writing is Jasper's to do when he wants, such as the why and what-I-learned lines of a Dev Log. Listing it under "What you'll have to do" in every reply turns his learning exercise into noise.

## 2026-10-25

- **What happened:** Claude listed "write My read" and the Dev Log "Why / what I learned" lines as Jasper's to-dos, repeated in every reply.
- **Evidence:** Claude's memory note `no-my-read-reminders` on Jasper's PC, 2026-10-25: "the reminders were repeated in every reply's to-do list and he found them noise".
- **Root cause:** the reply layout has a "What you'll have to do" list, and Claude put every open item in it, including writing that is Jasper's own.
- **Rung:** CLAUDE.md line
- **Fix:** Jasper's global `~/.claude/CLAUDE.md`: "Never list them as my to-dos either", and the memory note. "My read" left the PR template in PR 201.

## 2026-10-29

- **What happened:** Claude listed "Write 'In my words' in `docs/adr/0016-agent-mistakes-become-checks.md`" as Jasper's to-do while building PR 211. Jasper said to remove it.
- **Evidence:** this session's reply after PR 211 opened; Jasper: "remove the in my words", then "I don't want changes to need in my words".
- **Root cause:** the CLAUDE.md line from the first time is an instruction nothing checks, and the decision record's empty "In my words" heading kept the item open.
- **Rung:** design
- **Fix:** [PR 211](https://github.com/Jaspyplayz/League-Web-App/pull/211): decision records no longer have an "In my words" part (`docs/workflow.md`, [0016](../adr/0016-agent-mistakes-become-checks.md)), so there's nothing to list. The Dev Log lines still rest on the CLAUDE.md line.
