# Turnpoint verification map

The pages a player uses, and how to prove each one works with `npm run shot` ([SKILL.md](../SKILL.md)). Read this index, then the file for the feature you changed.

## Baseline

- The site answers `npm run shot -- --check` with exit code 0.
- Hide on bush#KR1 on KR is the test player, as in `e2e/smoke.spec.ts`. The sample game `KR_8416261221` is stored in the database, so it loads without the Riot key.
- Pages that call Riot need a working key. When `--check` reports `riot-key` on the profile, only the sample game and the pages without game data can be proven.

## Driving conventions

- Paths are URL-encoded: `Hide%20on%20bush-KR1`, not `Hide on bush#KR1`.
- Name labels and roles as players see them (`--tab "Deep dive"`), never CSS classes.
- The data shown for a live player changes with every game they play. Prove a criterion about saved or computed data on the sample game.

## Features

- [Search and profile](./search-and-profile.md): the home page search, a player's profile and its sections.
- [Match page](./match-page.md): the Summary and Deep dive tabs of one game, including the replay.
- [Insights](./insights.md): the three Insights views.
- [Settings](./settings.md): the theme choice, which every page follows.

Not mapped yet: Ask needs a signed-in account, and sign-in needs the Supabase variables a worktree server doesn't have.
