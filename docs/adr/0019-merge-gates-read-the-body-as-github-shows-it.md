# 0019: The merge gates read the PR body as GitHub shows it, and fail closed where they can't tell

Status: draft (JAS-58). Amends the last-but-one Consequence of [0009](0009-can-merge-covers-database-code-and-tiny-code.md).

## Context

`npm run can-merge` and GitHub's `reviewer` check find the `## Review` and `## Acceptance criteria` sections and the **Tier:** and **Builder:** lines by reading the PR body line by line. Decision record 0009 accepted that an HTML comment or a code block could fool them, because the PR template had neither. Since JAS-57 the template asks for a diff sketch or a file tree in Summary, so code blocks are now common. The `interrogate` panel on PR 208 showed the gap: a Summary with a fenced block holding `## Review` and a verdict at the head commit passed the reviewer gate while the real Review section said "No review yet".

The first version of this fix taught the line reader to skip fenced code blocks and HTML comments. Its own `interrogate` panel and reviewer then built more than ten bodies that still passed, each where the reader and GitHub's Markdown disagreed: a fence on a list item or in a quote, text after a comment's `-->`, a backtick in a fence's info string, a comment that ends inside a code span, a `<!--` GitHub never treats as a comment, an HTML `<div>` block, and a verdict hidden behind a link definition's title. Matching GitHub exactly would mean writing a full CommonMark parser.

## Options considered

1. Keep the line reader and tell builders not to put headings in code blocks. Nothing would check it.
2. Render the body with a Markdown library and read the headings from the result. Closer to exact, but it adds a package to the merge gates, a new package there is itself a risky change, and GitHub's renderer would still differ from it in small ways.
3. Teach the line reader the common shapes (fenced code blocks and HTML comments), and fail closed wherever the reader and GitHub could disagree.

## Decision

Option 3. In `scripts/can-merge-gates.ts`:

- `bodyLines()` gives each line twice: as written, and as shown, with lines inside a fenced code block and parts of lines inside `<!-- -->` blanked out. Fences follow CommonMark's rules for where they open and close; a `<!--` inside a code span doesn't open a comment, and a comment ends at its first `-->`.
- **Only one candidate.** If the body has more than one line that could be a `## Review` or `## Acceptance criteria` heading, at any heading level, behind any list or quote markers or indentation, the gate fails and asks to keep one. Two lines starting with **Tier:** or **Builder:** fail the same way. With only one candidate, a disagreement over which one GitHub shows can't matter.
- **Passing needs a line GitHub shows whole.** A heading, field, verdict or ticked box counts only on a line with no comment in it and at most 3 spaces of indent. A verdict must also start a paragraph (right after the heading, a blank line or another verdict), so nothing earlier in a paragraph can hide it.
- **Failing counts wherever it is.** An unticked box counts even inside a code block or comment. Any line that names a commit like a verdict but isn't one, such as one after a bullet, inside a comment, or with "(re-review since ...)" before the colon, fails the gate and is quoted, instead of being skipped. Skipping it could let an older clean verdict count over newer blockers.
- A section ends at the next `#` or `##` heading, including an empty `##`.

## Consequences

- None of the bodies the panel and reviewer built passes, and each is a test in `scripts/can-merge-gates.test.ts`. Both gates read the same functions, so `can-merge` and GitHub's check still agree.
- A PR description can't show a second "## Review" line anywhere, even as an example in a code block, and a quoted verdict needs its "at <sha>:" left out, as `.claude/agents/reviewer.md` already asks. A line such as PR 220's "Earlier: Reviewer agent at <sha>: 1 blockers" now fails the gate until it's reworded. Of PRs 190 to 221, only PR 220's result changes.
- A `<!--` in the middle of a paragraph that GitHub shows as text hides the rest of the body from the reader. That can only fail a gate: what it hides can't pass, and an unticked box or verdict-like line in it still counts.
- Still read as text though GitHub shows them differently: a ticked box in a 4-space code block or a code block inside a list or quote, and setext headings (a line of `---` under text), which don't end a section. The reviewer checks the criteria as GitHub shows them.
