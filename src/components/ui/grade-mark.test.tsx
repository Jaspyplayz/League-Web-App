import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GRADES } from "@/lib/analyzer/plays";
import { GRADE_LOOKS, GradeMark, MARK_GRADES } from "./grade-mark";

describe("GradeMark", () => {
  it("has a mark for every grade the analyzer gives", () => {
    for (const grade of GRADES) expect(MARK_GRADES).toContain(grade);
  });

  // Grades must differ in shape, not only colour, for colour-blind players.
  it("gives each grade its own symbol", () => {
    const symbols = MARK_GRADES.map((grade) => GRADE_LOOKS[grade].symbol);
    expect(new Set(symbols).size).toBe(MARK_GRADES.length);
  });

  it("draws a circle in the grade's colour with its symbol", () => {
    const html = renderToStaticMarkup(<GradeMark grade="Inaccuracy" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("fill-grade-inaccuracy");
    expect(html).toContain("?!");
  });
});
