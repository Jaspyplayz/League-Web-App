# Search form recovery

A visitor who types a name without its `#TAG` and presses Search stays on the home page with what they typed still in the box and a plain message right under it telling them the expected shape. Nothing navigates or clears.

## Sub-features

- `recover-message` shows `Add the tag after a #, like Faker#KR1. It's on the player's Riot profile.` as an alert under the field.
- `recover-a11y` marks the field `aria-invalid="true"` and points its `aria-describedby` at the message (`search-error`).
- `recover-keep` keeps the typed value and the URL `/`, and leaves Search enabled.

## How to get to it (user POV)

- Type into the `Riot ID` field on the home page and press `Search`.
- Choose the header link `Search for a player`, which goes to the same field (`/#riotId`).

## Driving it with drive.ts

Preconditions:

- doctor reports `home page ok`. No keys needed; the local launched server is enough.
- Signed out, fresh context.

- **Open home.** Go to `/`. The `search` landmark `Player lookup` is visible and the page is calm.
- **Submit without a tag.** Fill `Riot ID` with `Faker`, click `Search`. `#search-error` has role `alert` and text `Add the tag after a #, like Faker#KR1. It's on the player's Riot profile.`; the field has `aria-invalid="true"` and `aria-describedby="search-error"`.
- **Nothing lost.** The URL still ends in `/`, the field still holds `Faker`, and `Search` is enabled.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-search-recovery`.
- **Proof.** `02-submit-a-riot-id-without-a-tag.png` shows the message under the field; its `.aria.yml` shows the alert and the invalid field.

## Gotchas

- The message only appears after a submit, not while typing.
- A name with a tag that doesn't exist is a different path (a "couldn't find" profile page) and needs a Riot key.
