import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { LOG_DAYS } from "@/lib/daily-log";
import { writeDayNote } from "@/lib/day-note-store";
import { forgetMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { saveDayNoteAction, toggleMyPlayer } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ saveMyPlayer: vi.fn(), forgetMyPlayer: vi.fn() }));
vi.mock("@/lib/day-note-store", () => ({ writeDayNote: vi.fn() }));
// The other actions' modules, which these tests don't use.
vi.mock("@/lib/ask-store", () => ({}));
vi.mock("@/lib/recap-store", () => ({}));
vi.mock("@/lib/match-note-store", () => ({}));
vi.mock("@/lib/riot/api", () => ({}));
vi.mock("@/lib/riot/client", () => ({ RiotApiError: class extends Error {} }));

function form(puuid: string, intent?: string): FormData {
  const data = new FormData();
  data.set("puuid", puuid);
  if (intent !== undefined) data.set("intent", intent);
  return data;
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(saveMyPlayer).mockReset();
  vi.mocked(forgetMyPlayer).mockReset();
});

describe("toggleMyPlayer", () => {
  it("clears only this profile's mark when the form says clear", async () => {
    await toggleMyPlayer(form("player-1", "clear"));
    expect(forgetMyPlayer).toHaveBeenCalledWith("user-1", "player-1");
    expect(saveMyPlayer).not.toHaveBeenCalled();
  });

  it("marks the profile when the form says mark", async () => {
    await toggleMyPlayer(form("player-2", "mark"));
    expect(saveMyPlayer).toHaveBeenCalledWith("user-1", "player-2");
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });

  // #167: the action used to read what's marked and toggle it, so a failed
  // or stale read turned a click meant to mark into one that cleared. Now
  // the form says which, and a form that doesn't changes nothing.
  it.each([undefined, "", "toggle"])("changes nothing when the form's intent is %s", async (intent) => {
    await toggleMyPlayer(form("player-1", intent));
    expect(saveMyPlayer).not.toHaveBeenCalled();
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });

  it("changes nothing when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await toggleMyPlayer(form("player-1", "clear"));
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// "2026-11-02" for the UTC day `ms` falls on.
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// The days By day shows a player whose clock is `offsetHours` ahead of UTC
// (behind when negative): their today and the LOG_DAYS - 1 days before it.
function shownDays(now: number, offsetHours: number): string[] {
  return Array.from({ length: LOG_DAYS }, (_, i) => utcDay(now + offsetHours * HOUR - i * DAY));
}

const REFUSED = { status: "failed", message: "Couldn't save the note for this day." };

describe("saveDayNoteAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"));
    vi.mocked(writeDayNote).mockReset();
    vi.mocked(writeDayNote).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a note on today", async () => {
    expect(await saveDayNoteAction("2026-11-02", "Tilted after game 3")).toEqual({ status: "saved" });
    expect(writeDayNote).toHaveBeenCalledWith("user-1", "2026-11-02", "Tilted after game 3");
  });

  // JAS-212: any real date from 0100 to 9999 used to save, so one account
  // could write millions of notes and fill the database. By day only shows
  // the last four weeks, so a day far from today is never one it sent.
  it.each(["3021-05-05", "9999-12-31", "2000-01-01", "0100-01-01"])(
    "refuses %s and writes nothing",
    async (day) => {
      expect(await saveDayNoteAction(day, "note")).toEqual(REFUSED);
      expect(writeDayNote).not.toHaveBeenCalled();
    },
  );

  it("refuses a far-off day when the note is empty too, so nothing is deleted", async () => {
    expect(await saveDayNoteAction("3021-05-05", "")).toEqual(REFUSED);
    expect(writeDayNote).not.toHaveBeenCalled();
  });

  // The window is UTC today minus LOG_DAYS through UTC tomorrow, and it's
  // the same from the first millisecond of the UTC day to the last.
  describe.each(["2026-11-02T00:00:00.000Z", "2026-11-02T12:00:00.000Z", "2026-11-02T23:59:59.999Z"])(
    "at %s",
    (time) => {
      beforeEach(() => {
        vi.setSystemTime(new Date(time));
      });

      it.each(["2026-10-05", "2026-11-03"])("saves on %s, an edge of the window", async (day) => {
        expect(await saveDayNoteAction(day, "note")).toEqual({ status: "saved" });
        expect(writeDayNote).toHaveBeenCalledWith("user-1", day, "note");
      });

      it.each(["2026-10-04", "2026-11-04"])("refuses %s, a day past an edge", async (day) => {
        expect(await saveDayNoteAction(day, "note")).toEqual(REFUSED);
        expect(writeDayNote).not.toHaveBeenCalled();
      });
    },
  );

  // Every timezone in use is between UTC-12 and UTC+14, and the server only
  // knows UTC. A player at either end, just after or just before UTC
  // midnight, sees days a whole day off the server's, which is what the
  // spare day on each side of the window is for.
  it.each([
    { time: "2026-11-02T00:00:00.000Z", offset: -12 },
    { time: "2026-11-02T00:00:00.000Z", offset: 14 },
    { time: "2026-11-02T23:59:59.999Z", offset: -12 },
    { time: "2026-11-02T23:59:59.999Z", offset: 14 },
    { time: "2026-11-02T12:00:00.000Z", offset: 0 },
  ])("saves on every day By day shows at UTC$offset, at $time", async ({ time, offset }) => {
    const now = new Date(time).getTime();
    vi.setSystemTime(now);
    for (const day of shownDays(now, offset)) {
      expect(await saveDayNoteAction(day, "note"), day).toEqual({ status: "saved" });
    }
    expect(writeDayNote).toHaveBeenCalledTimes(LOG_DAYS);
  });
});
