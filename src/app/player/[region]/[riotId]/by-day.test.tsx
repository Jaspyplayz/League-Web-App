import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { getCurrentUser } from "@/lib/auth";
import { groupDays } from "@/lib/daily-log";
import { readDayNotes } from "@/lib/day-note-store";
import { loadMatches, loadTimelines } from "@/lib/match-store";
import { readMyPlayer } from "@/lib/my-player";
import { loadRankHistory } from "@/lib/profile-store";
import { readQueueFilter } from "@/lib/queue-filters";
import type { RankPoint } from "@/lib/rank-history";
import { getMatchIds } from "@/lib/riot/api";
import { supabaseConfig } from "@/lib/supabase/config";
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
// Signed out unless a test turns sign-in on, so By day reads no notes and no
// session.
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: vi.fn() }));
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
  vi.mocked(supabaseConfig).mockReset().mockReturnValue(null);
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(null);
  vi.mocked(readMyPlayer).mockReset();
  vi.mocked(readDayNotes).mockReset();
});

// What By day hands its DailyLog: the games, ranks and notes for player-1's
// profile.
async function byDayLog(stored: boolean): Promise<ComponentProps<typeof DailyLog>> {
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
  ) as ReactElement<ComponentProps<typeof DailyLog>> | undefined;
  if (!log) throw new Error("ByDay didn't render DailyLog as a direct child");
  return log.props;
}

// By day's day panels, as the browser draws them. DailyLog itself only draws
// "Loading your days…" outside a browser, because days depend on the
// viewer's timezone, so this draws its days the way it does once loaded.
function draw({ games, ranks, stored, notes, player, playerPath }: ComponentProps<typeof DailyLog>): string {
  return renderToStaticMarkup(
    <ByDayView
      days={groupDays(games, ranks)}
      now={NOW}
      stored={stored}
      notes={notes}
      player={player}
      playerPath={playerPath}
    />,
  );
}

async function renderByDay(stored: boolean): Promise<string> {
  return draw(await byDayLog(stored));
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
    expect(html).toContain("a day with no update in between says");
  });

  it("shows no LP on another server's page", async () => {
    const html = await renderByDay(false);
    expect(loadRankHistory).not.toHaveBeenCalled();
    expect(html).toContain("0W 2L</b>");
    expect(html).not.toMatch(/LP (lost|gained|even|not recorded)/);
    // Said once, under the days, instead of "LP not recorded" on each one.
    expect(html).toContain("Turnpoint saves ranks only on the server this profile is saved for");
  });
});

// Day notes are private: only the profile the signed-in account marked "This
// is me" reads them and shows a box to write one (JAS-256). Every other test
// here runs signed out, which skips these checks.
describe("By day's notes", () => {
  // The account's saved notes: one on 17 October, the day of both games.
  const notes = { ok: true as const, byDay: { "2026-10-17": "Stop forcing level 2 fights." } };
  // The account marked `puuid` as "This is me".
  const marked = (puuid: string) => ({
    ok: true as const,
    player: { puuid, region: "na" as const, gameName: "Someone", tagLine: "NA1", profileIconId: null },
  });

  beforeEach(() => {
    vi.mocked(supabaseConfig).mockReturnValue({ url: "https://example.supabase.co", key: "publishable" });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "Jaspy", provider: null });
    vi.mocked(readDayNotes).mockResolvedValue(notes);
  });

  it("shows the account's notes on the profile it marked as its own", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue(marked("player-1"));
    const log = await byDayLog(true);
    expect(readDayNotes).toHaveBeenCalledWith("user-1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(log.notes).toEqual(notes);
    const html = draw(log);
    expect(html).toContain("Your note for this day");
    expect(html).toContain("Stop forcing level 2 fights.");
  });

  // Otherwise your notes, and a box that saves to your days, would show on
  // the By day of whoever you look up.
  it("reads no notes on a profile the account didn't mark", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue(marked("player-2"));
    const log = await byDayLog(true);
    expect(readMyPlayer).toHaveBeenCalledWith("user-1");
    expect(readDayNotes).not.toHaveBeenCalled();
    expect(log.notes).toBeNull();
    const html = draw(log);
    expect(html).not.toContain("Your note for this day");
    expect(html).not.toContain("Stop forcing level 2 fights.");
  });

  it("reads no notes when the account hasn't marked any profile", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player: null });
    const log = await byDayLog(true);
    expect(readMyPlayer).toHaveBeenCalledWith("user-1");
    expect(readDayNotes).not.toHaveBeenCalled();
    expect(log.notes).toBeNull();
  });

  // #167: a failed read can't say whose profile this is, so it shows no note
  // box and says the notes couldn't be loaded.
  it("says the notes couldn't be loaded when it can't read which profile is the account's", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: false });
    const log = await byDayLog(true);
    expect(readDayNotes).not.toHaveBeenCalled();
    expect(log.notes).toEqual({ ok: false });
    const html = draw(log);
    expect(html).toContain("Your notes couldn&#x27;t be loaded");
    expect(html).not.toContain("<textarea");
  });
});
