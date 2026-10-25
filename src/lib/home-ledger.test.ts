import { describe, expect, it } from "vitest";
import type { SavedPlayer } from "./saved-players";
import { SAMPLE_MATCH, SAMPLE_MATCH_HREF } from "./sample-match";
import { openerBrief, resolveOpener, staticBriefs } from "./home-ledger";

const caps: SavedPlayer = { region: "euw", gameName: "G2 Caps", tagLine: "1323" };
const lift: SavedPlayer = { region: "na", gameName: "Doublelift", tagLine: "NA1" };

describe("staticBriefs", () => {
  it("points the sample card at the cached match", () => {
    const { sample } = staticBriefs();
    expect(sample.title).toBe("See a sample analysis");
    expect(sample.href).toBe(SAMPLE_MATCH_HREF);
  });

  it("sends the habit card to how the models work, without a made-up rate", () => {
    const { habit } = staticBriefs();
    expect(habit.href).toBe("/how-it-works");
    expect(habit.body).toContain("looking a player up");
    expect(habit.body).not.toMatch(/\d+%/);
  });
});

describe("resolveOpener and openerBrief", () => {
  it("offers Hide on bush when the recent list is empty", () => {
    const brief = openerBrief(resolveOpener([]));
    expect(brief.kicker).toBe("Try a lookup");
    expect(brief.title).toBe("Hide on bush#KR1");
    expect(brief.href).toBe("/player/kr/Hide%20on%20bush-KR1");
  });

  it("returns the same example lookup on a second empty list", () => {
    const first = openerBrief(resolveOpener([]));
    const second = openerBrief(resolveOpener([]));
    expect(second.kicker).toBe(first.kicker);
    expect(second.title).toBe(first.title);
    expect(second.href).toBe(first.href);
    expect(second.kicker).toBe("Try a lookup");
    expect(second.title).toBe("Hide on bush#KR1");
    expect(second.href).toBe("/player/kr/Hide%20on%20bush-KR1");
  });

  it("uses the first recent player, not the second", () => {
    const brief = openerBrief(resolveOpener([caps, lift]));
    expect(brief.kicker).toBe("Recently viewed");
    expect(brief.title).toBe("G2 Caps#1323");
    expect(brief.href).toBe("/player/euw/G2%20Caps-1323");
    expect(brief.title).not.toContain("Doublelift");
    expect(brief.href).not.toContain("Doublelift");
  });

  it("stays recently viewed when the first player is the example account", () => {
    const brief = openerBrief(
      resolveOpener([
        {
          region: SAMPLE_MATCH.region,
          gameName: SAMPLE_MATCH.gameName,
          tagLine: SAMPLE_MATCH.tagLine,
        },
      ]),
    );
    expect(brief.kicker).toBe("Recently viewed");
    expect(brief.title).toBe("Hide on bush#KR1");
    expect(brief.href).toBe("/player/kr/Hide%20on%20bush-KR1");
  });
});
