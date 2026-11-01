import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BoardPlay } from "@/lib/board";
import { Board, ChanceStrip, EvalBar } from "./board";

const PLAYS: BoardPlay[] = [
  { minute: 5, clock: "5:00", grade: "Good", title: "Won a fight 2 for 1", after: 0.55, swing: 3 },
  { minute: 12, clock: "12:00", grade: "Great", title: "Your team took Baron", after: 0.8, swing: 9 },
  { minute: 20, clock: "20:00", grade: "Blunder", title: "Lost a fight 1 for 4", after: 0.3, swing: -12 },
];
const PER_SECOND = new Array(1501).fill(500); // a 25-minute game
const GOLD = [
  { minute: 0, diff: 0 },
  { minute: 25, diff: 1200 },
];

function board(overrides: Partial<Parameters<typeof Board>[0]> = {}) {
  return renderToStaticMarkup(
    <Board
      lead={{
        series: { gold: GOLD, cs: GOLD, xp: GOLD, damage: GOLD },
        opponentName: "Zoe",
      }}
      teamGold={GOLD}
      markers={[]}
      chances={{ perSecond: PER_SECOND, plays: PLAYS }}
      swings={[]}
      quiet={[]}
      note={<p>Where the chance comes from</p>}
      {...overrides}
    />,
  );
}

// There's no browser in these tests (e2e/smoke.spec.ts clicks a real mark), so
// this walks what a component returns to find its buttons.
function buttons(node: ReactNode): ReactElement<{ onClick: () => void; "aria-pressed": boolean }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === "button") {
    return [node as ReactElement<{ onClick: () => void; "aria-pressed": boolean }>];
  }
  return buttons(node.props.children);
}

describe("the win-chance strip", () => {
  const strip = (selected: number, onSelect = vi.fn()) =>
    ChanceStrip({ perSecond: PER_SECOND, plays: PLAYS, selected, onSelect, swings: [] });

  it("has a mark for each play you were in, naming its time, play, grade and chance", () => {
    const html = renderToStaticMarkup(strip(0));
    expect(buttons(strip(0))).toHaveLength(3);
    expect(html).toContain(
      'aria-label="12:00 Your team took Baron, Great. Your team&#x27;s chance to win after it: 80%"',
    );
  });

  it("selects a play when its mark is clicked", () => {
    const onSelect = vi.fn();
    buttons(strip(0, onSelect))[2].props.onClick();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("shows which mark is selected", () => {
    expect(buttons(strip(1)).map((b) => b.props["aria-pressed"])).toEqual([false, true, false]);
  });

  it("puts each mark at its time and chance", () => {
    expect(renderToStaticMarkup(strip(0))).toContain("left:80%;top:70%");
  });

  it("letters the biggest swings on the strip", () => {
    const html = renderToStaticMarkup(
      ChanceStrip({
        perSecond: PER_SECOND,
        plays: [],
        selected: -1,
        onSelect: vi.fn(),
        swings: [{ minute: 10, letter: "A" }],
      }),
    );
    expect(html).toContain("left:40%");
    expect(html).toContain(">A<");
  });
});

describe("the eval bar", () => {
  it("says your team's chance and fills that much blue", () => {
    const html = renderToStaticMarkup(<EvalBar chance={62.4} />);
    expect(html).toContain("Your team&#x27;s chance to win: 62%");
    expect(html).toMatch(/bg-ahead[^>]*flex-grow:62\.4/);
  });
});

describe("the board", () => {
  it("opens on the play that moved the game most, with the eval bar on it", () => {
    const html = board();
    expect(html).toContain("Your team&#x27;s chance to win: 30%");
    expect(html).toContain("Lost a fight 1 for 4");
    expect(html).toContain("Blunder −12.0%");
  });

  it("switches between your opponent and your team, and draws the note", () => {
    const html = board();
    expect(html).toContain("Gold lead");
    expect(html).toContain("Vs your opponent");
    expect(html).toContain("Team");
    expect(html).toContain("Where the chance comes from");
  });

  it("shows team gold and says why with nobody else in your role", () => {
    const html = board({ lead: null });
    expect(html).toContain("Team gold");
    expect(html).toContain("No single enemy played your role this game");
    expect(html).not.toContain("Vs your opponent");
  });

  it("has no eval bar or strip for a game the win chance doesn't cover", () => {
    const html = board({ chances: null });
    expect(html).toContain("Gold lead");
    expect(html).not.toContain("chance to win");
    expect(html).not.toContain("Where the chance comes from");
  });

  it("falls back to the end of the game when you were in no plays", () => {
    const html = board({ chances: { perSecond: [500, 730], plays: [] } });
    expect(html).toContain("Your team&#x27;s chance to win: 73%");
  });

  it("says so under the strip when the game had no big moments", () => {
    const html = board({ quiet: ["No single minute moved the win chance much."] });
    expect(html).toContain("No single minute moved the win chance much.");
  });
});
