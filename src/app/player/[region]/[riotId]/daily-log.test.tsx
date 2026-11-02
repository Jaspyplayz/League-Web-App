import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { groupDays, type LogGame } from "@/lib/daily-log";
import type { ReadDayNotesResult } from "@/lib/match-note";
import { ByDayView } from "./daily-log";

// Saving a note goes to the database; these tests only draw the page.
vi.mock("@/app/account/actions", () => ({ saveDayNoteAction: vi.fn() }));

// Times in this computer's own timezone, like the browser groups them.
const at = (month: number, day: number, hour: number) =>
  new Date(2026, month - 1, day, hour).getTime();
const NOW = at(10, 31, 20);

function game(startedAt: number, win: boolean, extra: Partial<LogGame> = {}): LogGame {
  return {
    matchId: `KR_${startedAt}`,
    startedAt,
    win,
    ranked: true,
    championLabel: "Galio",
    championIcon: null,
    kills: 7,
    deaths: 4,
    assists: 6,
    score: 51,
    shows: null,
    recap: null,
    ...extra,
  };
}

// 17 October: two wins and a loss.
const OCTOBER = groupDays(
  [game(at(10, 17, 14), true), game(at(10, 17, 15), false), game(at(10, 17, 16), true)],
  [],
);

function render(days = OCTOBER, notes: ReadDayNotesResult | null = null): string {
  return renderToStaticMarkup(
    <ByDayView days={days} now={NOW} stored notes={notes} player="kr:hide on bush#kr1" playerPath="/player/kr/x" />,
  );
}

describe("By day", () => {
  it("opens on the newest game's month, with a panel for each day", () => {
    const html = render();
    expect(html).toContain("October 2026");
    expect(html).toContain(">Days</h2>");
    expect(html).toContain("Sat 17 Oct");
    expect(html).toContain("14 days ago");
    expect(html).toContain("2W 1L</b>");
    expect(html).toContain("· 3 games");
  });

  it("colours the day blue and outlines today", () => {
    const html = render();
    expect(html).toMatch(/href="#day-2026-10-17"[^>]*bg-ahead-fill/);
    expect(html).toMatch(/ring-main[^>]*><span aria-hidden="true">31<\/span><span class="sr-only">Sat 31 Oct, today: no games/);
  });

  it("colours a lost day red, a tie grey and a day with no games the raised fill", () => {
    const days = groupDays(
      [
        game(at(10, 20, 14), false),
        game(at(10, 21, 14), true),
        game(at(10, 21, 15), false),
      ],
      [],
    );
    const html = render(days);
    expect(html).toMatch(/href="#day-2026-10-20"[^>]*bg-behind-fill/);
    expect(html).toMatch(/href="#day-2026-10-21"[^>]*bg-divider/);
    expect(html).toMatch(/bg-raised text-quiet"><span aria-hidden="true">22<\/span>/);
  });

  it("only moves between the months the last four weeks touch", () => {
    // 31 October: the four weeks start on 4 October, so October is the only month.
    const october = render();
    expect(october).toMatch(/aria-label="Previous month"[^>]*disabled=""/);
    expect(october).toMatch(/aria-label="Next month"[^>]*disabled=""/);
    // 2 November: the four weeks reach back into October, and it opens there.
    const html = renderToStaticMarkup(
      <ByDayView days={OCTOBER} now={at(11, 2, 12)} stored notes={null} player="p" playerPath="/player/kr/x" />,
    );
    expect(html).toContain("October 2026");
    expect(html).not.toMatch(/aria-label="Next month"[^>]*disabled=""/);
  });

  it("leaves out a game from the day before the four weeks", () => {
    // The server fetches a day extra. A game 28 days back from 28 October
    // (30 September) isn't in the four weeks, so the calendar opens on
    // October rather than on a September it couldn't leave.
    const days = groupDays([game(at(9, 30, 23), true)], []);
    const html = renderToStaticMarkup(
      <ByDayView days={days} now={at(10, 28, 22)} stored notes={null} player="p" playerPath="/player/kr/x" />,
    );
    expect(html).toContain("October 2026");
    expect(html).toContain("No games in the last 4 weeks");
    expect(html).not.toContain("Wed 30 Sep");
  });

  it("lists the games as links to their match page", () => {
    const html = render();
    expect(html).toContain('href="/player/kr/x/match/KR_');
    expect(html).toContain('<span class="sr-only">Win,</span>');
    expect(html).toContain('<span class="sr-only">Loss,</span>');
    expect(html).toContain('<span class="sr-only">, score </span>51');
  });

  it("shows the note box only on the player's own profile", () => {
    expect(render()).not.toContain("Your note for this day");
    const notes: ReadDayNotesResult = { ok: true, byDay: { "2026-10-17": "Stop forcing level 2 fights." } };
    const html = render(OCTOBER, notes);
    expect(html).toContain("Your note for this day");
    expect(html).toContain("Stop forcing level 2 fights.");
  });

  it("says when the notes couldn't be loaded, in each day where the box would go", () => {
    const twoDays = groupDays([game(at(10, 17, 14), true), game(at(10, 20, 14), false)], []);
    const html = render(twoDays, { ok: false });
    // Once above the days, as an alert...
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain("Your notes couldn&#x27;t be loaded");
    // ...and inside every day panel, instead of its note box.
    const panels = html.split("<article").slice(1);
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(panel).toContain("Your note for this day couldn&#x27;t be loaded.");
      expect(panel).not.toContain("<textarea");
    }
  });

  it("keeps the calendar with no games, and says what will fill it", () => {
    const html = render([]);
    expect(html).toContain("October 2026");
    expect(html).toContain("No games in the last 4 weeks");
    expect(html).toContain("Days you play fill in on the calendar");
    // No "Days" heading, so the browser test finds one or the other, never both.
    expect(html).not.toContain(">Days</h2>");
  });
});
