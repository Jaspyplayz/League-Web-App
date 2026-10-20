---
paths:
  - "src/lib/riot/**"
---

# Riot client rules

- This folder is the only code that calls Riot. Every request goes through `riotGet` in `client.ts`, which takes its turn under the rate limit shared by every server ([ARCHITECTURE.md](../../ARCHITECTURE.md#staying-inside-riots-rate-limit)).
- Keep the back-off after a "too many requests" answer: Riot can disable keys that keep calling.
- `RIOT_LIMITS` in `rate-limit.ts` is set for a development key. Change it when the key changes.
- Changes here are risky ([docs/workflow.md](../../docs/workflow.md#review-tiers)).
