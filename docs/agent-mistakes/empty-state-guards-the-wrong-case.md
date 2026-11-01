# An empty state that guards the wrong empty case

A section's "nothing to show" message checks for the empty value its prop type allows (such as `null`), when the function that makes the data shows emptiness another way (such as an empty list), so the case players actually hit shows a blank section.

## 2026-11-01

- **What happened:** Restyling Insights (JAS-114), the builder gave Habits a "nothing to show" message behind `if (!report)`. `compareHabits` only returns `null` with no games at all, which the page never renders; the real empty case is a report with `habits: []` (a champion picked that you played in two roles), which still drew the heading, "Your 2 mid games." and an empty list with no reason. It should have read `compareHabits` and guarded `habits.length === 0`.
- **Evidence:** PR 249, reviewer blocker 1 on 6e966a0, `src/app/player/[region]/[riotId]/insights/habits.tsx:49` against `src/lib/analyzer/habit-trends.ts:110-118`. The new test `HabitsSection with nothing to show` in `src/app/player/[region]/[riotId]/insights/sections.test.tsx` fails on 6e966a0's `habits.tsx` ("2 failed | 3 passed") and passes on the fix.
- **Root cause:** The builder took the empty case from the prop type `HabitReport | null` and the page's old `habits &&` guard, without reading the return paths of the function that makes the report. No test rendered Habits with nothing in it, so nothing caught the blank section.
- **Rung:** check
- **Fix:** `sections.test.tsx` in PR 249 renders Habits with `habits: []` and with `null`, and expects the heading and the reason.
