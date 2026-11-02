# Prose passed inside a quoted shell string

An agent puts prose (a PR description, a comment, docs) inside a quoted string in a shell command, such as `node -e '...'`. An apostrophe in the prose ends the quote, and the shell runs the rest of the prose as commands.

## 2026-11-02

- **What happened:** while updating PR 296's description, Claude ran `node -e '...'` with the new text inline. The word "Jasper's" closed the single quote, so bash ran the following lines of the description as shell commands until a syntax error stopped it. One of them was the description's own dry-run command, `gh workflow run run-queue.yml --ref main ... -f dry_run=true`. GitHub refused it with a 404, because the workflow wasn't on main yet. The environment and secret commands earlier in the text hit paths this session's proxy blocks, and the real-run command came after the syntax error, so nothing changed outside the session. The text should have gone in a file, written with the Write tool and read by a script.
- **Evidence:** the command's output in the PR 296 session, which included `HTTP 404: workflow run-queue.yml not found on the default branch` and `syntax error near unexpected token`. A check straight after showed no Run queue run had started.
- **Root cause:** Claude had used inline `node -e '...'` edits safely all session on text with no apostrophes, and didn't check this text for one. Nothing stops a shell command from holding prose.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. The rest of the PR's text edits went through files.
