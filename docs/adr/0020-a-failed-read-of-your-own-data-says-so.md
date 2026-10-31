# 0020: A failed read of your own saved data says so

Status: draft (GitHub issue #167).

## Context

`readCache` in `src/lib/match-store.ts` treats a failed database read as "nothing saved". That's right for the Riot caches, where nothing saved just means asking Riot again. It's wrong for data only the player made. #149 found it for match notes: a failed read showed an empty notes box, and saving it wrote over the real note. Two more reads used `readCache` for a player's own data: "This is me" (`readMyPlayer`) and Ask's past questions (`readQuestions`). On your own profile, a failed read offered "This is me" again, and clicking it could clear the mark.

## Options considered

1. Change `readCache` to throw or report failures. Every Riot cache read would need a change, and they're fine as they are.
2. Give each read of the player's own data its own result type, `{ ok: true, ... } | { ok: false }`, as #149 did for notes, and let each caller decide what a failure shows.

## Decision

Option 2. `readMyPlayer` and `readQuestions` return `{ ok: false }` when the query throws, or when `DATABASE_URL` is set but the database can't be reached. Without `DATABASE_URL` they still return nothing saved, since the features are off. Callers never offer an action that writes on a failed read: the "This is me" button shows disabled with "Couldn't check", `toggleMyPlayer` changes nothing, the account menu and the Ask tab say they couldn't load, and the Log tab shows no notes box.

## Consequences

- A database blip can no longer clear a player's "This is me" or make their Ask history look empty.
- A new read of data the player made should follow the same shape, not `readCache`. Nothing checks that; the reviewer would have to spot it.
- `readDayNotes` and `readMatchNote` already did this; `readCache` stays for Riot data only.
