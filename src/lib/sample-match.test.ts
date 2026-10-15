import { describe, expect, it } from "vitest";
import { isMatchIdFor, isRegion } from "@/lib/regions";
import { fromSlug } from "@/lib/riot-id";
import { SAMPLE_MATCH, SAMPLE_MATCH_HREF } from "@/lib/sample-match";

describe("SAMPLE_MATCH_HREF", () => {
  it("points at a URL the match page accepts", () => {
    const [, player, region, slug, match, matchId] = SAMPLE_MATCH_HREF.split("/");
    expect([player, match]).toEqual(["player", "match"]);
    expect(isRegion(region)).toBe(true);
    expect(isRegion(region) && isMatchIdFor(region, matchId)).toBe(true);
    expect(fromSlug(slug)).toEqual({
      gameName: SAMPLE_MATCH.gameName,
      tagLine: SAMPLE_MATCH.tagLine,
    });
  });
});
