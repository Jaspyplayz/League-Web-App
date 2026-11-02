import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MARK_GRADES } from "@/components/ui/grade-mark";
import type { BoardPlay } from "@/lib/board";
import { GameReview, gradeCounts, StepButtons, type GameReviewProps } from "./game-review";
import { ReviewLinksContext, type ReviewLinks } from "./review-links";
import { SummaryColumns } from "./summary-columns";

const REST = { before: 0.5, moment: null };
const PLAYS: BoardPlay[] = [
  {
    ...REST,
    at: 300_000,
    minute: 5,
    clock: "5:00",
    grade: "Good",
    title: "Won a fight 2 for 1",
    lines: ["5:00 Syndra killed Zoe"],
    after: 0.55,
    swing: 3,
  },
  {
    ...REST,
    at: 720_000,
    minute: 12,
    clock: "12:00",
    grade: "Great",
    title: "Your team took Baron",
    lines: ["12:00 Your team took Baron"],
    after: 0.8,
    swing: 9,
    moment: { question: "What set this up?", tempo: null, noteLine: "12:00 Your team took Baron: " },
  },
  {
    ...REST,
    at: 1_200_000,
    minute: 20,
    clock: "20:00",
    grade: "Great",
    title: "Won a fight 4 for 1",
    lines: ["20:00 Syndra killed Vi"],
    after: 0.95,
    swing: 15,
  },
];
const SCORES = [
  { label: "Overall", span: "Whole game", score: 71 },
  { label: "Early", span: "0 to 14 min", score: 64 },
];
const LINKS: ReviewLinks = {
  replayRequest: null,
  noteRequest: null,
  watch: vi.fn(),
  addNote: vi.fn(),
};

function review(overrides: Partial<GameReviewProps> = {}) {
  return renderToStaticMarkup(
    <ReviewLinksContext value={LINKS}>
      <GameReview
        scores={SCORES}
        plays={PLAYS}
        selected={1}
        onSelect={vi.fn()}
        notes
        {...overrides}
      />
    </ReviewLinksContext>,
  );
}

// There's no browser in these tests (e2e/smoke.spec.ts clicks the real thing),
// so this walks what a component returns to find its buttons, drawing the
// components inside it, such as StepButton, which have no hooks.
type ButtonProps = { onClick: () => void; "aria-label": string; "aria-disabled": boolean };
function buttons(node: ReactNode): ReactElement<ButtonProps>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === "button") return [node as ReactElement<ButtonProps>];
  if (typeof node.type === "function") {
    const draw = node.type as (props: unknown) => ReactNode;
    return buttons(draw(node.props));
  }
  return buttons(node.props.children);
}

describe("the grade counts", () => {
  it("counts all eleven grades, with a dash for the three the analyzer can't award yet", () => {
    const counts = gradeCounts(PLAYS);
    expect(counts.map((c) => c.grade)).toEqual([...MARK_GRADES]);
    expect(counts.filter((c) => c.count === null).map((c) => c.grade)).toEqual([
      "Best",
      "Book",
      "Miss",
    ]);
    expect(counts.find((c) => c.grade === "Great")?.count).toBe(2);
    expect(counts.find((c) => c.grade === "Blunder")?.count).toBe(0);
  });

  it("shows the dash and the eleven marks on the page", () => {
    const html = review();
    expect(html.match(/data-grade="Book"/g)).toHaveLength(1);
    expect(html).toMatch(/Book<\/span><span[^>]*>–</);
    expect(html).toMatch(/Blunder<\/span><span[^>]*>0</);
  });
});

describe("the step buttons", () => {
  const steps = (selected: number, onSelect = vi.fn()) =>
    buttons(StepButtons({ selected, count: 3, onSelect }));
  const off = (selected: number) =>
    steps(selected)
      .filter((b) => b.props["aria-disabled"])
      .map((b) => b.props["aria-label"]);

  it("go to the first, previous, next and last play", () => {
    const onSelect = vi.fn();
    const [first, previous, next, last] = steps(1, onSelect);
    first.props.onClick();
    previous.props.onClick();
    next.props.onClick();
    last.props.onClick();
    expect(onSelect.mock.calls.map(([to]) => to)).toEqual([0, 0, 2, 2]);
  });

  it("can't go before the first play or past the last", () => {
    expect(off(0)).toEqual(["First play", "Previous play"]);
    expect(off(1)).toEqual([]);
    expect(off(2)).toEqual(["Next play", "Last play"]);
  });

  it("do nothing at the ends", () => {
    const onSelect = vi.fn();
    steps(0, onSelect)[0].props.onClick();
    steps(2, onSelect)[3].props.onClick();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("aren't there with no plays to step through", () => {
    const html = review({ plays: [], selected: -1 });
    expect(html).not.toContain("Previous play");
    expect(html).not.toContain("Start review in the replay");
    expect(html).toContain("You weren&#x27;t in any fight or epic monster this game.");
  });
});

describe("game review", () => {
  it("lists your plays in time order and marks the selected one", () => {
    const html = review();
    expect(html.indexOf("5:00")).toBeLessThan(html.indexOf("12:00"));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true".*Your team took Baron/);
  });

  it("says which of your plays is open, since the rest can be scrolled out of view", () => {
    expect(review({ selected: 1 })).toContain("2 of 3");
  });

  it("opens only the selected play, with its chance and events", () => {
    const html = review({ selected: 0 });
    expect(html).toContain("5:00 Syndra killed Zoe");
    expect(html).toContain("from 50.0% to 55.0%");
    expect(html).not.toContain("12:00 Your team took Baron");
  });

  it("shows a moment's question and Add to notes, and only a moment's", () => {
    const moment = review({ selected: 1 });
    expect(moment).toContain("What set this up?");
    expect(moment).toContain("Add to notes");
    const other = review({ selected: 2 });
    expect(other).not.toContain("What set this up?");
    expect(other).not.toContain("Add to notes");
    expect(other).toContain("Watch in replay");
  });

  it("hides Add to notes when there's no notes box", () => {
    expect(review({ selected: 1, notes: false })).not.toContain("Add to notes");
  });

  it("says when you have no 60-second review", () => {
    const plays = PLAYS.map((p) => ({ ...p, moment: null }));
    const html = review({ plays, selected: 0 });
    expect(html).toContain("so there&#x27;s no 60-second review");
    expect(html).not.toContain(">60s<");
  });

  it("keeps the scores and says why for a game the win chance doesn't cover", () => {
    const html = review({ plays: null, selected: -1 });
    expect(html).toContain("Overall");
    expect(html).toContain(">71<");
    expect(html).toContain("so its plays have no grades");
    expect(html).not.toContain("Grades of your plays");
  });
});

describe("the summary's columns", () => {
  const columns = (plays: BoardPlay[] | null, scores = SCORES) =>
    renderToStaticMarkup(
      <ReviewLinksContext value={LINKS}>
        <SummaryColumns
          board={{
            lead: null,
            teamGold: [
              { minute: 0, diff: 0 },
              { minute: 25, diff: 1200 },
            ],
            markers: [],
            chances: plays && { perSecond: new Array(1501).fill(500), plays },
            swings: [],
            quiet: [],
            note: null,
          }}
          review={{ scores, notes: false }}
        >
          <p>Scoreboard</p>
        </SummaryColumns>
      </ReviewLinksContext>,
    );

  it("opens the board and Game review on the same play: the one that moved the game most", () => {
    const html = columns(PLAYS);
    expect(html).toContain("Your team&#x27;s chance to win: 95%");
    expect(html).toMatch(/aria-current="true".*Won a fight 4 for 1/);
    expect(html).toContain("20:00 Syndra killed Vi");
  });

  it("has one column rather than a blank one when there's no Game review to draw", () => {
    const html = columns(null, []);
    expect(html).not.toContain("game-review-heading");
    expect(html).not.toContain("380px");
    expect(html).toContain("Scoreboard");
    expect(columns(null)).toContain("380px");
  });

  it("puts Game review under the board and above the rest, for phones", () => {
    const html = columns(PLAYS);
    expect(html.indexOf("board-heading")).toBeLessThan(html.indexOf("game-review-heading"));
    expect(html.indexOf("game-review-heading")).toBeLessThan(html.indexOf("Scoreboard"));
  });
});
