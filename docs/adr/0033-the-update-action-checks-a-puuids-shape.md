# 0033: The Update action checks a PUUID's shape before the database

Status: draft.

## Context

The Update button on a profile calls `updateProfileAction(region, puuid)`, a Server Action. Anyone can call one with any arguments, and it only checked that the PUUID was a string. A PUUID holding a NUL character (a zero byte) reached `updateProfile`'s query, Postgres refused it because text can't hold a zero byte, and `readCache` reported the error to Sentry. Nothing changed in the database, but each call could use up some of the free Sentry quota that shows real problems. Notes and Ask questions could carry a NUL to Postgres the same way. The 2026-11-02 audit found it (finding L4).

## Options considered

- **Stop reporting Postgres's error in `readCache`.** It would hide real database problems too.
- **Check inside `updateProfile`.** It would also cover other callers, but there are none, and the action is where untrusted input comes in.
- **Check the exact length, 78 characters.** That's Riot's documented length, and every real PUUID checked (3, from the live site's pages) has it. But the repo's anonymized test games use IDs like `golden-player-1`, and if Riot changed the length the button would stop working, with no error to show it.
- **Check the characters and a loose length at the action (chosen).**

## Decision

`updateProfileAction` refuses a PUUID that doesn't match `/^[\w-]{1,100}$/`: 1 to 100 letters, digits, `_` and `-`. Real PUUIDs are 78 of those. The refusal is the same "not found" answer a bad region gets, given before any database query, so nothing reaches Sentry.

`cleanNote` and `cleanQuestion` drop every NUL rather than refusing the text. Nobody types one, and refusing a note would show the note box's only error, "Notes can be up to 2000 characters.", which would be wrong.

## Consequences

Good:
- Calling Update with a malformed PUUID costs no database query and files no Sentry event.
- A note or question can no longer fail to save because of a NUL.

Bad:
- If Riot ever issues a PUUID with another character, or longer than 100, Update refuses it as "not found". The test that sends every fixture PUUID and a 78-character one through the action would still pass, so nothing would warn first.
- Two other Server Actions still pass an unchecked PUUID to a database query: `toggleMyPlayer` (the "This is me" button) through `saveMyPlayer`, and `writeRecapAction` through `createRecap`'s read of a saved recap. Both need a signed-in account, which limits who can call them, and changing `src/app/account/actions.ts` was outside this change.
