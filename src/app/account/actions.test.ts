import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { LOG_DAYS, recentDays } from "@/lib/daily-log";
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

const DAY = 24 * 60 * 60 * 1000;

const REFUSED = {
  status: "failed",
  message: "Couldn't save the note for this day. Reload the page and try again.",
};

// Where the server might run: UTC, as Vercel does, and each end of the range
// of timezones in use. Etc/GMT+12 is UTC-12; the sign is backwards in these
// names.
const SERVER_ZONES = ["UTC", "Etc/GMT+12", "Pacific/Kiritimati"];
// Where the player might be: each end of the range, UTC, Los Angeles, whose
// clocks went back an hour on 1 November 2026, inside the four weeks before
// the tests' November dates, and Kathmandu, 5 hours 45 minutes ahead of UTC.
const BROWSER_ZONES = [
  "Etc/GMT+12",
  "America/Los_Angeles",
  "UTC",
  "Asia/Kathmandu",
  "Pacific/Kiritimati",
];

describe("saveDayNoteAction", () => {
  // Node switches timezone as soon as TZ is set, so the tests below move the
  // server and the browser between zones by setting it.
  const startZone = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"));
    vi.mocked(writeDayNote).mockReset();
    vi.mocked(writeDayNote).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Setting TZ to undefined would set it to the text "undefined".
    if (startZone === undefined) delete process.env.TZ;
    else process.env.TZ = startZone;
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

  it("refuses a far-off day whatever the note says, even an empty one", async () => {
    expect(await saveDayNoteAction("3021-05-05", "")).toEqual(REFUSED);
    expect(writeDayNote).not.toHaveBeenCalled();
  });

  describe.each(SERVER_ZONES)("with the server at %s", (serverZone) => {
    // The window is UTC today minus 29 days through the day after tomorrow,
    // whatever the server's own timezone, from the first millisecond of the
    // UTC day to the last.
    describe.each(["2026-11-02T00:00:00.000Z", "2026-11-02T12:00:00.000Z", "2026-11-02T23:59:59.999Z"])(
      "at %s",
      (time) => {
        beforeEach(() => {
          vi.setSystemTime(new Date(time));
          process.env.TZ = serverZone;
        });

        it.each(["2026-10-04", "2026-11-04"])("saves on %s, an edge of the window", async (day) => {
          expect(await saveDayNoteAction(day, "note")).toEqual({ status: "saved" });
          expect(writeDayNote).toHaveBeenCalledWith("user-1", day, "note");
        });

        it.each(["2026-10-03", "2026-11-05"])("refuses %s, a day past an edge", async (day) => {
          expect(await saveDayNoteAction(day, "note")).toEqual(REFUSED);
          expect(writeDayNote).not.toHaveBeenCalled();
        });
      },
    );

    // By day's days come from recentDays, run in the player's browser. This
    // runs it in the player's timezone at the moments their dates are
    // furthest from UTC's, and at New Year, then saves every day it gives in
    // the server's timezone. It does that for a page loaded just now, one
    // loaded a day ago, and one whose clock is a day fast: the spare days.
    it.each(BROWSER_ZONES)("saves every day By day shows a player at %s", async (browserZone) => {
      const times = [
        "2026-11-02T00:00:00.000Z",
        "2026-11-02T23:59:59.999Z",
        "2026-12-31T23:59:59.999Z",
        "2027-01-01T00:00:00.000Z",
      ];
      for (const time of times) {
        const now = Date.parse(time);
        vi.setSystemTime(now);
        for (const page of [now, now - DAY, now + DAY]) {
          process.env.TZ = browserZone;
          const days = recentDays(page, LOG_DAYS);
          process.env.TZ = serverZone;
          for (const day of days) {
            const where = `${day}, at ${time} on a page whose clock said ${new Date(page).toISOString()}`;
            expect(await saveDayNoteAction(day, "note"), where).toEqual({ status: "saved" });
          }
        }
      }
      expect(writeDayNote).toHaveBeenCalledTimes(4 * 3 * LOG_DAYS);
    });
  });
});
