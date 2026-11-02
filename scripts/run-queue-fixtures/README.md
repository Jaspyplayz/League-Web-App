# Saved answers for the ticket queue's tests

`scripts/run-queue-rest.test.ts` reads these, so the queue's reading of Linear and GitHub is tested without either. Each file is a real answer, cut down to the fields `scripts/run-queue-rest.ts` reads.

- `pulls-open.json`: `GET repos/Jaspyplayz/League-Web-App/pulls?state=open`, saved at 06:23 UTC on 2026-11-02. Each `body` keeps only its `**Tier:**`, `**Builder:**` and `**Ready to merge:**` lines.
- `files-<n>.json`: `GET repos/Jaspyplayz/League-Web-App/pulls/<n>/files` for each of those PRs, at the same time.
- `statuses-2026-11-02.json`: `GET repos/Jaspyplayz/League-Web-App/commits/<sha>/status` for main's head and each open PR's head, at the same time. Vercel had hit its daily deploy limit at 06:08 UTC, so most say "Deployment rate limited". PR 276's deploy had started at 06:20:16 and finished at 06:21:13, 30 seconds after the newest refusal, so one success right after a refusal doesn't mean the limit has cleared.
- `linear-queue.json`: the Linear tickets in In Progress and In Review on 2026-11-02, in the shape Linear's GraphQL API answers the queue's query. A cloud session can't call that API without the key, so these were copied from the Linear connector's answers by hand. The repo is public, so each description keeps only its Touches line and an Acceptance criteria heading, and the titles and Jasper's user ID are replaced. The picker reads each one the same way as the whole description.
