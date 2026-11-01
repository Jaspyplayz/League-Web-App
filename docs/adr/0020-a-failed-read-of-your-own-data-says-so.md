# 0020: A failed read of your own saved data says so

Status: draft (GitHub issue #167).

## Context

`readCache` in `src/lib/match-store.ts` treats a failed database read as "nothing saved". That's right for the Riot caches, where nothing saved just means asking Riot again. It's wrong for data only the player made. #149 found it for match notes: a failed read showed an empty notes box, and saving it wrote over the real note. Two more reads used `readCache` for a player's own data: "This is me" (`readMyPlayer`) and Ask's past questions (`readQuestions`). On your own profile, a failed read offered "This is me" again, and clicking it could clear the mark.

## Options considered

1. Change `readCache` to throw or report failures. Every Riot cache read would need a change, and they're fine as they are.
2. Give each read of the player's own data its own result type, `{ ok: true, ... } | { ok: false }`, as #149 did for notes, and let each caller decide what a failure shows.

## Decision

Option 2. `readMyPlayer` and `readQuestions` return `{ ok: false }` when the query throws, or when `DATABASE_URL` is set but the database can't be reached. Without `DATABASE_URL` they still return nothing saved, since the features are off. Callers never offer an action that writes on a failed read: the "This is me" button shows disabled with "Reload to check", the account menu and Ask (then a profile tab, now a panel on the match page's Replay tab) say they couldn't load, and the Log tab shows no notes box and says the notes couldn't be loaded.

`toggleMyPlayer` no longer reads at all. The button's form says what the click means (`intent=mark` or `intent=clear`), and "clear" deletes the mark only if it's still this player. A read in the action could fail or disagree with the page the player clicked on, and then a click meant to mark would clear.

## Consequences

- A database blip can no longer clear a player's "This is me" or make their Ask history look empty.
- A new read of data the player made should go through `readOwnData` (`src/lib/own-data.ts`, added in JAS-71), not `readCache`. Nothing checks that; the reviewer would have to spot it.
- Since JAS-71, `readMyPlayer`, `readQuestions`, `readDayNotes` and `readMatchNote` all read through `readOwnData`, so the notes reads also return `{ ok: false }` when `DATABASE_URL` is set but gives no usable database, not only when their query throws. `readCache` stays for Riot data.
- `checkAllowance` still throws when its query fails. On the old Ask tab that showed the error page, loud rather than misleading. Since JAS-105 Ask is a panel on every match page, so the panel catches it and says "Couldn't load Ask. Reload to try again." instead of taking the analysis down (`src/components/ask/ask-panel.tsx`).
- A saved "This is me" whose player row has a region Turnpoint doesn't know reads as nothing marked, as before; pressing "This is me" then replaces it.
