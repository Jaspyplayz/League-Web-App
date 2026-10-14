import type { WeaknessId } from "@/lib/analyzer/trends";

// Focus goals: a player picks one of their recurring weaknesses on Insights,
// and every game after that is checked against it. The pick lives in your own
// browser (localStorage), like the recent players list, so it needs no account
// and never reaches our server. These helpers are plain functions so they can
// be tested without a browser; the Insights page's focus.tsx does the reading
// and writing.
//
// This only imports types from the analyzer, so the browser code doesn't pull
// in the whole analyzer. The server works out `shows` for every game (see
// checkWeaknesses in src/lib/analyzer/trends.ts) and the browser picks the one
// it needs.

export type Focus = { id: WeaknessId; setAt: number };

// One game, reduced to what the focus panel needs. `shows` answers "did this
// game show the weakness?" for every weakness: true, false, or null when the
// game can't say.
export type FocusGame = {
  matchId: string;
  startedAt: number;
  shows: Record<WeaknessId, boolean | null>;
};

export const FOCUS_KEY = "turnpoint:focus";

// What doing well looks like for each weakness, in a few words. This is the
// measure the panel checks, not advice: the player picked the goal, and the
// panel only reports how each game went.
export const FOCUS_GOALS: Record<WeaknessId, string> = {
  "behind-at-10": "Not behind in gold at 10 minutes",
  "behind-in-cs": "Not behind in CS at 10 minutes",
  "leads-slip": "Winning the games you lead at 15 minutes",
  "cs-drop": "Keeping your CS up after the early game",
  "early-gank": "No deaths to ganks before 14:00",
  "early-solo": "No solo deaths before 14:00",
  "early-lane": "No lost 2v2s before 14:00",
  "early-caught": "Not getting caught out before 14:00",
  "early-teamfight": "No teamfight deaths before 14:00",
  "early-executed": "No deaths to towers or minions before 14:00",
};

// Each player gets their own focus, so looking up a friend doesn't change
// yours. Riot IDs aren't case sensitive, so the key is lowercased.
export function playerKey(region: string, gameName: string, tagLine: string): string {
  return `${region}/${gameName}#${tagLine}`.toLowerCase();
}

// Turns the saved text back into each player's focus. Anything unexpected (no
// saved value yet, a hand-edited value, a weakness that no longer exists) is
// dropped instead of breaking the page.
export function parseFocuses(saved: string | null): Record<string, Focus> {
  if (!saved) return {};
  let data: unknown;
  try {
    data = JSON.parse(saved);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([, focus]) => isFocus(focus)));
}

function isFocus(value: unknown): value is Focus {
  if (typeof value !== "object" || value === null) return false;
  const { id, setAt } = value as Record<string, unknown>;
  return typeof id === "string" && id in FOCUS_GOALS && typeof setAt === "number";
}

// The saved text with one player's focus set, or removed when `focus` is null.
export function saveFocus(saved: string | null, player: string, focus: Focus | null): string {
  const all = parseFocuses(saved);
  if (focus) all[player] = focus;
  else delete all[player];
  return JSON.stringify(all);
}

// One game since the focus was set: true if you avoided the weakness, false if
// it showed up, null if the game can't say.
export type FocusResult = { matchId: string; startedAt: number; avoided: boolean | null };

export type FocusSummary = {
  // Games since the focus was set, oldest first.
  since: FocusResult[];
  // Of those, the games that could say, and how many of them you avoided it in.
  counted: number;
  avoided: number;
  // The same for the games before you set it, out of the games on the page.
  before: { counted: number; avoided: number };
  // Your latest games in a row where you avoided it. Games that can't say
  // don't break a streak.
  streak: number;
};

export function summarizeFocus(games: FocusGame[], focus: Focus): FocusSummary {
  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt);
  const results = sorted.map((g) => ({
    matchId: g.matchId,
    startedAt: g.startedAt,
    avoided: g.shows[focus.id] === null ? null : !g.shows[focus.id],
  }));
  const since = results.filter((r) => r.startedAt > focus.setAt);
  const before = results.filter((r) => r.startedAt <= focus.setAt);

  let streak = 0;
  for (const r of [...since].reverse()) {
    if (r.avoided === null) continue;
    if (!r.avoided) break;
    streak++;
  }

  return { since, ...tally(since), before: tally(before), streak };
}

function tally(results: FocusResult[]): { counted: number; avoided: number } {
  const counted = results.filter((r) => r.avoided !== null);
  return { counted: counted.length, avoided: counted.filter((r) => r.avoided).length };
}
