---
name: soft-rounded-ux
description: >-
  Use when implementing, reviewing, or accepting Soft Rounded / Living soft UI
  on Turnpoint (or extending Soft Rounded beyond a first chrome pass) — before
  briefing, coding, marking Done, or merging UI.
---

# Soft Rounded UX

Reusable playbook so Soft Rounded / Living soft work cannot ship as copy-only chrome. Complements UI mockup fidelity. Load that skill too whenever a mockup or Soft Rounded lock exists.

## Core rule

**Done = Soft Rounded visual + UX fidelity**, proven with preview screenshots side-by-side against the lock. Labels, voice, or "we rounded a couple inputs" alone are **not** Done.

Failure pattern to prevent: copy on an old layout, or Soft Rounded that stops at one bar while the rest of the app stays clipped or tech-cut.

## Soft Rounded tokens / patterns

Apply systemically (theme/tokens), not one-off CSS on a single component.

- **Shape:** soft rounded rectangles / soft squares. Generous border-radius. Kill clipped, beveled, and tech-cut corners. Not sharp rectangles. Not full pills, unless a control is already a true pill by product design.
- **Surfaces:** soft cards, inputs, composers, modals, menus. Same radius language as the JAS-11 Riot ID bar and Ask composer.
- **Chrome consistency:** buttons, chips, and containers on a view match the Soft Rounded lock. Do not mix sharp and soft on the same screen without an explicit delta note.
- **Reference:** JAS-11 after shots in `jas-11-proof/after/` (Riot ID chrome, Ask prompt, home light). Match that language sitewide.

### This repo

Tokens live in `src/app/globals.css`. `src/app/soft-rounded.test.ts` fails if `hud-cut`, `corner-shape`, or a beveled `border-radius` returns.

| Token | Utility | Use |
|---|---|---|
| `--radius-soft` (6px since JAS-97) | `soft-round`, `rounded-soft`, `rounded-t-soft`, `rounded-b-soft` | Cards (`panelClass` / `softPanelClass` in `src/components/ui/panel.tsx`), menus, composers, primary buttons about 52px tall |
| `--radius-soft-sm` (4px since JAS-97) | `soft-round-sm` | Icon buttons, portraits, controls about 40px tall |

The Review board look moved both tokens to 6px and 4px (decision record 0022), so the class names stay until each page moves to Tailwind's `rounded-md` and `rounded-sm`, and the contract ticket deletes them with this skill.

Keep `rounded-full` on controls that were already pills (queue filters, role tags, the Ask suggestion chips, the trinket slot, rune icons).

Data marks stay tighter than chrome. Day squares on the log, legend swatches, score blocks, and champion icons under about 24px do not take `soft-round`. A thin bar (about 20px tall) uses `rounded-md` so it does not become a capsule.

An open match row squares off its bottom (`rounded-t-soft`) and the panel under it uses `rounded-b-soft`, so the pair reads as one card.

## UX (not chrome alone)

Soft Rounded includes Living soft feel.

- **Spacing:** generous, even gaps. No cramped tech denseness next to soft cards. Match rows use `gap-3`.
- **Hierarchy:** clear primary and secondary. Soft weight. Dense tables are not the default look. Profile section tabs stay an underline. Insights view tabs are a soft segmented control.
- **Interaction:** focus is a translucent 3px outline with offset, in `@layer base` in `globals.css`, so `focus-visible:outline-none` still wins inside a grouped field (the Riot ID shell shows focus on the shell). Press on a button darkens it slightly. Motion respects `prefers-reduced-motion`.

If a ticket only lists corner radius, still treat spacing, hierarchy, and interaction as in scope unless the ticket explicitly scopes chrome-only.

## Before work starts (Linear)

1. Put the absolute mockup or Soft Rounded reference path (or a durable URL) in Linear acceptance. No path means stop and get one. Jasper's Soft Rounded OK plus before/after anchors can lock the direction when an Ideation keyframe is missing. Write those paths in Linear.
2. List the key surfaces to restyle (home, profile, match, insights, Ask, settings, sign-in, and the rest of the ticket).
3. Brief concrete visual gaps (radius, card chrome, spacing, hierarchy), not string changes.
4. Load UI mockup fidelity when that skill is available.

## Proof of done

1. PR and Vercel preview URL.
2. Screenshots of every key surface in the ticket, proving Soft Rounded chrome and UX consistency.
3. Side-by-side against the mockup or before paths. Call out intentional deltas.
4. Run `verify-turnpoint` and `verify-turnpoint-ux` when they are in the repo. Green CI alone is not Done.
5. Attach proof paths in the PR and in the Linear ticket's comment.

## Merge gate

- Jasper's yes before merge on Soft Rounded or UI-direction work, asked in the PR. Do not auto-merge a UI fidelity PR.
- Reject Done if screenshots still look like the pre-Soft-Rounded slice with new labels, or if only one surface is rounded.
- One builder per PR: Claude Code, in one local or cloud session.

## Encode after a miss

If a Soft Rounded or UX pass fails fidelity review, update this skill with the concrete miss before the next UI ticket. Do not rely on chat memory alone.

## Out of scope

Ideation still exploring with no Soft Rounded lock yet. Park until Jasper locks direction, then apply this skill.
