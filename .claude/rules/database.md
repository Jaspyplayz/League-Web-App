---
paths:
  - "src/db/**"
  - "drizzle/**"
  - "src/lib/*-store.ts"
---

# Database rules

- Edit `src/db/schema.ts`, then run `npm run db:generate`. Never edit `drizzle/` by hand.
- Check the newest migration number on `main` first: parallel branches collide on the number and on `drizzle/meta/_journal.json`.
- `npm run db:migrate` ([docs/database.md](../../docs/database.md#changing-the-schema), step 3) changes the live database. Jasper runs it before merging; Claude never does.
- New stored player data updates `src/app/privacy/page.tsx` in the same PR.
- Finished matches and timelines are cached forever; a player's profile (rank, match list) expires after a day or on "Update" (see `src/db/freshness.ts`).
- Changes in `src/db/` or `drizzle/` are risky ([docs/workflow.md](../../docs/workflow.md#review-tiers)).
