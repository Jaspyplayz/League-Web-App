import Link from "next/link";
import { EmptyPanel, secondButtonClass } from "@/components/ui/state-panel";
import { GAME_WINDOWS, type GameWindow } from "@/lib/insights-filters";

// Trends from one or two games would be noise, so the charts wait for a few.
export const MIN_GAMES = 3;

// The next bigger window after this one, or null at the biggest (100).
export function biggerWindow(window: GameWindow): GameWindow | null {
  return GAME_WINDOWS.find((w) => w > window) ?? null;
}

// "Look at the last 50 games": the one way forward when a window has too few
// games, keeping the page's other choices. None at 100, the biggest window.
function BiggerWindowLink({
  window,
  insightsPath,
  keep,
}: {
  window: GameWindow;
  insightsPath: string;
  keep: Record<string, string>;
}) {
  const next = biggerWindow(window);
  if (!next) return null;
  const query = new URLSearchParams({ ...keep, games: String(next) });
  return (
    <Link href={`${insightsPath}?${query}`} className={secondButtonClass}>
      Look at the last {next} games
    </Link>
  );
}

// Fewer than MIN_GAMES games the analyzer can read in the whole window.
export function NotEnoughGames({
  window,
  skipped,
  insightsPath,
  keep,
}: {
  window: GameWindow;
  // Games in the window that have no role matchup (ARAM, Arena, remakes).
  skipped: number;
  insightsPath: string;
  keep: Record<string, string>;
}) {
  return (
    <EmptyPanel
      title="Not enough games to spot trends yet"
      action={<BiggerWindowLink window={window} insightsPath={insightsPath} keep={keep} />}
    >
      Insights need at least {MIN_GAMES} recent games on Summoner&apos;s Rift that lasted 15
      minutes or more.
      {skipped > 0 && ` ${skipped} of your last ${window} were ARAM, Arena, remakes or similar.`}
    </EmptyPanel>
  );
}

// Enough games overall, but too few on the champion picked in the filter bar.
export function TooFewOnChampion({
  name,
  games,
  window,
  insightsPath,
  keep,
}: {
  name: string; // the champion's name as players know it, e.g. "Wukong"
  games: number;
  window: GameWindow;
  insightsPath: string;
  keep: Record<string, string>;
}) {
  const bigger = biggerWindow(window) !== null;
  return (
    <EmptyPanel
      title={
        games === 0
          ? `No ${name} games in your last ${window}`
          : `Only ${games} ${name} ${games === 1 ? "game" : "games"} in your last ${window}`
      }
      action={<BiggerWindowLink window={window} insightsPath={insightsPath} keep={keep} />}
    >
      Trends need at least {MIN_GAMES}.{" "}
      {bigger ? "Try a bigger window, or pick another champion." : "Try another champion."}
    </EmptyPanel>
  );
}
