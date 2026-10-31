# 0020: A failed read of your own saved data says so

Status: draft (GitHub issue #167).

## Context

`readCache` in `src/lib/match-store.ts` treats a failed database read as "nothing saved". That's right for the Riot caches, where nothing saved just means asking Riot again. It's wrong for data only the player made. #149 found it for match notes: a failed read showed an empty notes box, and saving it wrote over the real note. Two more reads used `readCache` for a player's own data: "This is me" (`readMyPlayer`) and Ask's past questions (`readQuestions`). On your own profile, a failed read offered "This is me" again, and clicking it could clear the mark.

## Options considered

1. Change `readCache` to throw or report failures. Every Riot cache read would need a change, and they're fine as they are.
2. Give each read of the player's own data its own result type, `{ ok: true, ... } | { ok: false }`, as #149 did for notes, and let each caller decide what a failure shows.

## Decision

Option 2. `readMyPlayer` and `readQuestions` return `{ ok: false }` when the query throws, or when `DATABASE_URL` is set but the database can't be reached. Without `DATABASE_URL` they still return nothing saved, since the features are off. Callers never offer an action that writes on a failed read: the "This is me" button shows disabled with "Couldn't check", the account menu and the Ask tab say they couldn't load, and the Log tab shows no notes box and says the notes couldn't be loaded.

`toggleMyPlayer` no longer reads at all. The button's form says what the click means (`intent=mark` or `intent=clear`), and "clear" deletes the mark only if it's still this player. A read in the action could fail or disagree with the page the player clicked on, and then a click meant to mark would clear.

## Consequences

- A database blip can no longer clear a player's "This is me" or make their Ask history look empty.
- A new read of data the player made should follow the same shape, not `readCache`. Nothing checks that; the reviewer would have to spot it.
- `readDayNotes` and `readMatchNote` already return `{ ok: false }` when their query throws, but still say nothing is saved when `DATABASE_URL` is set and the database can't be reached. Bringing them in line is a follow-up; this change leaves them as they are. `readCache` stays for Riot data.
- `checkAllowance` on the Ask tab still throws when its query fails, so the tab shows the error page. That's loud rather than misleading, so it stays.
- A saved "This is me" whose player row has a region Turnpoint doesn't know reads as nothing marked, as before; pressing "This is me" then replaces it.
