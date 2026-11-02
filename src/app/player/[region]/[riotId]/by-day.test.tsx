import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { groupDays } from "@/lib/daily-log";
import { loadMatches, loadTimelines } from "@/lib/match-store";
import { loadRankHistory } from "@/lib/profile-store";
import { readQueueFilter } from "@/lib/queue-filters";
import type { RankPoint } from "@/lib/rank-history";
import { getMatchIds } from "@/lib/riot/api";
import { ByDay } from "./by-day";
import { ByDayView, DailyLog } from "./daily-log";

vi.mock("server-only", () => ({}));
vi.mock("@/app/account/actions", () => ({ saveDayNoteAction: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({ getMatchIds: vi.fn() }));
vi.mock("@/lib/match-store", () => ({ loadMatches: vi.fn(), loadTimelines: vi.fn() }));
vi.mock("@/lib/profile-store", () => ({ loadRankHistory: vi.fn() }));
vi.mock("@/lib/recap-store", () => ({ readRecapHeadlines: async () => new Map() }));
vi.mock("@/lib/ddragon", () => ({
  getDataDragon: async () => null,
  championName: (_dd: null, name: string) => name,
}));
// Signed out, so By day reads no notes and no session.
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/day-note-store", () => ({ readDayNotes: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn() }));

// Times in this computer's own timezone, like the browser groups them.
const at = (month: number, day: number, hour: number) =>
  new Date(2026, month - 1, day, hour).getTime();
const NOW = at(10, 31, 20);

// Two ranked solo games on 17 October. player-1 is on the blue side, which
// loses in the test fixtures.
function soloGame(id: string, startedAt: number) {
  const game = match(participants());
  return {
    ...game,
    metadata: { matchId: id },
    info: { ...game.info, gameStartTimestamp: startedAt },
  };
}
const GAMES = [soloGame("NA1_1", at(10, 17, 14)), soloGame("NA1_2", at(10, 17, 15))];

// The saved ranks around those two games: Gold II 50 LP before, 20 LP after.
function soloRank(recordedAt: number, leaguePoints: number, losses: number): RankPoint {
  return {
    queueType: "RANKED_SOLO_5x5",
    tier: "GOLD",
    rank: "II",
    leaguePoints,
    wins: 10,
    losses,
    recordedAt: new Date(recordedAt),
  };
}
const HISTORY = [soloRank(at(10, 17, 10), 50, 10), soloRank(at(10, 17, 18), 20, 12)];

beforeEach(() => {
  vi.mocked(getMatchIds).mockReset().mockResolvedValue(GAMES.map((g) => g.metadata.matchId));
  vi.mocked(loadMatches).mockReset().mockResolvedValue({ matches: GAMES, waiting: 0, error: null });
  vi.mocked(loadTimelines).mockReset().mockResolvedValue({ timelines: new Map(), error: null });
  vi.mocked(loadRankHistory).mockReset().mockResolvedValue(HISTORY);
});

// By day's day panels, as the browser draws them. DailyLog itself only draws
// "Loading your days…" outside a browser, because days depend on the
// viewer's timezone, so this draws its days the way it does once loaded.
async function renderByDay(stored: boolean): Promise<string> {
  const page = (await ByDay({
    region: "na",
    puuid: "player-1",
    gameName: "Player1",
    tagLine: "NA1",
    playerPath: "/player/na/Player1-NA1",
    queue: readQueueFilter(undefined),
    stored,
  })) as ReactElement<{ children: ReactNode }>;
  const log = Children.toArray(page.props.children).find(
    (child) => isValidElement(child) && child.type === DailyLog,
  ) as ReactElement<ComponentProps<typeof DailyLog>>;
  const { games, ranks, notes, player, playerPath } = log.props;
  return renderToStaticMarkup(
    <ByDayView
      days={groupDays(games, ranks)}
      now={NOW}
      notes={notes}
      player={player}
      playerPath={playerPath}
    />,
  );
}

// The saved rank history belongs to the server the profile is saved for, so
// another server's By day mustn't work out LP from it (JAS-147, like the rank
// card's graph in JAS-41).
describe("By day's LP", () => {
  it("works out the day's LP from the saved ranks on the profile's own server", async () => {
    const html = await renderByDay(true);
    expect(loadRankHistory).toHaveBeenCalledWith("player-1", expect.any(Date));
    expect(html).toContain("0W 2L</b>");
    expect(html).toContain("30 LP lost");
  });

  it("shows no LP on another server's page", async () => {
    const html = await renderByDay(false);
    expect(loadRankHistory).not.toHaveBeenCalled();
    expect(html).toContain("0W 2L</b>");
    expect(html).not.toMatch(/LP (lost|gained|even)/);
    expect(html).toContain("LP not recorded");
  });
});
