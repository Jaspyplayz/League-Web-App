# 0019: The merge gates read the PR body as GitHub shows it

Status: draft (JAS-58). Changes the last-but-one Consequence of [0009](0009-can-merge-covers-database-code-and-tiny-code.md).

## Context

`npm run can-merge` and GitHub's `reviewer` check find the `## Review` and `## Acceptance criteria` sections by reading the PR body line by line. Decision record 0009 accepted that an HTML comment or a code block could fool them, because the PR template had neither. Since JAS-57 the template asks for a diff sketch or a file tree in Summary, so code blocks are now common. The `interrogate` panel on PR 208 showed the gap: a Summary with a fenced block holding `## Review` and a verdict at the head commit passed the reviewer gate while the real Review section said "No review yet".

## Options considered

1. Keep the line reader and tell builders not to put headings in code blocks. Nothing would check it.
2. Render the body with a Markdown library and read the headings from the result. Closer to exact, but it adds a package to the merge gates, a new package there is itself a risky change, and GitHub's renderer would still differ from it in small ways.
3. Teach the line reader the two things that hide a line: fenced code blocks and HTML comments.

## Decision

Option 3. Before looking for a section, `scripts/can-merge-gates.ts` blanks out every line inside a fenced code block (up to 3 spaces, then 3 or more backticks or tildes, closed only by the same character at least as long, or running to the end if never closed) and every part of a line inside `<!-- -->`, ignoring a `<!--` inside an inline code span. A heading counts only with up to 3 spaces before it, since 4 make a code block. The **Tier:** and **Builder:** lines are read the same way. A verdict counts only when it starts its line (bold or in code at most); one after a bullet, a `>` or other words is a mention, and a failing gate names it.

## Consequences

- A heading, verdict or box GitHub shows as code or hides can't open, end or fill a section. Both gates read the same function, so they still agree.
- The reader errs toward hiding: a `<!--` in the middle of a paragraph hides the text after it until `-->`, as GitHub does for a comment inside a paragraph, but GitHub would still show a `## ` heading on a later line there. That can only make a gate fail, not pass.
- Indented code blocks (4 spaces), code inside lists or quotes, and raw HTML other than comments are still read as text. A verdict indented 4 spaces still counts, though GitHub shows it as code.
- A line such as PR 220's "Earlier: Reviewer agent at <sha>: 1 blockers" no longer counts as a verdict. If it named the newest reviewed commit, an older clean verdict could count instead. The reviewer writes its verdict as the first line of its report, so a builder who copies it in doesn't hit this, and the reviewer still reads every earlier answer in the Review section.
