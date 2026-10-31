import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WIN_CHANCE_MODEL } from "@/lib/win-chance";
import { WhatIfCalculator } from "./what-if-calculator";

const allRanks = [{ label: WIN_CHANCE_MODEL.rank, weights: WIN_CHANCE_MODEL.weights }];

describe("WhatIfCalculator", () => {
  // The canvas's check: 20:00, 2,000 gold and 1,000 XP ahead.
  it("starts at 65% with the real model", () => {
    const html = renderToStaticMarkup(<WhatIfCalculator ranks={allRanks} />);
    expect(html).toContain(">65%<");
    expect(html).toContain("20:00");
    expect(html).toContain("+2,000");
    expect(html).toContain("+1,000");
  });

  it("fills the eval bar to the chance in blue, both the tall bar and the phone's", () => {
    const html = renderToStaticMarkup(<WhatIfCalculator ranks={allRanks} />);
    expect(html).toContain("height:65%");
    expect(html).toContain("width:65%");
  });

  it("offers the Baron buff as three pressable buttons, Nobody pressed", () => {
    const html = renderToStaticMarkup(<WhatIfCalculator ranks={allRanks} />);
    const buttons = [
      ...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)</g),
    ].map((m) => [m[2], m[1]]);
    expect(buttons).toEqual([
      ["Your team", "false"],
      ["Nobody", "true"],
      ["Enemy team", "false"],
    ]);
  });
});
