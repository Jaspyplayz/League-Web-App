import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TIERS } from "@/lib/tiers";
import { RankBadge, rankBadgeLabel, rankFullName } from "./rank-badge";
import { RANK_LETTERS, RANK_TINTS } from "./rank-tints";

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// WCAG's relative luminance and contrast ratio.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Where the colour wheel is green: 90 to 170 degrees.
function isGreen(hex: string) {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  if (max !== g || spread === 0) return false;
  const hue = 60 * ((b - r) / spread + 2);
  return hue >= 90 && hue <= 170;
}

describe("rankBadgeLabel", () => {
  it.each([
    ["DIAMOND", "I", "D1"],
    ["EMERALD", "IV", "E4"],
    ["IRON", "III", "I3"],
    ["MASTER", "I", "M"],
    ["GRANDMASTER", "I", "GM"],
    ["CHALLENGER", "I", "C"],
  ] as const)("shows %s %s as %s", (tier, division, label) => {
    expect(rankBadgeLabel({ tier, division })).toBe(label);
  });
});

describe("rankFullName", () => {
  it("spells out the division, except for the top three tiers", () => {
    expect(rankFullName({ tier: "DIAMOND", division: "I" })).toBe("Diamond I");
    expect(rankFullName({ tier: "GRANDMASTER", division: "I" })).toBe("Grandmaster");
  });
});

describe("RankBadge", () => {
  it("shows the tag on the tier's tint, with the full rank on hover", () => {
    const html = renderToStaticMarkup(<RankBadge rank={{ tier: "EMERALD", division: "II" }} />);
    expect(html).toContain('title="Emerald II"');
    expect(html).toContain(">E2<");
    expect(html).toContain(`background-color:${RANK_TINTS.EMERALD}`);
  });

  it("shows a dash when there's no rank on file", () => {
    const html = renderToStaticMarkup(<RankBadge rank={null} />);
    expect(html).toContain(">–<");
    expect(html).not.toContain("background-color");
  });

  it("stays empty while the rank is on its way, so it doesn't look missing", () => {
    expect(renderToStaticMarkup(<RankBadge rank="loading" />)).not.toContain("–");
  });
});

describe("the tier tints", () => {
  it.each(TIERS)("%s's letters are readable on its tint", (tier) => {
    expect(contrast(RANK_TINTS[tier], RANK_LETTERS)).toBeGreaterThanOrEqual(4.5);
  });

  it("has emerald as its only green", () => {
    expect(TIERS.filter((tier) => isGreen(RANK_TINTS[tier]))).toEqual(["EMERALD"]);
  });
});
