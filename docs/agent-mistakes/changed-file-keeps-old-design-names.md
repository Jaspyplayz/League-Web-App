# A changed file keeps the old design names

During the Review board move, a ticket's "files this ticket changes use only the new names" rule covers every file in the diff, so a file touched only for a comment, or edited without renaming its classes, breaks it.

## 2026-10-31

- **What happened:** JAS-105 edited comments in `review.tsx` and `early-jungle.tsx` and changed `page.tsx`, but left `soft-round`, `text-muted`, `text-ink`, `font-mono` and an `uppercase` label in them. It should have either renamed them or left the comment-only files alone.
- **Evidence:** reviewer blocker 3 on commit 5a4b462 (`review.tsx:45-79`, `early-jungle.tsx:42`, `page.tsx:86`, `:113`, `:208`).
- **Root cause:** the builder checked the old names only in files it restyled, and counted comment edits as not changing a file. Nothing flagged them until JAS-98.
- **Rung:** check
- **Fix:** JAS-98 deleted the old names and turned on `turnpoint/tokens-only`, `turnpoint/review-board-type` (`eslint-rules/turnpoint.mjs`) and `src/app/corners.test.ts`, so an old name now fails lint or the tests anywhere in `src/` (outside the three files allowed their own colours, for colours). The PR that hit this reverted the comment-only edits and renamed the old names in `page.tsx`.
