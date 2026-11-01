import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiffChart } from "./diff-chart";

const POINTS = [
  { minute: 0, diff: 0 },
  { minute: 10, diff: 1000 },
  { minute: 20, diff: -1000 },
];

function chart(props: Partial<Parameters<typeof DiffChart>[0]> = {}) {
  return renderToStaticMarkup(<DiffChart points={POINTS} description="A test chart" {...props} />);
}

// The cursor is the only <line> in the main text colour; x1 is where it sits.
function cursorX(html: string): number | null {
  const found = html.match(/<line x1="([\d.]+)"[^>]*stroke="var\(--color-main\)"/);
  return found ? Number(found[1]) : null;
}

describe("DiffChart", () => {
  it("has no cursor line unless it's given a minute", () => {
    expect(cursorX(chart())).toBeNull();
    expect(cursorX(chart({ cursor: 10 }))).not.toBeNull();
  });

  it("puts the cursor line at its minute, and keeps it inside the plot", () => {
    const at = (cursor: number) => cursorX(chart({ cursor }));
    expect(at(20)).toBeGreaterThan(at(10)!);
    expect(at(99)).toBe(at(20));
    expect(at(-5)).toBe(at(0));
  });

  it("draws the line once in one colour, or twice cut at zero with lineBySide", () => {
    expect(chart()).not.toContain("clip-path");
    const html = chart({ lineBySide: true });
    expect(html).toContain('stroke="var(--color-ahead)"');
    expect(html).toContain('stroke="var(--color-behind)"');
    expect(html.match(/clip-path=/g)).toHaveLength(2);
  });
});
