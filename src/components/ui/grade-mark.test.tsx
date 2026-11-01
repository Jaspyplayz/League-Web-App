import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GRADES } from "@/lib/analyzer/plays";
import { GradeMark, MARK_GRADES } from "./grade-mark";

// What's drawn on top of the circle: its symbol, as a player sees it.
function symbolOf(html: string): string {
  return html.replace(/^.*?<circle[^>]*\/>/, "").replace(/<\/svg>$/, "");
}

describe("GradeMark", () => {
  it("has a mark for every grade the analyzer gives", () => {
    for (const grade of GRADES) expect(MARK_GRADES).toContain(grade);
  });

  it("draws each grade's circle in its own grade colour", () => {
    for (const grade of MARK_GRADES) {
      const html = renderToStaticMarkup(<GradeMark grade={grade} />);
      expect(html).toContain(`fill-grade-${grade.toLowerCase()}`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  // Grades must differ in shape, not only colour, for colour-blind players.
  it("draws a different symbol on each grade", () => {
    const symbols = MARK_GRADES.map((grade) => symbolOf(renderToStaticMarkup(<GradeMark grade={grade} />)));
    expect(symbols.every((symbol) => symbol.length > 0)).toBe(true);
    expect(new Set(symbols).size).toBe(MARK_GRADES.length);
  });

  it("writes the two-character symbols as text", () => {
    expect(renderToStaticMarkup(<GradeMark grade="Inaccuracy" />)).toContain(">?!</text>");
    expect(renderToStaticMarkup(<GradeMark grade="Blunder" />)).toContain(">??</text>");
  });
});
