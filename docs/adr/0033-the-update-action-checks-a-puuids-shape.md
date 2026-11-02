# 0033: The Update action checks a PUUID's shape before the database

Status: draft.

## Context

The Update button on a profile calls `updateProfileAction(region, puuid)`, a Server Action. Anyone can call one with any arguments, and it only checked that the PUUID was a string. A PUUID holding a NUL character (a zero byte) reached `updateProfile`'s query, Postgres refused it because text can't hold a zero byte, and `readCache` reported the error to Sentry. Nothing changed in the database, but each call could use up some of the free Sentry quota that shows real problems. Notes and Ask questions could carry a NUL to Postgres the same way. The 2026-11-02 audit found it ([finding L4](https://linear.app/jaspy/document/audit-batch-1-at-a59ba4d-ff693d0fe8cb)).

## Options considered

- **Stop reporting Postgres's error in `readCache`.** It would hide real database problems too.
- **Stop reporting only Postgres's data errors in `readCache`** (SQLSTATE class 22, which a NUL raises). It would cover every path at once, including ones added later. But `readCache` serves every page, so it's a wider change than this one, and a data error can also mean a real bug worth hearing about.
- **Check inside `updateProfile`.** The action is where untrusted input comes in, and the other actions that take a PUUID don't go through `updateProfile`.
- **Check the exact length, 78 characters.** That's Riot's documented length, and every real PUUID checked has it: those of at least 4 players, read from the live site's public pages. It would refuse a short made-up ID too, which today costs one query that finds nothing and files no Sentry event. But if Riot changed the length, every Update click would be refused, with nothing on our side to show why.
- **Check the characters and a loose length, in a shared helper (chosen).**

## Decision

`isPuuid` in `src/lib/puuid.ts` accepts a string of 1 to 100 letters, digits, `_` and `-` (`/^[\w-]{1,100}$/`). The characters are what keep a NUL out; the length is loose so a change on Riot's side can't stop the Update button working. It's a plain module rather than part of the action's file, because a `"use server"` file can only export async functions, and the other actions that take a PUUID need the same check.

`updateProfileAction` refuses a PUUID that `isPuuid` rejects with the same "not found" answer a bad region gets, before any database query, so nothing reaches Sentry.

`cleanNote` and `cleanQuestion` drop every NUL rather than refusing the text. Nobody types one, and refusing a note would show the note box's only error, "Notes can be up to 2000 characters.", which would be wrong.

## Consequences

Good:
- Calling Update with a malformed PUUID costs no database query and files no Sentry event.
- A note or question can no longer fail to save because of a NUL.

Bad:
- If Riot ever issues a PUUID with another character, or longer than 100, Update refuses it, and no test or alert would say so.
- A refused PUUID gets the button's message for a failed update, "Riot didn't answer, so the profile wasn't updated. Try again soon.", which is wrong: Riot was never asked. Only a hand-made call, or the Riot change above, gets there, since the page gives the button the PUUID Riot sent. The message is in the button's component, outside this change.
- Two other Server Actions still pass an unchecked PUUID to a database query: `toggleMyPlayer` (the "This is me" button) through `saveMyPlayer` and `forgetMyPlayer`, and `writeRecapAction` through `createRecap`'s read of a saved recap. Each needs a signed-in account, but anyone can make one with Google or Discord, so a NUL there still files a Sentry error. Each fix is a call to `isPuuid`, in `src/app/account/actions.ts`, which another open pull request was changing when this was written.
